#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditDeckkitLayout } from './lib/deckkit-layout.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const SKILL_ROOT = resolve(REPO_ROOT, 'pptx-nova')

const BINARY_EXTENSIONS = new Set([
  '.br',
  '.gif',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.pptx',
  '.webp',
  '.zip',
])
const ALLOWED_BINARY_PATTERNS = [
  /^assets\/examples\/[^/]+\/deck\.pptx$/,
  /^assets\/examples\/[^/]+\/contact-sheet\.webp$/,
  /^assets\/icons\/tabler-icons\.pack\.br$/,
]
const LICENSE_REQUIRED_PATTERNS = [/^assets\/icons\/tabler-icons\.pack\.br$/]
const TEXT_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.svg',
  '.txt',
  '.yaml',
  '.yml',
])

const DENY_PATTERNS = [
  {
    id: 'machine-absolute-path',
    pattern: new RegExp(`${'/'}Users${'/'}|${'/'}home${'/'}[^/\\s]+${'/'}|[A-Za-z]:\\\\Users\\\\`),
    message: 'machine-local absolute path',
  },
  {
    id: 'private-repo-path',
    pattern: new RegExp(
      [
        `iWork/${'pptx'}`,
        `PPTX_${'DEMO_FILE'}`,
        `test-${'fixtures'}/`,
        `.${'claude'}/`,
        `AGENTS.${'md'}`,
        `CLAUDE.${'md'}`,
      ]
        .map(escapeRegExp)
        .join('|'),
    ),
    message: 'private repository context',
  },
  {
    id: 'private-demo-path',
    pattern: /(?:^|[\s`"'(:])demos\/[A-Za-z0-9_.\-/]+/,
    message: 'private demo deck path',
  },
  {
    id: 'secret-like-assignment',
    pattern: /\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*["'][^"']{8,}["']/i,
    message: 'secret-like assignment',
  },
  {
    id: 'private-license-payload',
    pattern: /license[_-]?payload|private[_-]?key|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/i,
    message: 'private license or key payload',
  },
]

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseArgs(argv) {
  return {
    strict: argv.includes('--strict'),
    json: argv.includes('--json'),
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (entry.isFile()) out.push(path)
  }
  return out
}

function isAllowedBinary(relPath) {
  return ALLOWED_BINARY_PATTERNS.some((pattern) => pattern.test(relPath))
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase())
}

function pushIssue(issues, severity, code, path, message, extra = {}) {
  issues.push({ severity, code, path, message, ...extra })
}

function scanTextFile(path, relPath, issues) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/)
  for (const item of DENY_PATTERNS) {
    lines.forEach((line, index) => {
      if (item.pattern.test(line)) {
        pushIssue(issues, 'error', item.id, relPath, item.message, {
          line: index + 1,
          excerpt: line.trim().slice(0, 180),
        })
      }
    })
  }
}

function audit() {
  const issues = auditDeckkitLayout(SKILL_ROOT)
  const files = walk(SKILL_ROOT)
  for (const path of files) {
    const relPath = relative(SKILL_ROOT, path).replaceAll('\\', '/')
    const stats = statSync(path)
    const ext = extname(path).toLowerCase()

    if (BINARY_EXTENSIONS.has(ext)) {
      if (!isAllowedBinary(relPath)) {
        pushIssue(
          issues,
          'error',
          'unexpected-binary',
          relPath,
          'binary file is not in the public allowlist',
          {
            bytes: stats.size,
          },
        )
      }
      if (stats.size > 2_000_000) {
        pushIssue(issues, 'warning', 'large-binary', relPath, 'binary file is larger than 2MB', {
          bytes: stats.size,
        })
      }
      continue
    }

    if (isTextFile(path)) scanTextFile(path, relPath, issues)
  }

  for (const pattern of LICENSE_REQUIRED_PATTERNS) {
    const hasAsset = files.some((path) =>
      pattern.test(relative(SKILL_ROOT, path).replaceAll('\\', '/')),
    )
    if (hasAsset) {
      const licensePath = join(SKILL_ROOT, 'assets/icons/icon-license')
      try {
        const license = readFileSync(licensePath, 'utf8')
        if (!/MIT License/.test(license)) {
          pushIssue(
            issues,
            'error',
            'missing-icon-license',
            'assets/icons/icon-license',
            'Tabler MIT license text is missing',
          )
        }
      } catch {
        pushIssue(
          issues,
          'error',
          'missing-icon-license',
          'assets/icons/icon-license',
          'Tabler icon pack requires copied license text',
        )
      }
    }
  }

  const examplesReadme = join(SKILL_ROOT, 'assets/examples/README.md')
  try {
    const text = readFileSync(examplesReadme, 'utf8')
    if (!/redistributable|synthetic|generated/i.test(text)) {
      pushIssue(
        issues,
        'warning',
        'examples-license-policy',
        'assets/examples/README.md',
        'examples README should state whether bundled examples are synthetic or redistributable',
      )
    }
  } catch {
    pushIssue(
      issues,
      'warning',
      'examples-license-policy',
      'assets/examples/README.md',
      'examples README is missing',
    )
  }

  return {
    schemaVersion: 'pptx-nova-public-audit/v1',
    skillRoot: SKILL_ROOT,
    fileCount: files.length,
    issues,
    summary: {
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
      binaries: files.filter((path) => BINARY_EXTENSIONS.has(extname(path).toLowerCase())).length,
      topLevel: readdirSync(SKILL_ROOT, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`),
      skillName: basename(SKILL_ROOT),
    },
  }
}

const args = parseArgs(process.argv.slice(2))
const report = audit()

if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  process.stdout.write(
    `pptx-nova public audit: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.fileCount} file(s)\n`,
  )
  for (const issue of report.issues) {
    const location = issue.line ? `${issue.path}:${issue.line}` : issue.path
    process.stdout.write(`[${issue.severity}] ${issue.code} ${location} - ${issue.message}\n`)
    if (issue.excerpt) process.stdout.write(`  ${issue.excerpt}\n`)
  }
}

if (report.summary.errors > 0 || (args.strict && report.summary.warnings > 0)) {
  process.exitCode = 1
}
