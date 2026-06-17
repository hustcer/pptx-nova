#!/usr/bin/env node
/* eslint-disable no-console */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

function usage() {
  console.error(`Usage:
  node scripts/capture-html-slides.mjs --url template.html --out .tmp/deckkit-id/ref-previews [options]

Options:
  --selector <css>          Slide selector. Default: .slide
  --viewport <WxH>          Browser viewport in CSS pixels. Default: 1440x810
  --active-display <value>  Optional forced display for the active slide. Default: preserve CSS
  --hide-selectors <css>    Comma-separated UI selectors to hide. Default hides common deck controls
  --session <name>          agent-browser session name. Default: deckkit-html-capture
  --keep-open               Leave the browser session open after capture
  --json                    Print capture manifest JSON

The script is intentionally generic: it only assumes that each slide can be
selected with one CSS selector. By default it preserves each slide's CSS display
mode; pass --active-display only when the template leaves slides display:none.`)
}

function parseArgs(argv) {
  const args = {
    selector: '.slide',
    viewport: '1440x810',
    activeDisplay: null,
    hideSelectors: DEFAULT_HIDE_SELECTORS,
    session: 'deckkit-html-capture',
    keepOpen: false,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--keep-open') {
      args.keepOpen = true
      continue
    }
    if (arg === '--json') {
      args.json = true
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
    console.error(`Invalid --viewport "${args.viewport}". Expected WxH, for example 1440x810.`)
    process.exit(1)
  }
  args.viewportWidth = Number(viewport[1])
  args.viewportHeight = Number(viewport[2])
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
  }
  const manifestPath = resolve(outDir, 'capture-manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  if (args.json) {
    console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2))
  } else {
    console.log(`captured ${init.count} slide screenshot(s) to ${outDir}`)
    console.log(`manifest: ${manifestPath}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
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
