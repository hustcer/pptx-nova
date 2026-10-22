// McKinsey Blue 2.0: one registered contract and component plan.
import { finishDesign, loadDesignContract } from './design-contract.mjs'
import { resolveMckDeck } from './mck-layouts.mjs'
import { renderMckPlan } from './mck-components.mjs'
export const DESIGN = loadDesignContract('mckinsey-blue')
export const C = DESIGN.colors
export const ACCENTS = [C.navy, C.primary, C.blue, C.teal]
export const FONT_EN = DESIGN.fonts.body.latin
export const FONT_CN = DESIGN.fonts.body.eastAsian
export function createDeck(content) {
  const r = resolveMckDeck(DESIGN, content)
  const result = finishDesign(DESIGN, content, renderMckPlan(DESIGN, r.layouts), r.layouts)
  result.warnings = r.warnings
  return result
}
