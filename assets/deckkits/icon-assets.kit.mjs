// icon-assets.kit.mjs - local Tabler icon bundle consumption for DeckKit generators
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TABLER_ICONS_PATH = join(__dirname, '..', 'icons', 'tabler-icons.generated.json')
const ICON_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

let tablerIconsCache = null

export function loadTablerIcons() {
  if (!tablerIconsCache) {
    tablerIconsCache = JSON.parse(readFileSync(TABLER_ICONS_PATH, 'utf8'))
  }
  return tablerIconsCache
}

export function listTablerIconNames() {
  return Object.keys(loadTablerIcons()).sort()
}

export function normalizeTablerIconName(name) {
  const iconName = String(name ?? '').trim()
  if (!ICON_NAME_RE.test(iconName)) {
    throw new Error(`Invalid Tabler icon name: ${name}`)
  }
  return iconName
}

export function hasTablerIcon(name) {
  const iconName = normalizeTablerIconName(name)
  return Object.prototype.hasOwnProperty.call(loadTablerIcons(), iconName)
}

function normalizeSvgColor(value) {
  const color = String(value ?? '').trim()
  if (/^#[0-9A-F]{6}$/i.test(color)) return color.toUpperCase()
  if (/^[0-9A-F]{6}$/i.test(color)) return `#${color.toUpperCase()}`
  throw new Error(`Tabler icon color must be a 6-digit hex value, got: ${value}`)
}

function formatStrokeWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width) || width <= 0 || width > 8) {
    throw new Error(`Tabler icon strokeWidth must be between 0 and 8, got: ${value}`)
  }
  return Number(width.toFixed(2)).toString()
}

export function getTablerIconSvg(name, options = {}) {
  const iconName = normalizeTablerIconName(name)
  const svg = loadTablerIcons()[iconName]
  if (!svg) {
    throw new Error(`Tabler icon not found in generated bundle: ${iconName}`)
  }

  const color = options.color === null ? null : normalizeSvgColor(options.color ?? '111827')
  const strokeWidth =
    options.strokeWidth === undefined ? null : formatStrokeWidth(options.strokeWidth)

  let result = svg
  if (color) result = result.replaceAll('currentColor', color)
  if (strokeWidth) result = result.replace(/stroke-width="[^"]+"/, `stroke-width="${strokeWidth}"`)
  return result
}

export function getTablerIconAsset(name, options = {}) {
  const svg = getTablerIconSvg(name, options)
  return {
    bytesBase64: Buffer.from(svg, 'utf8').toString('base64'),
    mime: 'image/svg+xml',
  }
}

const unit = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${value}in` : value)

export function addTablerIconPicture(ops, slide, shapeName, iconName, x, y, w, h, options = {}) {
  if (!Array.isArray(ops)) {
    throw new Error('addTablerIconPicture requires an ops array')
  }
  const op = {
    op: 'add-picture',
    slide,
    name: shapeName,
    x: unit(x),
    y: unit(y),
    w: unit(w),
    h: unit(h),
    ...getTablerIconAsset(iconName, options),
  }
  ops.push(op)
  return op
}
