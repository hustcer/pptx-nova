import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { SKILL_ROOT } from '../runtime/skill-paths.mjs'

const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')

const NAMED_COLORS = [
  ['near black', '111111'],
  ['ink black', '111111'],
  ['black', '111111'],
  ['deep navy', '0E2638'],
  ['ink blue', '13233A'],
  ['navy', '0E2638'],
  ['blue gray', '64748B'],
  ['blue-gray', '64748B'],
  ['off white', 'F5F2EA'],
  ['off-white', 'F5F2EA'],
  ['warm cream', 'F0ECE5'],
  ['cream', 'F0ECE5'],
  ['white', 'FFFFFF'],
  ['copper', 'C47A3C'],
  ['coral', 'E85D26'],
  ['warm orange', 'E85D26'],
  ['fire orange', 'E85D26'],
  ['orange', 'E85D26'],
  ['yellow', 'F1EE2E'],
  ['amber', 'F59E0B'],
  ['green', '16A34A'],
  ['red', 'DC2626'],
]

const FONT_FAMILIES = [
  'Times New Roman',
  'Courier New',
  'IBM Plex Mono',
  'Noto Sans SC',
  'Bebas Neue',
  'Playfair Display',
  'Bricolage Grotesque',
  'Helvetica',
  'Arial',
  'Inter',
  'Barlow',
  'Fraunces',
  'Aptos Display',
  'Aptos',
]

