#!/usr/bin/env node
// pptx-nova-deckkit-slot-consistency.mjs — DeckKit 槽位渲染覆盖守卫
//
// 检查目标：schema 声明的每个文本槽位都必须能影响 createDeck 的 patch 输出，
// 杜绝 "validate 通过但渲染静默丢弃" 的幽灵槽位（ghost slot）。
//
// 原理：为每个 slideType 构造探针 content，把所有可检查的 string 槽位填入唯一
// 哨兵 token，渲染为 patch 后断言每个哨兵出现在 JSON.stringify(patch) 中。
//
// schema 注解（按需标注，避免误报）：
//   x-slotRole: "control"        布局/匹配控制值（如 calloutHighlights、align），不要求出现在输出文本中
//   x-slotFallbackOf: "<field>"  本槽位是同级 <field> 的回退别名；用移除 <field> 的 solo 探针复验
//   enum 槽位与非 string 槽位自动跳过；无 properties 的 object/array（动态结构）记为 dynamic 并跳过
//
// 用法：
//   node <skill-root>/scripts/pptx-nova-deckkit-slot-consistency.mjs [--deckkit <id>] [--json]
// 退出码：发现 ghost slot 或渲染失败时为 1，可直接用作 CI / deckkit-examples 门禁。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillRoot = resolve(__dirname, '..')
const deckkitRoot = join(skillRoot, 'assets', 'deckkits')
const schemasRoot = join(deckkitRoot, 'schemas')

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-deckkit-slot-consistency.mjs [--deckkit <id>] [--json]

Options:
  --deckkit <id>   Only check this DeckKit. Default: all catalog entries.
  --json           Machine-readable report.
  --help           Show this help.
