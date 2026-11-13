#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileSha256 } from '../../lib/review/canonical-visual-evidence.mjs'
import {
  createTextStyleReview,
  readTextStyleMapping,
} from '../../lib/translation/text-style-review.mjs'

const usage =
  'Usage: node <skill-root>/scripts/cli/translation/style-review.mjs --source source.pptx --candidate translated.pptx --style-diff style.json --output text-style-review.json\nWrites a bound review scaffold and a Markdown source/target/style comparison. Fill each pending verdict and reason after reviewing the corresponding source/candidate PNGs.\n'
try {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i]
    if (flag === '--help') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (
      !['--source', '--candidate', '--style-diff', '--output'].includes(flag) ||
      !process.argv[i + 1]
    )
      throw new Error(usage)
    args[flag.slice(2)] = resolve(process.argv[++i])
  }
  if (['source', 'candidate', 'style-diff', 'output'].some((key) => !args[key]))
    throw new Error(usage)
  const report = JSON.parse(readFileSync(args['style-diff'], 'utf8'))
  const mapping = readTextStyleMapping(report)
  // Reports from a different source/candidate pair must not be rebound by the helper.
  if (
    fileSha256(report.source) !== fileSha256(args.source) ||
    fileSha256(report.candidate) !== fileSha256(args.candidate)
  )
    throw new Error('style report belongs to a different source/candidate pair')
  const review = createTextStyleReview(report, {
    sourceSha256: fileSha256(args.source),
    candidateSha256: fileSha256(args.candidate),
  })
  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(review, null, 2) + '\n', { flag: 'wx' })
  const md = [
    '# Translation phrase/style review',
    '',
    'Review semantic emphasis, color/font identity and canonical source/target PNGs for every item. Cite an actual source and translated phrase in each reason. Do not approve an empty or misassigned style group.',
    '',
  ]
  for (const item of mapping.mappings) {
    md.push(
      `## ${item.part} — paragraph ${item.paragraphIndex}`,
      '',
      `Mapping: ${item.mappingId}`,
      `Slides: ${item.referencedBySlides.join(', ') || 'shared/non-slide part'}`,
      '',
    )
    for (const group of item.groups)
      md.push(
        `### ${group.sourceRunGroupId}`,
        '',
        `Source: ${group.sourceText}`,
        '',
        `Target: ${group.candidateText}`,
        '',
        '```xml',
        group.styleXml,
        '```',
        '',
      )
  }
  writeFileSync(args.output + '.md', md.join('\n') + '\n', { flag: 'wx' })
  process.stdout.write(
    `Translation phrase/style review: ${mapping.reviewRequiredCount} paragraph(s) awaiting explicit review.\n${args.output}\n`,
  )
} catch (error) {
  process.stderr.write(error.message + '\n')
  process.exitCode = 1
}
