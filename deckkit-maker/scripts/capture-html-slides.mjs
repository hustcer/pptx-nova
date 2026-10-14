#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

const DEFAULT_HIDE_SELECTORS = [
  'nav',
  '[role="navigation"]',
  '.slide-controls',
  '.presentation-controls',
  '.nav-dots',
  '#nav-dots',
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
  --session <name>          Dedicated agent-browser session. Default: unique per run
  --timeout-ms <n>          Per-browser-command/resource timeout in ms. Default: 30000
  --keep-open               Leave the browser session open after capture
  --json                    Print capture manifest JSON

Use a new or empty output directory; existing evidence is never overwritten.
The generic adapter activates each slide with .active and preserves CSS display.
Pass --active-display for display:none slides. Deck transforms and application
state may need a template-specific adapter; invisible or clipped slides fail.\n`)
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
    session: `deckkit-html-${randomUUID()}`,
    timeoutMs: 30000,
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
        '--timeout-ms',
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
  if (!viewport || Number(viewport[1]) < 1 || Number(viewport[2]) < 1) {
    process.stderr.write(
      `Invalid --viewport "${args.viewport}". Expected WxH, for example 1440x810.\n`,
    )
    process.exit(1)
  }
  args.viewportWidth = Number(viewport[1])
  args.viewportHeight = Number(viewport[2])
  args.contactCols = Number(args.contactCols)
  args.contactGap = Number(args.contactGap)
  args.timeoutMs = Number(args.timeoutMs)
  if (!Number.isSafeInteger(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be an integer of at least 1000')
  }
  if (!Number.isInteger(args.contactCols) || args.contactCols < 1) {
    process.stderr.write('--contact-cols must be a positive integer\n')
    process.exit(1)
  }
  if (!Number.isInteger(args.contactGap) || args.contactGap < 0) {
    process.stderr.write('--contact-gap must be a non-negative integer\n')
    process.exit(1)
  }
  const contactThumb = /^(\d+)x(\d+)$/i.exec(args.contactThumb)
  if (!contactThumb || Number(contactThumb[1]) < 1 || Number(contactThumb[2]) < 1) {
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
  const fileAccess = args.url.startsWith('file:') ? ['--allow-file-access'] : []
  const result = spawnSync(
    'agent-browser',
    ['--session', args.session, ...fileAccess, ...commandArgs],
    {
      encoding: 'utf8',
      input: options.input,
      timeout: args.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error(
      `agent-browser ${commandArgs.join(' ')} failed${result.error ? `: ${result.error.message}` : ''}`,
    )
  }
  return result.stdout.trim()
}

function fileEvidence(path) {
  const bytes = readFileSync(path)
  if (!bytes.length) throw new Error(`Empty capture artifact: ${path}`)
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
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
if (existsSync(outDir) && (!statSync(outDir).isDirectory() || readdirSync(outDir).length)) {
  throw new Error(`Output must be a new or empty directory: ${outDir}`)
}
const source = url.startsWith('file:')
  ? { path: fileURLToPath(url), ...fileEvidence(fileURLToPath(url)) }
  : { url, sha256: null }
mkdirSync(outDir, { recursive: true })
const browserArgs = { ...args, url }
let browserStarted = false

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
  browserStarted = true
  runAgentBrowser(browserArgs, ['open', url])
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
  userAgent: navigator.userAgent,
  devicePixelRatio: window.devicePixelRatio,
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
    const readiness = parseEvalJson(
      runAgentBrowser(args, ['eval', '--stdin'], {
        input: `
(async () => {
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
const active = slides[activeIndex];
let timer;
try {
  return await Promise.race([
    (async () => {
      // Flush layout after activation so newly used fonts and lazy images start loading.
      active.getBoundingClientRect();
      await document.fonts.ready;
      const failedFonts = Array.from(document.fonts).filter(font => font.status === 'error');
      if (failedFonts.length) throw new Error('Font loading failed: ' + failedFonts.map(font => font.family).join(', '));
      const images = Array.from(active.querySelectorAll('img'));
      await Promise.all(images.map(img => img.decode()));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const box = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0 ||
          box.width <= 0 || box.height <= 0 || box.left < -1 || box.top < -1 ||
          box.right > innerWidth + 1 || box.bottom > innerHeight + 1) {
        throw new Error('Slide ' + (activeIndex + 1) + ' is hidden, offscreen or clipped; use a template-specific activation adapter or --active-display');
      }
      return JSON.stringify({ activeIndex, fonts: document.fonts.status, decodedImages: images.length,
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height } });
    })(),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Slide resource readiness timed out')), ${Math.max(500, args.timeoutMs - 1000)}); }),
  ]);
} finally { clearTimeout(timer); }
})()
`,
      }),
    )
    const path = resolve(outDir, screenshotName(index))
    runAgentBrowser(args, ['screenshot', path])
    screenshots.push({ slideIndex: index, path, ...fileEvidence(path), readiness })
  }

  const contactSheet = renderContactSheet(args, screenshots, outDir)
  if (contactSheet.generated) Object.assign(contactSheet, fileEvidence(contactSheet.path))
  const manifest = {
    ok: true,
    capturedAt: new Date().toISOString(),
    source,
    session: args.session,
    browser: { userAgent: init.userAgent, devicePixelRatio: init.devicePixelRatio },
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
  if (browserStarted && !args.keepOpen) {
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