`

// 这些字段名是公认的控制值（被消费为布局参数/查找键，而不是输出文本）
const CONTROL_FIELD_NAMES = new Set(['key', 'accent', 'color', 'tone', 'id', 'slotId'])

function parseArgs(argv) {
  const args = { deckkit: '', json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--deckkit') {
      args.deckkit = argv[i + 1] ?? ''
      i += 1
    } else if (arg === '--json') {
      args.json = true
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }
  return args
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function loadSlideSchema(deckkit, slideType) {
  const deckkitSchema = join(schemasRoot, deckkit, `${slideType}.schema.json`)
  if (existsSync(deckkitSchema)) return readJson(deckkitSchema)
  const globalSchema = join(schemasRoot, `${slideType}.schema.json`)
  if (existsSync(globalSchema)) return readJson(globalSchema)
  return null
}

let tokenCounter = 0
function nextToken() {
  tokenCounter += 1
  return `SLOTPROBE${String(tokenCounter).padStart(3, '0')}END`
}

// 返回 { value, sentinels: [{path, token, fallbackOf}], dynamics: [path] }
function buildProbe(schema, basePath) {
  const sentinels = []
  const dynamics = []

  function fillObject(objSchema, path) {
    const out = {}
    for (const [field, fieldSchema] of Object.entries(objSchema.properties ?? {})) {
      const fieldPath = `${path}.${field}`
      const value = fillField(field, fieldSchema, fieldPath)
      if (value !== undefined) out[field] = value
    }
    return out
  }

  function fillField(field, fieldSchema, path, inheritedSlotRole = null) {
    const type = Array.isArray(fieldSchema.type) ? fieldSchema.type[0] : fieldSchema.type
    const slotRole = fieldSchema['x-slotRole'] ?? inheritedSlotRole
    if (fieldSchema.enum) return fieldSchema.enum[0]
    if (type === 'string') {
      if (slotRole === 'control' || CONTROL_FIELD_NAMES.has(field)) {
        return `probe-${field}`
      }
      const token = nextToken()
      sentinels.push({ path, token, fallbackOf: fieldSchema['x-slotFallbackOf'] ?? null })
      return token
    }
    if (type === 'number' || type === 'integer') return 1
    if (type === 'boolean') return false
    if (type === 'array') {
      const itemSchema = fieldSchema.items
      if (!itemSchema) {
        dynamics.push(path)
        return []
      }
      const min = fieldSchema.minItems ?? 0
      const max = fieldSchema.maxItems ?? Infinity
      const count = max === 0 ? 0 : Math.max(Math.min(2, max), min, 1)
      if (Array.isArray(itemSchema)) {
        return itemSchema.map((tupleSchema, i) =>
          fillField(`${field}${i}`, tupleSchema, `${path}[${i}]`, slotRole),
        )
      }
      return Array.from({ length: count }, (_, i) =>
        fillField(field, itemSchema, `${path}[${i}]`, slotRole),
      )
    }
    if (type === 'object') {
      if (fieldSchema.properties) return fillObject(fieldSchema, path)
      dynamics.push(path)
      return {}
    }
    dynamics.push(path)
    return undefined
  }

  const value = fillObject(schema, basePath)
  return { value, sentinels, dynamics }
}

function renderPatchText(mod, deckkit, slideType, data) {
  const result = mod.createDeck({ meta: { deckkit }, slides: [{ type: slideType, data }] })
  return JSON.stringify(result?.patch ?? result)
}

async function checkDeckkit(entry) {
  const modulePath = join(deckkitRoot, entry.path)
  const mod = await import(pathToFileURL(modulePath).href)
  if (typeof mod.createDeck !== 'function') {
    return { deckkit: entry.id, error: 'no createDeck export', slideTypes: [] }
  }
  const slideTypes = entry.supportedSlideTypes ?? []
  const report = []
  for (const slideType of slideTypes) {
    const schema = loadSlideSchema(entry.id, slideType)
    if (!schema) {
      report.push({ slideType, status: 'no-schema', ghosts: [], dynamics: [] })
      continue
    }
    const { value, sentinels, dynamics } = buildProbe(schema, 'data')
    let text
    try {
      text = renderPatchText(mod, entry.id, slideType, value)
    } catch (error) {
      const stackTop = String(error.stack ?? '')
        .split('\n')
        .slice(1, 3)
        .map((line) => line.trim())
        .join(' <- ')
      report.push({
        slideType,
        status: 'render-error',
        error: stackTop ? `${error.message} (${stackTop})` : error.message,
        ghosts: [],
        dynamics,
      })
      continue
    }
    const ghosts = []
    for (const sentinel of sentinels) {
      if (text.includes(sentinel.token)) continue
      if (sentinel.fallbackOf) {
        // 回退别名：移除其回退目标后 solo 复验。
        // fallbackOf 支持顶层字段（"title"）和嵌套 item 字段（"cards[].sampleText"）。
        const soloData = JSON.parse(JSON.stringify(value))
        const nested = sentinel.fallbackOf.match(/^([A-Za-z0-9_]+)\[\]\.([A-Za-z0-9_]+)$/)
        if (nested) {
          const arr = soloData[nested[1]]
          if (Array.isArray(arr)) for (const item of arr) delete item?.[nested[2]]
        } else {
          delete soloData[sentinel.fallbackOf]
        }
        try {
          const soloText = renderPatchText(mod, entry.id, slideType, soloData)
          if (soloText.includes(sentinel.token)) continue
        } catch {
          // solo 渲染失败也算 ghost，下面统一记录
        }
      }
      ghosts.push(sentinel.path)
    }
    report.push({
      slideType,
      status: ghosts.length > 0 ? 'ghost-slots' : 'ok',
      ghosts,
      dynamics,
    })
  }
  return { deckkit: entry.id, slideTypes: report }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const catalog = readJson(join(deckkitRoot, 'catalog.json'))
  const entries = catalog.entries.filter((entry) => !args.deckkit || entry.id === args.deckkit)
  if (entries.length === 0) {
    throw new Error(
      `DeckKit "${args.deckkit}" not found. Available: ${catalog.entries.map((e) => e.id).join(', ')}`,
    )
  }
  const results = []
  for (const entry of entries) {
    results.push(await checkDeckkit(entry))
  }
  const failed = results.some(
    (kit) =>
      kit.error ||
      kit.slideTypes.some(
        (slide) => slide.status === 'ghost-slots' || slide.status === 'render-error',
      ),
  )
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: !failed, results }, null, 2)}\n`)
  } else {
    for (const kit of results) {
      console.log(`# ${kit.deckkit}`)
      if (kit.error) {
        console.log(`  [error] ${kit.error}`)
        continue
      }
      for (const slide of kit.slideTypes) {
        if (slide.status === 'ok') {
          const dyn =
            slide.dynamics.length > 0 ? ` (dynamic skipped: ${slide.dynamics.join(', ')})` : ''
          console.log(`  ok            ${slide.slideType}${dyn}`)
        } else if (slide.status === 'no-schema') {
          console.log(`  no-schema     ${slide.slideType}`)
        } else if (slide.status === 'render-error') {
          console.log(`  render-error  ${slide.slideType}: ${slide.error}`)
        } else {
          console.log(`  GHOST-SLOTS   ${slide.slideType}: ${slide.ghosts.join(', ')}`)
        }
      }
    }
    console.log(
      failed
        ? '\nFAILED: ghost slots or render errors found.'
        : '\nAll declared slots reach the rendered patch.',
    )
  }
  process.exit(failed ? 1 : 0)
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
