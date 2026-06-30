#!/usr/bin/env node

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const DEFAULT_HIDE_SELECTORS = [
  'nav',
  '[role="navigation"]',
  '.slide-controls',
  '.presentation-controls',
  '.nav-dots',
  '.nav-dot',
  '.nav-arrows',
  '.nav-arrow',
  '.nav-controls',
  '.pagination',
  '.dots',
  '.slide-counter',
  'button[aria-label*="next" i]',
  'button[aria-label*="previous" i]',
].join(', ')

const CONTACT_SHEET_FONT_CANDIDATES = [
  process.env.DECKKIT_CONTACT_SHEET_FONT,
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  'Arial',
  'Helvetica',
  'DejaVu-Sans',
].filter(Boolean)

function usage(stream = process.stderr) {
  stream.write(`Usage:
  node scripts/capture-html-slides.mjs --url template.html --out .tmp/deckkit-<id>/ref-previews [options]

Options:
  --selector <css>          Slide selector. Default: .slide
  --viewport <WxH>          Browser viewport in CSS pixels. Default: 1440x810
  --active-display <value>  Optional forced display for the active slide. Default: preserve CSS
  --hide-selectors <css>    Comma-separated UI selectors to hide. Default hides common deck controls
  --no-contact-sheet        Skip ImageMagick contact sheet generation
  --contact-sheet-font <f>  Font name/path for ImageMagick labels. Default: DECKKIT_CONTACT_SHEET_FONT or macOS/Linux fallback
  --contact-cols <n>        Contact sheet columns. Default: 2
  --contact-thumb <WxH>     Contact sheet thumbnail size. Default: 640x360
  --contact-gap <px>        Contact sheet gap and outer margin. Default: 16
  --session <name>          agent-browser session name. Default: deckkit-html-capture
  --keep-open               Leave the browser session open after capture
  --json                    Print capture manifest JSON

The script is intentionally generic: it only assumes that each slide can be
selected with one CSS selector. By default it preserves each slide's CSS display
mode; pass --active-display only when the template leaves slides display:none.\n`)
}

function parseArgs(argv) {
  const args = {
    selector: '.slide',
    viewport: '1440x810',
    activeDisplay: null,
    hideSelectors: DEFAULT_HIDE_SELECTORS,
    contactSheet: true,
    contactSheetFont: '',
    contactCols: 2,
    contactThumb: '640x360',
    contactGap: 16,
    session: 'deckkit-html-capture',
    keepOpen: false,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      usage(process.stdout)
      process.exit(0)
    }
    if (arg === '--keep-open') {
      args.keepOpen = true
      continue
    }
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--no-contact-sheet') {
      args.contactSheet = false
      continue
    }
    if (
      [
        '--url',
        '--out',
        '--selector',
        '--viewport',
        '--active-display',
        '--hide-selectors',
        '--contact-sheet-font',
        '--contact-cols',
        '--contact-thumb',
        '--contact-gap',
        '--session',
      ].includes(arg)
    ) {
      const value = argv[i + 1]
      if (!value) {
        usage()
        process.exit(1)
      }
      args[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value
      i += 1
      continue
    }
    usage()
    process.exit(1)
  }

  if (!args.url || !args.out) {
    usage()
    process.exit(1)
  }

  const viewport = /^(\d+)x(\d+)$/i.exec(args.viewport)
  if (!viewport) {
    process.stderr.write(
      `Invalid --viewport "${args.viewport}". Expected WxH, for example 1440x810.\n`,
    )
    process.exit(1)
  }
  args.viewportWidth = Number(viewport[1])
  args.viewportHeight = Number(viewport[2])
  args.contactCols = Number.parseInt(args.contactCols, 10)
  args.contactGap = Number.parseInt(args.contactGap, 10)
  if (!Number.isInteger(args.contactCols) || args.contactCols < 1) {
    process.stderr.write('--contact-cols must be a positive integer\n')
    process.exit(1)
  }
  if (!Number.isInteger(args.contactGap) || args.contactGap < 0) {
    process.stderr.write('--contact-gap must be a non-negative integer\n')
    process.exit(1)
  }
  if (!/^\d+x\d+$/i.test(args.contactThumb)) {
    process.stderr.write('--contact-thumb must use WxH, for example 640x360\n')
    process.exit(1)
  }
  return args
}

function normalizeUrl(input) {
  if (/^(https?:|file:)/i.test(input)) return input
  return pathToFileURL(resolve(input)).href
}

function runAgentBrowser(args, commandArgs, options = {}) {
  const result = spawnSync('agent-browser', ['--session', args.session, ...commandArgs], {
    encoding: 'utf8',
    input: options.input,
  })
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error(`agent-browser ${commandArgs.join(' ')} failed`)
  }
  return result.stdout.trim()
}

function parseEvalJson(stdout) {
  let parsed = JSON.parse(stdout)
  if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  return parsed
}

function screenshotName(index) {
  return `slide-${String(index + 1).padStart(2, '0')}.png`
}

