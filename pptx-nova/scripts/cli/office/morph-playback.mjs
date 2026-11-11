#!/usr/bin/env node
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareEvidenceOutputs } from '../../lib/runtime/evidence-output.mjs'

export const PLAYBACK_SCRIPT = String.raw`on run argv
  set ppt_path to item 1 of argv
  set from_slide_number to (item 2 of argv) as integer
  set to_slide_number to (item 3 of argv) as integer
  set timeout_seconds to (item 4 of argv) as integer
  set resave_path to item 5 of argv
  set navigation_timeout_seconds to (item 6 of argv) as integer
  set tab_char to ASCII character 9
  with timeout of 600 seconds
    tell application "Microsoft PowerPoint"
      activate
      set target_presentation to missing value
      set pres_count to count of presentations
      repeat with i from 1 to pres_count
        if ((full name of presentation i) as string) is equal to ppt_path then
          set target_presentation to presentation i
          exit repeat
        end if
      end repeat
      if target_presentation is missing value then
        try
          with timeout of navigation_timeout_seconds seconds
        open POSIX file ppt_path
        delay 1
        set pres_count to count of presentations
        repeat with i from 1 to pres_count
          if ((full name of presentation i) as string) is equal to ppt_path then
            set target_presentation to presentation i
            exit repeat
          end if
        end repeat
          end timeout
        on error err_msg number err_num
          error "open-presentation: " & err_msg number err_num
        end try
      end if
      if target_presentation is missing value then error "PowerPoint opened no matching presentation"
      try
        set destination_transition to slide show transition of slide to_slide_number of target_presentation
        set recognized_effect to entry effect of destination_transition as string
        set recognized_duration to transition duration of destination_transition
      on error err_msg number err_num
        error "read-transition: " & err_msg number err_num
      end try
      set animations_enabled to show with animation of slide show settings of target_presentation
      try
        with timeout of navigation_timeout_seconds seconds
          set show_settings to slide show settings of target_presentation
          set original_range to range type of show_settings
          set original_start to starting slide of show_settings
          set original_end to ending slide of show_settings
          set range type of show_settings to slide show range
          set starting slide of show_settings to from_slide_number
          set ending slide of show_settings to count of slides of target_presentation
          set show_window to run slide show show_settings
        set show_view to slideshow view of show_window
        end timeout
      on error err_msg number err_num
        error "start-slideshow: " & err_msg number err_num
      end try
      delay 0.5
      set deadline to (current date) + navigation_timeout_seconds
      repeat while (slide index of slide of show_view) is not from_slide_number
        if (current date) is greater than deadline then error "navigate-source: timed out starting at source slide; observed " & (slide index of slide of show_view as string)
        delay 0.1
      end repeat
      set source_entry_duration to transition duration of slide show transition of slide from_slide_number of target_presentation
      if source_entry_duration > navigation_timeout_seconds then error "source-entry: duration exceeds navigation timeout"
      delay (source_entry_duration + 0.35)
      set start_position to slide index of slide of show_view
      try
        with timeout of timeout_seconds seconds
          go to next slide show_view
        end timeout
      on error err_msg number err_num
        error "advance-slideshow: " & err_msg number err_num
      end try
      set deadline to (current date) + timeout_seconds
      repeat while (slide index of slide of show_view) is not to_slide_number
        if (current date) is greater than deadline then error "wait-destination: timed out waiting for destination slide"
        delay 0.05
      end repeat
      if recognized_duration > timeout_seconds then error "wait-transition: duration exceeds playback timeout"
      delay (recognized_duration + 0.25)
      set end_position to slide index of slide of show_view
      try
        set elapsed_seconds to presentation elapsed time of show_view
      on error err_msg number err_num
        error "read-playback-state: " & err_msg number err_num
      end try
      set presentation_name to name of target_presentation as string
      exit slide show show_view
      set starting slide of show_settings to original_start
      set ending slide of show_settings to original_end
      set range type of show_settings to original_range
      if resave_path is not "" then
        try
          with timeout of timeout_seconds seconds
        save target_presentation in POSIX file resave_path as save as Open XML presentation
          end timeout
        on error err_msg number err_num
          error "resave: " & err_msg number err_num
        end try
      end if
      close target_presentation saving no
      return presentation_name & tab_char & recognized_effect & tab_char & ¬
        (recognized_duration as string) & tab_char & (animations_enabled as string) & tab_char & ¬
        (start_position as string) & tab_char & (end_position as string) & tab_char & (elapsed_seconds as string)
    end tell
  end timeout
end run`