export function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function hexFrom(value) {
  if (typeof value !== 'string') return ''
  const match = value.match(/#?([0-9A-Fa-f]{6})\b/)
  return match ? match[1].toUpperCase() : ''
}

export function luminance(hex) {
  const value = hexFrom(hex)
  if (!value) return 1
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function asArray(value) {
  if (Array.isArray(value)) return value
  return value === null || value === undefined ? [] : [value]
}

function hasOwnValue(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key)
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function namedHexFrom(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.toLowerCase().replace(/[-_]+/g, ' ')
  for (const [name, hex] of NAMED_COLORS) {
    if (normalized.includes(name.replace(/[-_]+/g, ' '))) return hex
  }
  return ''
}

function colorFrom(value) {
  return hexFrom(value) || namedHexFrom(value)
}

function firstColor(values, fallback, label, warnings) {
  for (const value of asArray(values)) {
    const color = colorFrom(value)
    if (color) return color
  }
  warnings.push(`No concrete ${label} color found in visualGrammar; using ${fallback}.`)
  return fallback
}

function fallbackTextForBackground(background) {
  return luminance(background) < 0.45 ? 'F5F2EA' : '1F1F1F'
}

function fallbackSecondaryForBackground(background) {
  return luminance(background) < 0.45 ? '94A3B8' : '6B7280'
}

function fallbackSurfaceForBackground(background) {
  return luminance(background) < 0.45 ? '111827' : 'FFFFFF'
}

export function fontFamilyFrom(value, fallback, label = 'font', warnings = []) {
  if (typeof value !== 'string' || !value.trim()) {
    warnings.push(`No ${label} typography hint found; using ${fallback}.`)
    return fallback
  }
  const quoted = value.match(/["“”']([^"“”']+)["“”']/)
  if (quoted?.[1]) return quoted[1].trim()

  const lower = value.toLowerCase()
  for (const family of FONT_FAMILIES) {
    if (lower.includes(family.toLowerCase())) return family
  }
  if (/\bmono|monospace|code\b/i.test(value)) {
    warnings.push(`No concrete ${label} font family found; using Courier New for mono typography.`)
    return 'Courier New'
  }
  if (/\bsans(?:[ -]serif)?\b/i.test(value)) {
    warnings.push(`No concrete ${label} font family found; using ${fallback} for sans typography.`)
    return fallback
  }
  if (/\bserif\b/i.test(value)) {
    warnings.push(
      `No concrete ${label} font family found; using Times New Roman for serif typography.`,
    )
    return 'Times New Roman'
  }
  warnings.push(
    `Could not derive a concrete ${label} font family from "${value}"; using ${fallback}.`,
  )
  return fallback
}

function warningCoveredByProfile(warning, profileFallback) {
  const palette = isPlainObject(profileFallback.palette) ? profileFallback.palette : {}
  const fonts = isPlainObject(profileFallback.fonts) ? profileFallback.fonts : {}
  const paletteCoverage = [
    ['background color', 'background'],
    ['primary text color', 'text'],
    ['accent color', 'accent'],
    ['secondary color', 'secondary'],
    ['surface color', 'surface'],
    ['soft accent color', 'softAccent'],
  ]
  for (const [needle, key] of paletteCoverage) {
    if (warning.includes(needle) && hasOwnValue(palette, key)) return true
  }
  const fontCoverage = [
    ['heading', 'heading'],
    ['body', 'body'],
    ['label', 'label'],
    ['CJK', 'cjk'],
  ]
  for (const [needle, key] of fontCoverage) {
    if (warning.includes(needle) && hasOwnValue(fonts, key)) return true
  }
  return false
}

function designFallbackFor(entry, catalogPath) {
  if (!entry?.designContract) return null
  const path = resolve(dirname(catalogPath), entry.designContract)
  if (!existsSync(path)) return null
  const design = JSON.parse(readFileSync(path, 'utf8'))
  const mapping = design.refurbish
  if (!isPlainObject(mapping)) return null
  const palette = {}
  const colorRoles = {
    background: 'background',
    text: 'text',
    accent: 'accent',
    softAccent: 'surface',
    secondary: 'muted',
    surface: 'surface',
    rule: 'line',
  }
  for (const [target, role] of Object.entries(colorRoles)) {
    const ref = mapping.palette?.[target] ?? mapping.palette?.[role]
    const color = hexFrom(design.colors?.[ref] ?? ref)
    if (color) palette[target] = color
  }
  const fonts = {}
  for (const [target, role] of Object.entries({
    heading: 'display',
    body: 'body',
    label: 'body',
    cjk: 'cjk',
  })) {
    const ref = mapping.fonts?.[target] ?? mapping.fonts?.[role]
    const font = design.fonts?.[ref]
    const family = target === 'cjk' ? font?.eastAsian : font?.latin
    if (typeof family === 'string' && family.trim()) fonts[target] = family
  }
  return { source: 'generic-design-contract', palette, fonts }
}

export function genericFallbackFor(entry, catalogPath = CATALOG_PATH) {
  const colors = entry?.visualGrammar?.colorSystem ?? {}
  const typography = entry?.visualGrammar?.typography ?? {}
  const warnings = []
  const background = firstColor(colors.background, 'F7F3E8', 'background', warnings)
  const text = firstColor(
    colors.primary,
    fallbackTextForBackground(background),
    'primary text',
    warnings,
  )
  const accent = firstColor(colors.accent, 'D9B44A', 'accent', warnings)
  const secondary = firstColor(
    colors.secondary ?? asArray(colors.primary).slice(1),
    fallbackSecondaryForBackground(background),
    'secondary',
    warnings,
  )
  const surface = firstColor(
    asArray(colors.background).slice(1),
    fallbackSurfaceForBackground(background),
    'surface',
    warnings,
  )
  const softAccent = firstColor(asArray(colors.accent).slice(1), 'EFE2B7', 'soft accent', warnings)
  const generic = {
    schemaVersion: 'pptx-nova-refurbish-fallback/v1',
    source: 'generic-visual-grammar',
    strategy: 'inspect-driven-editable-object-restyle',
    patchScript: 'scripts/cli/refurbish/fallback-patch.mjs',
    palette: {
      background,
      text,
      accent,
      softAccent,
      secondary,
      surface,
      rule: text,
    },
    fonts: {
      heading: fontFamilyFrom(typography.display, 'Aptos Display', 'heading', warnings),
      body: fontFamilyFrom(typography.body, 'Aptos', 'body', warnings),
      label: fontFamilyFrom(
        typography.label ?? typography.mono ?? typography.chrome,
        'Aptos',
        'label',
        warnings,
      ),
      cjk: fontFamilyFrom(typography.cjk, 'Microsoft YaHei', 'CJK', warnings),
    },
    headingBold: !/\bregular\b/i.test(typography.display ?? ''),
    styleOps: [
      'set-theme',
      'set-master',
      'set-default-text-style',
      'set-slide-background',
      'set-text-frame',
      'set-shape',
    ],
    chromePolicy: 'preserve-and-restyle-existing',
    contentPolicy: 'preserve-source-slides-and-editable-objects',
    derivationWarnings: warnings,
  }
  const design = designFallbackFor(entry, catalogPath)
  if (!design) return generic
  return {
    ...generic,
    ...design,
    palette: { ...generic.palette, ...design.palette },
    fonts: { ...generic.fonts, ...design.fonts },
    derivationWarnings: warnings.filter((warning) => !warningCoveredByProfile(warning, design)),
  }
}

export function mergeFallbackFor(entry, profileFallback, catalogPath = CATALOG_PATH) {
  const generic = genericFallbackFor(entry, catalogPath)
  if (!isPlainObject(profileFallback)) return generic
  const derivationWarnings = generic.derivationWarnings.filter(
    (warning) => !warningCoveredByProfile(warning, profileFallback),
  )
  return {
    ...generic,
    ...profileFallback,
    source: profileFallback.source ?? 'catalog',
    palette: { ...generic.palette, ...(profileFallback.palette ?? {}) },
    fonts: { ...generic.fonts, ...(profileFallback.fonts ?? {}) },
    derivationWarnings: [...derivationWarnings, ...stringArray(profileFallback.derivationWarnings)],
  }
}

export function fallbackFor(entry, catalogPath = CATALOG_PATH) {
  return mergeFallbackFor(entry, entry?.refurbishProfile?.fallback, catalogPath)
}

// A refurbishment palette is not an ordered Office color scheme. Prefer the
// kit's declared scheme/font roles; retain legacy derivation for undeclared slots.
export function themeFor(entry, fallback, catalogPath = CATALOG_PATH) {
  const p = fallback.palette
  const colors = {
    dk1: p.text,
    lt1: p.background,
    dk2: p.rule,
    lt2: p.surface,
    accent1: p.accent,
    accent2: p.text,
    accent3: p.softAccent,
    accent4: p.secondary,
    accent5: p.rule,
    accent6: p.surface,
    hlink: p.text,
    folHlink: p.secondary,
  }
  const fonts = {
    major: { typeface: fallback.fonts.heading, eastAsian: fallback.fonts.cjk },
    minor: { typeface: fallback.fonts.body, eastAsian: fallback.fonts.cjk },
  }
  if (!entry?.designContract) return { colors, fonts }
  const path = resolve(dirname(catalogPath), entry.designContract)
  if (!existsSync(path)) return { colors, fonts }
  const design = JSON.parse(readFileSync(path, 'utf8'))
  for (const slot of Object.keys(colors)) {
    const ref = design.theme?.colors?.[slot]
    if (ref === undefined) continue
    const value = hexFrom(design.colors?.[ref] ?? ref)
    if (!value) throw new Error(`Invalid declared theme color: ${slot}`)
    colors[slot] = value
  }
  for (const slot of ['major', 'minor']) {
    const ref = design.theme?.fonts?.[slot]
    if (ref === undefined) continue
    const role = design.fonts?.[ref]
    if (!role?.latin) throw new Error(`Invalid declared theme font: ${slot}`)
    fonts[slot] = { typeface: role.latin, ...(role.eastAsian ? { eastAsian: role.eastAsian } : {}) }
  }
  return { colors, fonts }
}
