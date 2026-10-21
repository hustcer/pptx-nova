import { validateContent } from './core-primitives.kit.mjs'
import { loadDesignContract, resolveDesignSlot, resolveEvidenceLayout } from './design-contract.mjs'
import { readFileSync } from 'node:fs'
import { resolveEditorialDeck } from './editorial-layouts.mjs'
import { resolveStrategyDeck } from './strategy-layouts.mjs'

// Keep legacy validation intact. Only registered design contracts add semantic checks.
export function validateDeckkitContent(content, options = {}) {
  const result = validateContent(content, options)
  if (!result.valid && result.errors.some((e) => e.type !== 'diversity')) return result
  try {
    const design = loadDesignContract(options.deckkit || content.meta.deckkit)
    if (!design) return result
    if (design.editorial || design.strategy) {
      const resolved = design.strategy
        ? resolveStrategyDeck(design, content)
        : resolveEditorialDeck(design, content)
      result.errors = result.errors.filter((e) => e.type !== 'diversity')
      result.warnings = result.warnings.filter((e) => e.type !== 'diversity')
      result.fitDiagnostics = result.fitDiagnostics.filter((d) => !d.code?.startsWith('diversity.'))
      result.valid = result.errors.length === 0
      result.designDiversity = {
        mode: design.strategy ? 'resolved-strategy-layouts' : 'resolved-editorial-layouts',
        uniqueCompositions: new Set(resolved.layouts.map((r) => r.fingerprint)).size,
      }
      for (const message of resolved.warnings) result.warnings.push({ type: 'design', message })
      return result
    }
    const nativeOnly = content.slides.every((s) => s.type === design.evidence.slideType)
    const replaced = []
    if (nativeOnly) {
      // A proof-only deck has no reason to invent editorial pages. Its diversity
      // comes from resolved compositions, not the single evidence type label.
      for (const d of result.fitDiagnostics) {
        if (d.code?.startsWith('diversity.')) replaced.push(d.code)
      }
      result.errors = result.errors.filter((e) => e.type !== 'diversity')
      result.warnings = result.warnings.filter((e) => e.type !== 'diversity')
      result.fitDiagnostics = result.fitDiagnostics.filter((d) => !d.code?.startsWith('diversity.'))
      result.valid = result.errors.length === 0
    }
    if (!result.valid) return result
    // Generic schema budgets summarize repeating slots conservatively. Replace their
    // approximate warnings with the actual instance frame and composed text budget.
    const projected = new Set(
      content.slides.flatMap((s, i) => (design.legacyLayouts[s.type] ? [i] : [])),
    )
    const generic = (d) => d.code?.startsWith('slotBudget.') && projected.has(d.slideIndex)
    result.warnings = result.warnings.filter((w) => !generic(w.diagnostic ?? {}))
    result.fitDiagnostics = result.fitDiagnostics.filter((d) => !generic(d))
    result.designCapacity = []
    content.slides.forEach((slide, slideIndex) => {
      if (!design.legacyLayouts[slide.type]) return
      const schema = JSON.parse(
        readFileSync(
          new URL(`./schemas/${design.id}/${slide.type}.schema.json`, import.meta.url),
          'utf8',
        ),
      )
      const groups = new Map()
      const visit = (value, node, index = 0) => {
        if (node['x-designSlot'] && typeof value === 'string') {
          const name = node['x-designSlot'].replace('{i}', index)
          const item = groups.get(name) ?? {
            slot: resolveDesignSlot(design, slide.type, name),
            values: [],
          }
          item.values.push(value)
          groups.set(name, item)
        }
        if (Array.isArray(value)) value.forEach((v, i) => visit(v, node.items, i))
        else if (value && typeof value === 'object') {
          for (const [k, child] of Object.entries(node.properties ?? {})) {
            if (Object.hasOwn(value, k)) visit(value[k], child, index)
          }
        }
      }
      visit(slide.data, schema)
      for (const [name, { slot, values }] of groups) {
        const text = values.join('')
        const advance = slot.font.role === 'display' ? 0.46 : slot.font.role === 'mono' ? 0.6 : 0.5
        const capacity = ((slot.frame[2] - 0.04) * 72) / slot.font.sizePt
        const lines = text
          .split('\n')
          .reduce(
            (sum, line) =>
              sum +
              Math.max(
                1,
                Math.ceil(
                  [...line].reduce((n, c) => n + (c.codePointAt(0) > 255 ? 1 : advance), 0) /
                    capacity,
                ),
              ),
            0,
          )
        const maxLines = Math.max(
          1,
          Math.floor(
            (slot.frame[3] * 72) / (slot.font.sizePt * (slot.paragraph?.lineSpacing ?? 1.2)),
          ),
        )
        const evidence = {
          slideIndex,
          slot: name,
          estimatedLines: lines,
          maxLines,
          method: slot.autofit ? 'autofit-requires-render-review' : 'approximate-font-advance',
        }
        result.designCapacity.push(evidence)
        if (!slot.autofit && lines > maxLines) {
          const message = `slides[${slideIndex}].${name}: estimated ${lines} lines exceeds instance capacity ${maxLines}; render review required`
          const diagnostic = {
            slideIndex,
            code: 'design.slot.capacity',
            path: `slides[${slideIndex}].${name}`,
            severity: 'warning',
            blocking: false,
            message,
            ...evidence,
          }
          result.fitDiagnostics.push(diagnostic)
          result.warnings.push({ type: 'fit', message, diagnostic })
        }
      }
    })
    const history = []
    for (const slide of content.slides) {
      if (slide.type === design.evidence.slideType) {
        const resolved = resolveEvidenceLayout(design, slide, history)
        history.push(resolved)
      }
    }
    if (nativeOnly) {
      result.designDiversity = {
        mode: 'resolved-evidence-layouts',
        uniqueCompositions: new Set(history.map((r) => r.fingerprint)).size,
        replacedLegacyCodes: [...new Set(replaced)],
      }
      history.forEach((r, slideIndex) => {
        if (!r.repeated || r.candidates.length < 2) return
        const message = `slides[${slideIndex}]: resolved composition repeats despite fitting alternatives; prefer layoutId=auto or review the intended rhythm`
        const diagnostic = {
          code: 'design.diversity.repeated',
          slideIndex,
          severity: 'warning',
          blocking: false,
          message,
        }
        result.fitDiagnostics.push(diagnostic)
        result.warnings.push({ type: 'diversity', message, diagnostic })
      })
    }
  } catch (error) {
    result.errors.push({ type: 'design', path: 'slides', message: error.message })
    result.valid = false
  }
  return result
}
