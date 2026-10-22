// Consulting Dark 2.0: a registered editorial consulting language.
import { loadDesignContract, finishDesign } from './design-contract.mjs'
import { resolveConsultingDeck } from './consulting-layouts.mjs'
import { renderConsultingPlan } from './consulting-components.mjs'
export const DESIGN = loadDesignContract('consulting-dark')
export const C = DESIGN.colors
export const ACCENTS = [C.primary, C.teal]
export const FONT_EN = DESIGN.fonts.body.latin
export const FONT_CN = DESIGN.fonts.body.eastAsian
export function createDeck(content) {
  const r = resolveConsultingDeck(DESIGN, content)
  const result = finishDesign(DESIGN, content, renderConsultingPlan(DESIGN, r.layouts), r.layouts)
  result.warnings = r.warnings
  return result
}
