#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CATALOG = resolve(ROOT, 'pptx-nova/assets/themes/catalog.json')
const MIN_NORMAL_TEXT_CONTRAST = 4.5

function readCatalog() {
  return JSON.parse(readFileSync(CATALOG, 'utf8'))
}

function normalizeHex(value, label) {
  const hex = String(value ?? '')
    .replace(/^#/, '')
    .toUpperCase()
  if (!/^[0-9A-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color for ${label}: ${value}`)
  }
  return hex
}

function channelToLinear(channel) {
  const value = channel / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const color = normalizeHex(hex, 'luminance')
  const red = channelToLinear(Number.parseInt(color.slice(0, 2), 16))
  const green = channelToLinear(Number.parseInt(color.slice(2, 4), 16))
  const blue = channelToLinear(Number.parseInt(color.slice(4, 6), 16))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground, background) {
  const fg = luminance(foreground)
  const bg = luminance(background)
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

function themePairs(pack) {
  const colors = pack.generator?.colors ?? {}
  const pageBg = colors.pageBg ?? pack.background ?? colors.cream
  const surfaceBg = colors.surfaceBg ?? colors.cardBg
  const surfaceAlt = colors.surfaceAlt ?? colors.pale
  const heroBg = colors.heroBg ?? colors.primaryDp ?? colors.primaryDk
  const accentTextBg = colors.accentTextBg ?? heroBg
  const accentText = colors.accentText ?? colors.primaryDk ?? colors.primary

  return [
    ['textPri/pageBg', colors.textPri, pageBg],
    ['textSec/pageBg', colors.textSec, pageBg],
    ['textMut/pageBg', colors.textMut, pageBg],
    ['textPri/surfaceBg', colors.textPri, surfaceBg],
    ['textSec/surfaceBg', colors.textSec, surfaceBg],
    ['textMut/surfaceBg', colors.textMut, surfaceBg],
    ['textPri/surfaceAlt', colors.textPri, surfaceAlt],
    ['accentText/surfaceBg', accentText, surfaceBg],
    ['onHero/heroBg', colors.onHero, heroBg],
    ['onAccent/accentTextBg', colors.onAccent, accentTextBg],
  ]
}

function main() {
  const catalog = readCatalog()
  const failures = []

  for (const pack of catalog.themePacks ?? []) {
    for (const [name, foreground, background] of themePairs(pack)) {
      const ratio = contrast(foreground, background)
      if (ratio < MIN_NORMAL_TEXT_CONTRAST) {
        failures.push({
          themePack: pack.id,
          pair: name,
          foreground: normalizeHex(foreground, `${pack.id}.${name}.foreground`),
          background: normalizeHex(background, `${pack.id}.${name}.background`),
          contrast: Number(ratio.toFixed(2)),
          required: MIN_NORMAL_TEXT_CONTRAST,
        })
      }
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`${JSON.stringify({ failures }, null, 2)}\n`)
    process.exit(1)
  }

  process.stdout.write(`Checked ${catalog.themePacks?.length ?? 0} themePack contrast profiles\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
