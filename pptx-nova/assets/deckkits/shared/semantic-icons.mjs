import { createHash } from 'node:crypto'
import {
  getTablerIconAsset,
  addTablerIconPicture,
  DEFAULT_DECKKIT_ICON_STROKE,
} from './icon-assets.kit.mjs'
import { fitTextPlan } from './text-layout.mjs'

const get = (value, path) => path.split('.').reduce((v, key) => v?.[key], value)
const owner = (op) => op.name ?? op.shape?.name
const frame = (op) => [op.x, op.y, op.w, op.h].map(parseFloat)
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const iconColor = (binding, item) =>
  item?.focus && binding.focusColor ? binding.focusColor : binding.color

export function assertSemanticIconPolicy(design) {
  const policy = design.semanticIcons
  if (!policy) return
  const types = new Set(Object.values(design).flatMap((v) => Object.keys(v?.families ?? {})))
  const seen = new Set()
  for (const b of policy.bindings) {
    const key = `${b.slideType}:${b.items}`
    if (!types.has(b.slideType) || seen.has(key))
      throw Error(`Invalid semantic icon binding ${key}`)
    seen.add(key)
    for (const color of [b.color, b.focusColor].filter(Boolean))
      if (!Object.hasOwn(design.colors, color)) throw Error(`Unknown semantic icon color ${color}`)
    if (!b.target.includes('{i}')) throw Error(`${key}: marker target requires {i}`)
    if (b.placement === 'inset' && !(b.gapIn > 0))
      throw Error(`${key}: inset requires a positive gap`)
  }
}

function entries(design, content) {
  const out = []
  for (const [slide, input] of content.slides.entries()) {
    for (const [bindingIndex, binding] of (design.semanticIcons?.bindings ?? []).entries()) {
      if (input.type !== binding.slideType) continue
      const items = get(input.data, binding.items)
      if (!Array.isArray(items))
        throw Error(`slides[${slide}].data.${binding.items}: icon owner array required`)
      const parallel = binding.iconArray ? get(input.data, binding.iconArray) : undefined
      if (parallel !== undefined && (!Array.isArray(parallel) || parallel.length !== items.length))
        throw Error(
          `slides[${slide}].data.${binding.iconArray}: icon count must match ${binding.items}`,
        )
      for (const [i, item] of items.entries()) {
        const icon = binding.iconArray ? parallel?.[i] : item?.icon
        if (icon === undefined) continue
        const path = `slides[${slide}].data.${binding.iconArray ? `${binding.iconArray}[${i}]` : `${binding.items}[${i}].icon`}`
        try {
          getTablerIconAsset(icon, { style: 'outline' })
        } catch (error) {
          throw Error(`${path}: ${error.message}`)
        }
        out.push({
          slide,
          bindingIndex,
          binding,
          item,
          i,
          icon,
          path,
          target: binding.target.replace('{i}', String(i)),
        })
      }
    }
  }
  return out
}

function insetText(text, bounds, style, binding, path) {
  const advance = binding.sizeIn + binding.gapIn
  const next = [bounds[0] + advance, bounds[1], bounds[2] - advance, bounds[3]]
  if (style.paragraphStyles) {
    const height = text
      .split(/\r\n|\r|\n/)
      .reduce(
        (sum, line, i) =>
          sum + fitTextPlan(line, next, style.paragraphStyles[i] ?? style, path).requiredHeight,
        0,
      )
    if (height > next[3] + 0.002)
      throw Error(
        `${path}: icon inset exceeds paragraph capacity; select a fitting layout or split`,
      )
  } else fitTextPlan(text, next, style, path)
  return next
}

// Validation uses the resolved text owners before rendering. Legacy adapters only
// register replacement markers, so they do not need text-capacity adjustments.
export function validateSemanticIconContent(design, content, layouts = []) {
  for (const e of entries(design, content)) {
    if (e.binding.placement !== 'inset') continue
    const targets = [
      e.target,
      ...(e.binding.alternates ?? []).map((name) => name.replace('{i}', String(e.i))),
    ]
    const c = layouts[e.slide]?.components?.find((v) => targets.includes(v.name))
    if (!c) throw Error(`${e.path}: registered icon text owner ${e.target} is missing`)
    insetText(
      c.text,
      c.frame,
      { ...c.style, paragraphStyles: c.paragraphStyles },
      e.binding,
      e.path,
    )
  }
}

