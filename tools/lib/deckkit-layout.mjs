import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// Maintainer policy: keep suite ownership visible without loading kit code.
export function auditDeckkitLayout(skillRoot) {
  const root = join(skillRoot, 'assets/deckkits')
  const issues = []
  const fail = (path, message) =>
    issues.push({
      severity: 'error',
      code: 'deckkit-layout',
      path: relative(skillRoot, path).replaceAll('\\', '/'),
      message,
    })
  const requireFile = (path) => {
    if (!existsSync(path) || !statSync(path).isFile())
      fail(path, 'required DeckKit file is missing')
  }
  const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))
  const ids = new Set(catalog.entries.map((e) => e.id))
  if (ids.size !== catalog.entries.length) fail(join(root, 'catalog.json'), 'duplicate DeckKit ids')
  const rootFiles = new Set(['README.md', 'catalog.json', 'validate-content.mjs'])
  for (const file of readdirSync(root, { withFileTypes: true })) {
    const valid = file.isDirectory()
      ? ids.has(file.name) || ['shared', 'schemas'].includes(file.name)
      : rootFiles.has(file.name)
    if (!valid)
      fail(join(root, file.name), 'place suite files under <id>/ and common modules under shared/')
  }
  for (const name of rootFiles) requireFile(join(root, name))
  const schemas = join(root, 'schemas')
  for (const name of ['content.schema.json', 'design.schema.json']) requireFile(join(schemas, name))
  if (existsSync(schemas))
    for (const name of readdirSync(schemas)) {
      if (!['content.schema.json', 'design.schema.json'].includes(name))
        fail(join(schemas, name), 'suite schemas belong under <id>/schemas/')
    }
  const shared = join(root, 'shared')
  if (!existsSync(shared)) fail(shared, 'shared runtime directory is missing')
  else
    for (const file of readdirSync(shared, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.mjs'))
        fail(join(shared, file.name), 'shared/ contains only common runtime modules')
    }
  const examplePaths = (value) => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(examplePaths)
    if (!value || typeof value !== 'object') return []
    return Object.entries(value).flatMap(([k, v]) =>
      ['content', 'build', 'contentPath', 'buildPath', 'choreographyPath'].includes(k)
        ? examplePaths(v)
        : [],
    )
  }
  for (const entry of catalog.entries) {
    const { id } = entry
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      fail(root, `invalid DeckKit id: ${id}`)
      continue
    }
    const suite = join(root, id)
    if (entry.path !== `${id}/${id}.kit.mjs`)
      fail(join(root, 'catalog.json'), `${id}: path must be <id>/<id>.kit.mjs`)
    if (entry.designContract !== `${id}/design.json`)
      fail(join(root, 'catalog.json'), `${id}: designContract must be <id>/design.json`)
    for (const name of [
      `${id}.kit.mjs`,
      'design.json',
      'intent.md',
      'layouts.mjs',
      'examples/content.json',
      'examples/build.mjs',
    ])
      requireFile(join(suite, name))
    for (const type of entry.supportedSlideTypes ?? [])
      requireFile(join(suite, 'schemas', `${type}.schema.json`))
    for (const path of examplePaths(entry.examples)) {
      if (
        !path.startsWith(`${id}/examples/`) ||
        relative(join(suite, 'examples'), resolve(root, path)).startsWith('..')
      )
        fail(join(root, 'catalog.json'), `${id}: example paths must stay under <id>/examples/`)
      else requireFile(resolve(root, path))
    }
    if (!existsSync(suite)) continue
    const modules = new Set([
      `${id}.kit.mjs`,
      'components.mjs',
      'layouts.mjs',
      'registry.mjs',
      'exhibit.mjs',
      'atmosphere.mjs',
    ])
    for (const file of readdirSync(suite, { withFileTypes: true })) {
      const path = join(suite, file.name)
      if (file.isDirectory()) {
        if (!['schemas', 'examples'].includes(file.name))
          fail(path, 'suite subdirectories are schemas/ and examples/')
      } else if (
        !modules.has(file.name) &&
        file.name !== 'design.json' &&
        !/^[a-z0-9-]+\.md$/.test(file.name)
      ) {
        fail(path, 'use standard suite module names without repeating the suite prefix')
      }
      if (!file.isFile() || !file.name.endsWith('.mjs')) continue
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
        const target = resolve(dirname(path), match[1])
        const owner = relative(root, target).split(/[\\/]/)[0]
        if (ids.has(owner) && owner !== id)
          fail(path, 'suite modules must share helpers through shared/, not import another suite')
      }
    }
  }
  return issues
}
