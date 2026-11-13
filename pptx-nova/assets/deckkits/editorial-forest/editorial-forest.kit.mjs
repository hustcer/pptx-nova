import { finishDesign, loadDesignContract } from '../shared/design-contract.mjs'
import { FOREST_FAMILY } from './registry.mjs'
import { renderForestPlan } from './components.mjs'
export const DESIGN = loadDesignContract('editorial-forest')
export const C = DESIGN.colors
export function createDeck(content) {
  const resolved = FOREST_FAMILY.resolve(DESIGN, content)
  return {
    ...finishDesign(DESIGN, content, renderForestPlan(DESIGN, resolved.layouts), resolved.layouts),
    warnings: resolved.warnings,
  }
}