const usage = `Usage: node <skill-root>/scripts/cli/office/morph-playback.mjs <deck.pptx> --from-slide N --to-slide N+1 --mode by-object|by-word|by-char --duration-ms N [options]
Options:
  --output <path>             Persist the hash-bound playback report.
  --resave-output <path>      Optional separate PowerPoint resaved PPTX.
  --timeout-seconds <1..600>  Destination playback timeout; default 10.
  --navigation-timeout-seconds <1..600>  Source navigation timeout; default 60.
  --overwrite                Replace only explicitly selected evidence outputs.
  --json                     Print the complete report.
This macOS-only probe verifies semantic playback, not interpolation pixels.
`

export function parseObservation(stdout) {
  const fields = stdout.trim().split('\t')
  if (fields.length !== 7) throw new Error(`Expected 7 playback fields, received ${fields.length}`)
  const number = (i) => {
    if (!fields[i].trim() || !Number.isFinite(Number(fields[i])))
      throw new Error(`Invalid playback numeric field ${i}`)
    return Number(fields[i])
  }
  if (!['true', 'false'].includes(fields[3].trim().toLowerCase()))
    throw new Error('Invalid animation-enabled field')
  const startSlideNumber = number(4),
    endSlideNumber = number(5)
  if (![startSlideNumber, endSlideNumber].every((n) => Number.isInteger(n) && n >= 1))
    throw new Error('Invalid observed slide number')
  return {
    presentationName: fields[0],
    recognizedEntryEffect: fields[1].trim().toLowerCase(),
    transitionDurationMs: Math.round(number(2) * 1000),
    showWithAnimation: fields[3].trim().toLowerCase() === 'true',
    startSlideNumber,
    endSlideNumber,
    presentationElapsedSeconds: number(6),
  }
}

