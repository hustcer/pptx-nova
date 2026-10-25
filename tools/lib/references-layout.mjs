import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

const GROUPS = new Set([
  'create',
  'edit',
  'translation',
  'runtime',
  'review',
  'content',
  'policies',
])
const TEXT_EXTENSIONS = new Set(['.md', '.mjs', '.nu', '.json', '.html', '.svg', '.yml', '.yaml'])
const portable = (path) => path.replaceAll('\\', '/')
const inside = (root, path) => path === root || path.startsWith(root + '/')

function filesUnder(path) {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return []
    const child = join(path, entry.name)
    return entry.isDirectory() ? filesUnder(child) : entry.isFile() ? [child] : []
  })
}

// Accept additional repository docs to check callers outside the published skill.
export function auditReferencesLayout(skillRoot, { sourceRoots = [] } = {}) {
  skillRoot = resolve(skillRoot)
  const root = join(skillRoot, 'references')
  const issues = []
  const fail = (path, message) =>
    issues.push({
      severity: 'error',
      code: 'references-layout',
      path: portable(relative(skillRoot, path)),
      message,
    })
  if (!existsSync(root)) {
    fail(root, 'reference directory is missing')
    return issues
  }
  for (const name of ['README.md', 'common-workflow.md']) {
    if (!existsSync(join(root, name))) fail(join(root, name), 'shared reference entry is missing')
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!GROUPS.has(entry.name)) fail(path, 'group references by the documented workflow domains')
      for (const file of readdirSync(path, { withFileTypes: true })) {
        if (!file.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file.name))
          fail(join(path, file.name), 'use kebab-case Markdown files directly inside each domain')
      }
    } else if (!entry.isFile() || !['README.md', 'common-workflow.md'].includes(entry.name)) {
      fail(path, 'keep only the index and common workflow at the reference root')
    }
  }

  const references = new Set(filesUnder(root).map((path) => resolve(path)))
  const names = new Set([...references].map((path) => basename(path)))
  const graph = new Map()
  const rootPortable = portable(root)
  const skillPortable = portable(skillRoot)
  const files = new Set(
    [skillRoot, ...sourceRoots].flatMap(filesUnder).map((path) => resolve(path)),
  )
  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(extname(file))) continue
    const source = readFileSync(file, 'utf8')
    const local = inside(rootPortable, portable(file))
    const edges = new Set()
    graph.set(file, edges)
    const check = (target, label, required = false) => {
      target = resolve(target)
      const isReference = inside(rootPortable, portable(target))
      if (!isReference && !required) return
      if (!existsSync(target) || !statSync(target).isFile()) {
        fail(file, `reference target does not exist: ${label}`)
      } else if (isReference) edges.add(target)
    }
    // Published requiredReferences paths and skill-root paths in prose or examples.
    for (const [token] of source.matchAll(
      /(?:[A-Za-z0-9_.-]+\/)*references\/[A-Za-z0-9_./-]+\.md/g,
    )) {
      const prefix = 'pptx-nova/references/'
      if (token.includes(prefix)) {
        check(join(root, token.slice(token.lastIndexOf(prefix) + prefix.length)), token, true)
      } else if (token.startsWith('references/') && inside(skillPortable, portable(file))) {
        check(join(skillRoot, token), token, true)
      } else if (token.startsWith('../')) {
        check(resolve(dirname(file), token), token)
      }
    }
    if (extname(file) !== '.md') continue
    // Real Markdown links resolve against the containing document, including cross-domain links.
    for (const match of source.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0]
      if (!target || /^[a-z]+:|^<|^\//i.test(target)) continue
      check(resolve(dirname(file), target), target, local)
    }
    // Inline reading instructions are also paths, even when they are not clickable links.
    if (local) {
      for (const [, token] of source.matchAll(/`([^`\n]+)`/g)) {
        const target = token.split('#')[0]
        if (
          !target.startsWith('references/') &&
          /^(?:\.{1,2}\/)*[a-z0-9/-]+\.md$/.test(target) &&
          names.has(basename(target))
        ) {
          check(resolve(dirname(file), target), token, true)
        }
      }
    }
  }
  const reached = new Set()
  const visit = (file) => {
    if (reached.has(file)) return
    reached.add(file)
    for (const target of graph.get(file) ?? []) visit(target)
  }
  visit(join(skillRoot, 'SKILL.md'))
  for (const file of references) {
    if (!reached.has(file))
      fail(file, 'reference is unreachable from SKILL.md and its reading routes')
  }
  return issues
}