function commandWorks(command, args = ['-version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return result.status === 0
}

function imageMagickCommand() {
  if (commandWorks('magick')) return ['magick', 'montage']
  if (commandWorks('montage')) return ['montage']
  return null
}

function contactSheetFont(explicitFont) {
  if (explicitFont) return explicitFont
  return (
    CONTACT_SHEET_FONT_CANDIDATES.find(
      (candidate) => !candidate.includes('/') || existsSync(candidate),
    ) ?? 'Arial'
  )
}

function renderContactSheet(args, screenshots, outDir) {
  if (!args.contactSheet) {
    return {
      enabled: false,
      generated: false,
      path: null,
      font: null,
      command: null,
      warning: null,
      bytes: 0,
    }
  }

  const command = imageMagickCommand()
  const contactSheetPath = resolve(outDir, 'contact-sheet.png')
  if (!command) {
    return {
      enabled: true,
      generated: false,
      path: contactSheetPath,
      font: null,
      command: null,
      warning: 'ImageMagick magick/montage command was not found',
      bytes: 0,
    }
  }

  const font = contactSheetFont(args.contactSheetFont)
  const commandArgs = [
    ...command.slice(1),
    '-label',
    '%f',
    '-font',
    font,
    '-pointsize',
    '18',
    ...screenshots.map((shot) => shot.path),
    '-thumbnail',
    args.contactThumb,
    '-tile',
    `${args.contactCols}x`,
    '-geometry',
    `+${args.contactGap}+${args.contactGap}`,
    '-background',
    '#FFFFFF',
    contactSheetPath,
  ]
  const result = spawnSync(command[0], commandArgs, { encoding: 'utf8' })
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error(
      `ImageMagick contact sheet failed with font "${font}". Set DECKKIT_CONTACT_SHEET_FONT or pass --contact-sheet-font.`,
    )
  }
  const bytes = existsSync(contactSheetPath) ? statSync(contactSheetPath).size : 0
  return {
    enabled: true,
    generated: bytes > 0,
    path: contactSheetPath,
    font,
    command: [command[0], ...commandArgs],
    warning: bytes > 0 ? null : 'ImageMagick finished but contact-sheet.png is missing or empty',
    bytes,
  }
}

const args = parseArgs(process.argv.slice(2))
const url = normalizeUrl(args.url)
const outDir = resolve(args.out)
mkdirSync(outDir, { recursive: true })

const captureCss = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
}
html, body {
  margin: 0 !important;
  overflow: hidden !important;
}
${args.hideSelectors ? `${args.hideSelectors} { display: none !important; visibility: hidden !important; opacity: 0 !important; }` : ''}
`

try {
  runAgentBrowser(args, ['open', url])
  runAgentBrowser(args, [
    'set',
    'viewport',
    String(args.viewportWidth),
    String(args.viewportHeight),
  ])

  const init = parseEvalJson(
    runAgentBrowser(args, ['eval', '--stdin'], {
      input: `
(() => {
const selector = ${JSON.stringify(args.selector)};
const captureCss = ${JSON.stringify(captureCss)};
let style = document.getElementById('deckkit-maker-capture-css');
if (!style) {
  style = document.createElement('style');
  style.id = 'deckkit-maker-capture-css';
  document.head.append(style);
}
style.textContent = captureCss;
const slides = Array.from(document.querySelectorAll(selector));
return JSON.stringify({
  title: document.title,
  href: location.href,
  count: slides.length,
  selector,
});
})()
`,
    }),
  )

  if (!init.count) {
    throw new Error(`No slides matched selector "${args.selector}"`)
  }

  const screenshots = []
  for (let index = 0; index < init.count; index += 1) {
    runAgentBrowser(args, ['eval', '--stdin'], {
      input: `
(() => {
const selector = ${JSON.stringify(args.selector)};
const activeDisplay = ${JSON.stringify(args.activeDisplay)};
const activeIndex = ${index};
const slides = Array.from(document.querySelectorAll(selector));
slides.forEach((slide, i) => {
  if (i === activeIndex) {
    if (activeDisplay) slide.style.setProperty('display', activeDisplay, 'important');
    slide.style.setProperty('visibility', 'visible', 'important');
    slide.style.setProperty('opacity', '1', 'important');
    slide.classList.add('active');
    slide.removeAttribute('aria-hidden');
    slide.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else {
    slide.style.setProperty('visibility', 'hidden', 'important');
    slide.style.setProperty('opacity', '0', 'important');
    slide.classList.remove('active');
    slide.setAttribute('aria-hidden', 'true');
  }
});
window.dispatchEvent(new Event('resize'));
return JSON.stringify({ activeIndex });
})()
`,
    })
    runAgentBrowser(args, ['wait', '100'])
    const path = resolve(outDir, screenshotName(index))
    runAgentBrowser(args, ['screenshot', path])
    screenshots.push({ slideIndex: index, path })
  }

  const contactSheet = renderContactSheet(args, screenshots, outDir)
  const manifest = {
    ok: true,
    title: init.title,
    url: init.href,
    inputUrl: args.url,
    normalizedUrl: url,
    outDir,
    selector: args.selector,
    viewport: { width: args.viewportWidth, height: args.viewportHeight },
    activeDisplay: args.activeDisplay,
    hideSelectors: args.hideSelectors,
    captureCss,
    slideCount: init.count,
    screenshots,
    contactSheet,
  }
  const manifestPath = resolve(outDir, 'capture-manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath }, null, 2)}\n`)
  } else {
    process.stdout.write(`captured ${init.count} slide screenshot(s) to ${outDir}\n`)
    if (contactSheet.generated) process.stdout.write(`contact sheet: ${contactSheet.path}\n`)
    if (contactSheet.warning) process.stderr.write(`warning: ${contactSheet.warning}\n`)
    process.stdout.write(`manifest: ${manifestPath}\n`)
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  if (!args.keepOpen) {
    try {
      runAgentBrowser(args, ['close'])
    } catch {
      // Ignore cleanup failures; the capture error above is more useful.
    }
  }
}

if (existsSync(outDir) && process.exitCode === undefined) {
  process.exitCode = 0
}
