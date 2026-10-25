import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export function auditScriptsLayout(skillRoot) {
  const root = join(skillRoot, 'scripts')
  const issues = []
  const fail = (path, message) =>
    issues.push({
      severity: 'error',
      code: 'scripts-layout',
      path: relative(skillRoot, path).replaceAll('\\', '/'),
      message,
    })
  for (const file of readdirSync(root, { withFileTypes: true })) {
    if (file.isDirectory() ? !['cli', 'lib'].includes(file.name) : file.name !== 'README.md')
      fail(
        join(root, file.name),
        'place CLI entries under cli/<workflow>/ and internal modules under lib/<domain>/',
      )
  }
  for (const role of ['cli', 'lib']) {
    const base = join(root, role)
    if (!existsSync(base)) {
      fail(base, 'script role directory is missing')
      continue
    }
    for (const group of readdirSync(base, { withFileTypes: true })) {
      const dir = join(base, group.name)
      if (!group.isDirectory() || !/^[a-z]+(?:-[a-z]+)*$/.test(group.name)) {
        fail(dir, 'group scripts by workflow or domain')
        continue
      }
      for (const file of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, file.name)
        const optionalNu = role === 'cli' && group.name === 'office' && file.name.endsWith('.nu')
        if (
          !file.isFile() ||
          (!file.name.endsWith('.mjs') && !optionalNu) ||
          file.name.startsWith('pptx-nova-')
        ) {
          fail(path, 'use concise module names; optional Nu integrations belong under cli/office/')
          continue
        }
        if (!file.name.endsWith('.mjs')) continue
        const source = readFileSync(path, 'utf8')
        if (role === 'lib' && /if\s*\(\s*process\.argv\[1\]/.test(source))
          fail(path, 'internal modules must not execute a CLI when loaded as a script')
        for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
          const target = resolve(dirname(path), match[1])
          if (!existsSync(target)) fail(path, `module import does not exist: ${match[1]}`)
          if (role === 'lib' && relative(root, target).replaceAll('\\', '/').startsWith('cli/'))
            fail(path, 'internal modules must not depend on CLI entries')
        }
      }
    }
  }
  return issues
}