export function parseArgs(argv) {
  const args = { timeoutSeconds: 10, navigationTimeoutSeconds: 60, overwrite: false, json: false }
  const fields = {
    '--from-slide': 'fromSlide',
    '--to-slide': 'toSlide',
    '--duration-ms': 'durationMs',
    '--timeout-seconds': 'timeoutSeconds',
    '--navigation-timeout-seconds': 'navigationTimeoutSeconds',
    '--mode': 'mode',
    '--output': 'output',
    '--resave-output': 'resaveOutput',
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--json' || flag === '--overwrite') args[flag.slice(2)] = true
    else if (fields[flag]) {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
      args[fields[flag]] = value
    } else if (!flag.startsWith('-') && !args.input) args.input = flag
    else throw new Error(`Unexpected argument: ${flag}`)
  }
  if (!args.input) throw new Error('An input PPTX is required')
  for (const key of [
    'fromSlide',
    'toSlide',
    'durationMs',
    'timeoutSeconds',
    'navigationTimeoutSeconds',
  ]) {
    if (!/^\d+$/.test(String(args[key]))) throw new Error(`${key} must be a non-negative integer`)
    args[key] = Number(args[key])
    if (!Number.isSafeInteger(args[key])) throw new Error(`${key} is out of range`)
  }
  if (args.fromSlide < 1 || args.toSlide !== args.fromSlide + 1)
    throw new Error('Morph playback requires adjacent 1-based slides')
  if (!['by-object', 'by-word', 'by-char'].includes(args.mode))
    throw new Error('Unsupported Morph mode')
  for (const key of ['timeoutSeconds', 'navigationTimeoutSeconds'])
    if (args[key] < 1 || args[key] > 600) throw new Error(`${key} must be between 1 and 600`)
  return args
}

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const identity = (path) => ({ path, byteLength: statSync(path).size, sha256: hash(path) })
function runAppleScript(script, args = [], timeout = 15000) {
  const result = spawnSync('/usr/bin/osascript', ['-', ...args.map(String)], {
    input: script,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status !== 0)
    throw new Error(
      (result.stderr || result.error?.message || 'PowerPoint automation failed').trim(),
    )
  return result.stdout
}

const CLOSE_SCRIPT = `on run argv
  tell application "Microsoft PowerPoint"
    repeat with i from (count of presentations) to 1 by -1
      try
        if ((full name of presentation i) as string) is equal to item 1 of argv then
          try
            exit slide show (slideshow view of slide show window of presentation i)
          end try
          close presentation i saving no
        end if
      end try
    end repeat
  end tell
end run`

export function runProbe(
  args,
  { platform = process.platform, homeDir = homedir(), execute = runAppleScript } = {},
) {
  const evidence = prepareEvidenceOutputs(
    args.input,
    { report: args.output, resave: args.resaveOutput },
    args.overwrite,
  )
  const { input } = evidence
  const inputIdentity = identity(input)
  const report = {
    schemaVersion: 'pptx-morph-playback/v1',
    status: 'skipped',
    gate: { passed: false, reason: 'unsupported-platform' },
    input: inputIdentity,
    request: {
      fromSlideIndex: args.fromSlide - 1,
      toSlideIndex: args.toSlide - 1,
      morphMode: args.mode,
      durationMs: args.durationMs,
      navigationTimeoutSeconds: args.navigationTimeoutSeconds,
      transitionTimeoutSeconds: args.timeoutSeconds,
    },
    observations: null,
    checks: null,
    resave: null,
    limits: [
      'Semantic playback and mode recognition only; no interpolation frames or pixel-parity claim.',
      'This probe does not establish Windows PowerPoint compatibility.',
    ],
  }
  let staging
  try {
    if (platform !== 'darwin') return report
    try {
      execute('id of application "Microsoft PowerPoint"')
    } catch (error) {
      report.gate.reason = 'powerpoint-unavailable'
      report.availability = { reason: report.gate.reason, detail: error.message }
      return report
    }
    const base = join(homeDir, 'Library', 'Containers', 'com.microsoft.Powerpoint', 'Data', 'tmp')
    staging = mkdtempSync(join(base, 'pptx-morph-playback-'))
    const staged = join(staging, 'candidate.pptx'),
      resaved = args.resaveOutput ? join(staging, 'powerpoint-resaved.pptx') : ''
    copyFileSync(input, staged)
    const stdout = execute(
      PLAYBACK_SCRIPT,
      [
        staged,
        args.fromSlide,
        args.toSlide,
        args.timeoutSeconds,
        resaved,
        args.navigationTimeoutSeconds,
      ],
      (args.navigationTimeoutSeconds * 3 + args.timeoutSeconds * 3 + 20) * 1000,
    )
    report.observations = parseObservation(stdout)
    const o = report.observations
    report.checks = {
      morphModeRecognized:
        o.recognizedEntryEffect === `entry effect morph ${args.mode.replace('by-', 'by ')}`,
      slideShowAnimationsEnabled: o.showWithAnimation,
      startedOnSource: o.startSlideNumber === args.fromSlide,
      advancedToDestination: o.endSlideNumber === args.toSlide,
      durationMatched: Math.abs(o.transitionDurationMs - args.durationMs) <= 50,
    }
    if (args.resaveOutput) {
      if (!existsSync(resaved)) throw new Error('PowerPoint did not create the requested resave')
      const zip = spawnSync('/usr/bin/unzip', ['-t', resaved], { encoding: 'utf8', timeout: 15000 })
      if (zip.status !== 0) throw new Error('PowerPoint resave is not a complete PPTX ZIP package')
      if (hash(input) !== inputIdentity.sha256)
        throw new Error('Input PPTX changed during playback')
      report.resave = identity(evidence.publish('resave', readFileSync(resaved)))
    }
    const passed = Object.values(report.checks).every(Boolean)
    report.status = passed ? 'pass' : 'fail'
    report.gate = {
      passed,
      reason: passed
        ? 'powerpoint-recognized-and-played-morph'
        : 'powerpoint-playback-check-failed',
    }
  } catch (error) {
    report.status = 'fail'
    report.gate = { passed: false, reason: 'powerpoint-playback-probe-failed' }
    report.error = { message: error.message }
  } finally {
    if (staging) {
      try {
        execute(CLOSE_SCRIPT, [join(staging, 'candidate.pptx')])
      } catch {}
      rmSync(staging, { recursive: true })
    }
    if (hash(input) !== inputIdentity.sha256) {
      report.status = 'fail'
      report.gate = { passed: false, reason: 'input-changed' }
    }
    if (args.output) evidence.publish('report', JSON.stringify(report, null, 2) + '\n')
  }
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) process.stdout.write(usage)
  else {
    try {
      const args = parseArgs(process.argv.slice(2)),
        report = runProbe(args)
      process.stdout.write(
        args.json
          ? JSON.stringify(report, null, 2) + '\n'
          : `PowerPoint Morph playback: ${report.status}\n`,
      )
      if (report.status === 'fail') process.exitCode = 1
    } catch (error) {
      process.stderr.write(error.message + '\n')
      process.exitCode = 2
    }
  }
}
