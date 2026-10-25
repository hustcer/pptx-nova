import { finishDesign, loadDesignContract } from './design-contract.mjs'
import { SKY_FAMILY } from './sky-registry.mjs'
import { renderNativeEvidencePlan } from './native-evidence-plan.mjs'
export const DESIGN = loadDesignContract('sky-compass')
export const C = DESIGN.colors
export const FONT_EN = DESIGN.fonts.display.latin
export const FONT_CN = DESIGN.fonts.display.eastAsian
export function createDeck(content) {
  const result = SKY_FAMILY.resolve(DESIGN, content)
  return {
    ...finishDesign(
      DESIGN,
      content,
      renderNativeEvidencePlan(DESIGN, result.layouts, DESIGN.sky),
      result.layouts,
    ),
    warnings: result.warnings,
  }
}
