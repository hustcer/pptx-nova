// Long Table 2.0 — all eight roles execute the registered design plan.
import { loadDesignContract } from './design-contract.mjs'
import { createLongTableDeck } from './long-table-components.mjs'
export const DESIGN = loadDesignContract('long-table')
export const C = DESIGN.colors
export const FONT_DISPLAY = DESIGN.fonts.display.latin
export const FONT_BODY = DESIGN.fonts.body.latin
export const createDeck = (content) => createLongTableDeck(DESIGN, content)
