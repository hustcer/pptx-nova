#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_ROOT = join(REPO_ROOT, 'tools/tests')
const usage = `Usage: node tools/run-tests.mjs [--list] [group-or-test...] [-- node-test-options...]

Discover *.test.mjs recursively under tools/tests, excluding fixtures/ and helpers/.
Optional selectors are relative to tools/tests. Node test options follow --.
Examples:
  node tools/run-tests.mjs
  node tools/run-tests.mjs deckkits
  node tools/run-tests.mjs --list workflows
  node tools/run-tests.mjs -- --test-name-pattern=readiness
`

export function discoverTests(root) {
  root = resolve(root)
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      if (['helpers', 'fixtures'].includes(entry.name) || entry.name.startsWith('.')) return []
      const path = join(root, entry.name)
      if (entry.isDirectory()) return discoverTests(path)
      return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : []
    })
    .sort()
}

export function selectTests(root, selectors = []) {
  root = resolve(root)
  const files = discoverTests(root)
  if (!selectors.length) return files
  const selected = new Set()
  for (const selector of selectors) {
    const path = resolve(root, selector)
    const local = relative(resolve(root), path)
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
      throw Error(`Test selector must stay under tools/tests: ${selector}`)
    const directory = statSync(path).isDirectory()
    const matches = files.filter((file) =>
      directory ? file.startsWith(path + sep) : file === path,
    )
    if (!matches.length) throw Error(`No test files matched: ${selector}`)
    for (const file of matches) selected.add(file)
  }
  return [...selected].sort()
}

function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(usage)
    return 0
  }
  const split = argv.indexOf('--')
  const selectors = split === -1 ? argv : argv.slice(0, split)
  const nodeOptions = split === -1 ? [] : argv.slice(split + 1)
  const list = selectors.includes('--list')
  const paths = selectors.filter((value) => value !== '--list')
  if (paths.some((value) => value.startsWith('-'))) throw Error('Pass Node test options after --')
  const files = selectTests(TEST_ROOT, paths)
  if (!files.length) throw Error('No test files discovered')
  if (list) {
    process.stdout.write(
      files.map((file) => relative(REPO_ROOT, file).replaceAll('\\', '/')).join('\n') + '\n',
    )
    return 0
  }
  const result = spawnSync(process.execPath, ['--test', ...nodeOptions, ...files], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
