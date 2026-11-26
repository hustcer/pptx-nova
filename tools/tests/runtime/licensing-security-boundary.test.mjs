import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')

function readSkill(relativePath) {
  return readFileSync(join(skillRoot, relativePath), 'utf8')
}

test('SKILL.md directly discloses credential, local-config, and bounded-retrieval boundaries', () => {
  const skill = readSkill('SKILL.md')

  // Credential isolation (W007): visible directly inside SKILL.md without relying on external references.
  assert.match(skill, /## Credential and Local Config Boundary/)
  assert.match(
    skill,
    /Never read, open, print, quote, paste, log, or embed raw license JSON contents, signatures, private keys, or `\.env`\/environment secrets in model context/,
  )
  assert.match(
    skill,
    /Pass any user-supplied license file \*\*by file path only\*\* to local `xdoc auth` CLI commands/,
  )
  assert.match(skill, /inspect or report only non-secret structured metadata/)

  // User-scoped config only, no OS service/runtime modification (W013).
  assert.match(
    skill,
    /Ordinary PPTX tasks never inspect or modify license files or environment configuration/,
  )
  assert.match(skill, /writes only a single user-owned CLI config file/)
  assert.match(
    skill,
    /Never use `sudo` or elevated privileges, never install or modify OS system services/,
  )
  assert.match(skill, /never autonomously download or install the `xdoc` binary/)
  assert.doesNotMatch(skill, /install for the actual execution user\/environment/i)
  assert.doesNotMatch(skill, /activate xdoc/i)

  // Bounded retrieval and no exfiltration visible directly in SKILL.md (W011).
  assert.match(
    skill,
    /Retrieve only user-selected, task-authorized sources via HTTP\(S\) or local paths/,
  )
  assert.match(
    skill,
    /do not recursively fetch embedded links\/citations or send local files, credentials, or context to external endpoints/,
  )
})

test('licensing reference enforces no-raw-credential-in-context and user-scoped boundaries', () => {
  const licensing = readSkill('references/runtime/licensing.md')

  assert.match(licensing, /## Credential and Host Boundaries/)
  assert.match(licensing, /Never load raw credential contents into model context/)
  assert.match(
    licensing,
    /Pass the user-provided license file \*\*by file path only\*\* to local `xdoc auth` CLI commands/,
  )
  assert.match(licensing, /do not autonomously download binaries or run remote installer scripts/)
  assert.match(licensing, /never uses `sudo` or modifies OS system services or system directories/)
  assert.match(licensing, /local user-scoped `xdoc` process, never an OS system service/)
  assert.match(licensing, /never read raw license file contents into model context/)
})
