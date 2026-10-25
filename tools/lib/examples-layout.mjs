import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export function auditExamplesLayout(skillRoot) {
  const root = join(skillRoot, 'assets/examples')
  const issues = []
  const fail = (path, message) =>
    issues.push({
      severity: 'error',
      code: 'examples-layout',
      path: relative(skillRoot, path).replaceAll('\\', '/'),
      message,
    })
  const requireFile = (path) => {
    if (!existsSync(path) || !statSync(path).isFile())
      fail(path, 'required example file is missing')
  }
  const groups = {
    generator: ['README.md', 'deck-generator-template.mjs', 'theme-packs.generated.mjs'],
    create: ['README.md', 'qbr-outline.json', 'quarterly-report.patch.json'],
    edit: ['README.md', 'edit-title.patch.json', 'micro-edit-matrix.json'],
  }
  requireFile(join(root, 'README.md'))
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      entry.isDirectory()
        ? ![...Object.keys(groups), 'deckkits'].includes(entry.name)
        : entry.name !== 'README.md'
    )
      fail(join(root, entry.name), 'group examples under deckkits/, generator/, create/ or edit/')
  }
  for (const [group, files] of Object.entries(groups)) {
    const dir = join(root, group)
    for (const file of files) requireFile(join(dir, file))
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir))
      if (!files.includes(file))
        fail(join(dir, file), 'register new scenario files in the examples layout policy')
  }
  const showcases = join(root, 'deckkits')
  for (const file of ['README.md', 'manifest.json']) requireFile(join(showcases, file))
  const manifestPath = join(showcases, 'manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const ids = new Set(manifest.examples.map((entry) => entry.deckkit))
    for (const entry of manifest.examples) {
      const dir = join(showcases, entry.deckkit)
      for (const file of [
        'deck.pptx',
        'contact-sheet.webp',
        'content.json',
        'brief.md',
        'summary.json',
      ])
        requireFile(join(dir, file))
      for (const file of Object.values(entry.files)) {
        const local = relative(dir, resolve(showcases, file.path))
        if (
          local === '..' ||
          local.startsWith('../') ||
          local.startsWith('..\\') ||
          isAbsolute(local)
        )
          fail(manifestPath, 'showcase file paths must stay under the owning DeckKit directory')
        else requireFile(resolve(showcases, file.path))
      }
    }
    for (const entry of readdirSync(showcases, { withFileTypes: true })) {
      if (
        entry.isDirectory()
          ? !ids.has(entry.name)
          : !['README.md', 'manifest.json'].includes(entry.name)
      )
        fail(join(showcases, entry.name), 'showcases must be registered in deckkits/manifest.json')
    }
  }
  return issues
}
