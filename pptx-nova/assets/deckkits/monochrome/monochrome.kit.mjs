// Stable adapter; the registered contract owns typography, geometry and capacity.
import { finishDesign, loadDesignContract } from '../shared/design-contract.mjs'
import { MONOCHROME_FAMILY } from './registry.mjs'
import { renderMonochromePlan } from './components.mjs'
export const DESIGN = loadDesignContract('monochrome')
export const C = DESIGN.colors
export const FONT_EN = DESIGN.fonts.body.latin
export const FONT_CN = DESIGN.fonts.body.eastAsian
export function createDeck(content) {
  const result = MONOCHROME_FAMILY.resolve(DESIGN, content)
  return {
    ...finishDesign(DESIGN, content, renderMonochromePlan(DESIGN, result.layouts), result.layouts),
    warnings: result.warnings,
  }
}
