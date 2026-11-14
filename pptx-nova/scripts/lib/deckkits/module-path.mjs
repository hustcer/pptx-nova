import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { SKILL_ROOT } from '../runtime/skill-paths.mjs'

// The installed catalog selects bundled code; content must never supply a module
// path. This is a path boundary, not a sandbox for a compromised installation.
export function deckkitModulePath(entry, root = join(SKILL_ROOT, 'assets', 'deckkits')) {
  if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id))
    throw new Error('DeckKit module requires a registered kebab-case id')
  const expected = `${entry.id}/${entry.id}.kit.mjs`
  if (entry.path !== expected)
    throw new Error(`DeckKit "${entry.id}" module path must be ${expected}`)

  const physicalRoot = realpathSync.native(root)
  const target = join(physicalRoot, entry.id, `${entry.id}.kit.mjs`)
  const physicalTarget = realpathSync.native(target)
  const local = relative(join(physicalRoot, entry.id), physicalTarget)
  if (!local || isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`))
    throw new Error(`DeckKit "${entry.id}" module must remain inside its bundled directory`)
  if (!statSync(physicalTarget).isFile())
    throw new Error(`DeckKit "${entry.id}" module must be a regular file`)
  return physicalTarget
}
