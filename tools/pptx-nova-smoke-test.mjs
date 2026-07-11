#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const SKILL_ROOT = resolve(REPO_ROOT, 'pptx-nova')
const TMP_ROOT = mkdtempSync(join(tmpdir(), 'pptx-nova-smoke-'))

const checks = []

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: SKILL_ROOT,
    encoding: 'utf8',
    ...options,
  })
  checks.push({
    name,
    command: [command, ...args].join(' '),
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  })
  if (result.status !== 0) {
    throw new Error(`${name} failed\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function runJson(name, command, args) {
  const stdout = run(name, command, args)
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${name} did not return JSON: ${error.message}`)
  }
}

const contentPath = join(SKILL_ROOT, 'assets/examples/consulting-dark/content.json')
const validateScript = join(SKILL_ROOT, 'assets/deckkits/validate-content.mjs')
const buildScript = join(SKILL_ROOT, 'scripts/pptx-nova-build.mjs')
const iconsScript = join(SKILL_ROOT, 'scripts/pptx-nova-icons.mjs')
const selectScript = join(SKILL_ROOT, 'scripts/pptx-nova-deckkit-select.mjs')
const patchPath = join(TMP_ROOT, 'patch.json')
const qualityPath = join(TMP_ROOT, 'quality.json')
const editContractDraftPath = join(TMP_ROOT, 'edit-contract-draft.json')
const editContractPath = join(TMP_ROOT, 'edit-contract.json')
const editEvidenceManifestPath = join(TMP_ROOT, 'evidence-manifest.json')

const validation = runJson('validate bundled DeckKit content', 'node', [
  validateScript,
  contentPath,
  '--deckkit',
  'consulting-dark',
  '--mode',
  'delivery',
  '--json',
])
if (!validation.valid) throw new Error('bundled consulting-dark content is not valid')

run('build bundled content to patch', 'node', [
  buildScript,
  '--deckkit',
  'consulting-dark',
  contentPath,
  '--output',
  patchPath,
  '--quality-json',
  qualityPath,
])
const patch = JSON.parse(readFileSync(patchPath, 'utf8'))
if (!Array.isArray(patch.ops) || patch.ops.length === 0) {
  throw new Error('generated patch has no ops')
}

const icons = runJson('query bundled icon pack', 'node', [
  iconsScript,
  'search',
  'presentation',
  '--limit',
  '1',
  '--json',
])
if (icons[0]?.name !== 'presentation') throw new Error('icon search did not return presentation')

const selection = runJson('select bundled DeckKit', 'node', [
  selectScript,
  '--scenario',
  'roadshow',
  '--language',
  'mixed',
  '--density',
  'dense',
  '--slide-types',
  'heroSlide,multiCardSlide,benchmarkSlide,timelineSlide,askSlide',
  '--target',
  'delivery',
  '--json',
])
if (!selection.selected?.id) throw new Error('DeckKit selector did not choose a DeckKit')

writeFileSync(
  editContractDraftPath,
  `${JSON.stringify(
    {
      schemaVersion: 'pptx-nova-edit-contract/v1',
      request: 'Smoke-test one local title edit',
      scope: 'single-object',
      operationKind: 'text-edit',
      targets: [
        {
          id: 'cover-title',
          slide: 0,
          opIndexes: [0],
          selector: { shape: { id: 5 } },
          expected: { afterText: 'Smoke title', changeCategories: ['text'] },
        },
      ],
      coverage: { required: true, expectedTargetCount: 1 },
      allowedChanges: ['text'],
      preserve: ['slide-count', 'non-target-shapes'],
      requiredEvidence: ['dry-run', 'semantic-diff'],
    },
    null,
    2,
  )}\n`,
)
const contract = runJson('bind edit contract to source PPTX', 'node', [
  join(SKILL_ROOT, 'scripts/pptx-nova-edit-contract.mjs'),
  '--draft',
  editContractDraftPath,
  '--source',
  join(SKILL_ROOT, 'assets/examples/cartesian/deck.pptx'),
  '--output',
  editContractPath,
  '--json',
])
if (!/^[a-f0-9]{64}$/.test(contract.source?.sha256 ?? '')) {
  throw new Error('edit contract did not bind a source SHA-256')
}
const evidenceManifest = runJson('bind edit candidate and evidence hashes', 'node', [
  join(SKILL_ROOT, 'scripts/pptx-nova-edit-evidence-manifest.mjs'),
  '--candidate',
  join(SKILL_ROOT, 'assets/examples/cartesian/deck.pptx'),
  '--evidence',
  `edit-contract=${editContractPath}`,
  '--output',
  editEvidenceManifestPath,
  '--json',
])
if (!/^[a-f0-9]{64}$/.test(evidenceManifest.candidate?.sha256 ?? '')) {
  throw new Error('edit evidence manifest did not bind candidate bytes')
}

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 'pptx-nova-smoke/v1',
      ok: true,
      skillRoot: SKILL_ROOT,
      tempDir: TMP_ROOT,
      checks: checks.map(({ name, status }) => ({ name, status })),
      patchOps: patch.ops.length,
      selectedDeckkit: selection.selected.id,
      editContractTargets: contract.targets.length,
      editEvidenceCount: evidenceManifest.evidence.length,
    },
    null,
    2,
  )}\n`,
)