export function isSemanticIconOp(design, op) {
  if (op.op !== 'add-image') return false
  const m = /^S(\d+)_SemanticIcon_b(\d+)_i\d+_([a-z0-9-]+)$/.exec(op.name ?? '')
  const b = m && design.semanticIcons?.bindings[Number(m[2])]
  if (!b || op.mimeType !== 'image/svg+xml' || op.assetSource || op.path) return false
  if (
    Number(m[1]) !== op.slide ||
    Object.keys(op).some(
      (key) =>
        !['op', 'slide', 'name', 'x', 'y', 'w', 'h', 'mimeType', 'bytesBase64'].includes(key),
    )
  )
    return false
  if (![op.x, op.y, op.w, op.h].every((v) => typeof v === 'string' && /^\d+(?:\.\d+)?in$/.test(v)))
    return false
  if (Math.abs(parseFloat(op.w) - b.sizeIn) > 1e-8 || Math.abs(parseFloat(op.h) - b.sizeIn) > 1e-8)
    return false
  return [b.color, b.focusColor].filter(Boolean).some((color) => {
    try {
      return (
        op.bytesBase64 ===
        getTablerIconAsset(m[3], {
          style: 'outline',
          color: design.colors[color],
          strokeWidth: DEFAULT_DECKKIT_ICON_STROKE,
        }).bytesBase64
      )
    } catch {
      return false
    }
  })
}

// Registered marker lowering is part of the design compiler, before design
// checking, plan hashing and readback capture. Bindings belong to design.json;
// content supplies icon names only. No arbitrary geometry or SVG is accepted.
export function compileSemanticIcons(design, content, patch, layouts) {
  for (const e of entries(design, content)) {
    const { binding: b, slide } = e
    const targets = [
      e.target,
      ...(b.alternates ?? []).map((name) => name.replace('{i}', String(e.i))),
    ].map((name) => `S${slide}_${name}`)
    const created = patch.ops.filter(
      (op) =>
        op.slide === slide &&
        targets.includes(op.name) &&
        ['add-text-box', 'add-shape'].includes(op.op),
    )
    if (created.length !== 1)
      throw Error(`${e.path}: expected one registered marker ${targets.join(' or ')}`)
    const marker = created[0],
      bounds = frame(marker),
      target = marker.name,
      targetBase = target.replace(/^S\d+_/, '')
    let x = bounds[0],
      y = bounds[1] + 0.01
    const index = patch.ops.indexOf(marker)
    if (b.placement === 'inset') {
      const text = patch.ops.find(
        (op) => op.slide === slide && owner(op) === target && typeof op.text === 'string',
      )?.text
      const font = patch.ops.find(
        (op) => op.slide === slide && owner(op) === target && op.op === 'set-run',
      )?.font
      if (typeof text !== 'string' || !font)
        throw Error(`${e.path}: icon inset requires an explicit text/font owner`)
      const style = { sizePt: parseFloat(font.size), bold: font.bold ?? false }
      const original = layouts[slide]?.components?.find((v) => v.name === targetBase)
      if (original?.paragraphStyles) style.paragraphStyles = original.paragraphStyles
      const next = insetText(text, bounds, style, b, e.path)
      marker.x = `${next[0]}in`
      marker.w = `${next[2]}in`
      y = bounds[1] + Math.max(0, (Math.min(bounds[3], (style.sizePt * 1.35) / 72) - b.sizeIn) / 2)
      const c = layouts[slide]?.components?.find((v) => v.name === targetBase)
      if (c) c.frame = next
    } else {
      patch.ops = patch.ops.filter((op) => !(op.slide === slide && owner(op) === target))
      const components = layouts[slide]?.components
      if (components) layouts[slide].components = components.filter((c) => c.name !== targetBase)
    }
    const name = `S${slide}_SemanticIcon_b${e.bindingIndex}_i${e.i}_${e.icon}`
    const ops = []
    addTablerIconPicture(ops, slide, name, e.icon, x, y, b.sizeIn, b.sizeIn, {
      style: 'outline',
      color: design.colors[iconColor(b, e.item)],
    })
    patch.ops.splice(index, 0, ...ops)
    const layout = layouts[slide]
    if (layout) {
      const icon = {
        kind: 'semantic-icon',
        name: name.replace(/^S\d+_/, ''),
        frame: [x, y, b.sizeIn, b.sizeIn],
        icon: e.icon,
        color: iconColor(b, e.item),
        path: e.path,
        replaces: b.placement === 'replace' ? targetBase : undefined,
      }
      ;(layout.semanticIcons ??= []).push(icon)
      layout.fingerprint = digest({ original: layout.fingerprint, icon })
    }
  }
  return patch
}
