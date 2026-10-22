import { loadDesignContract } from './design-contract.mjs'
import { createAnnualDeck } from './annual-components.mjs'
export const DESIGN = loadDesignContract('clear-value')
export const createDeck = (content) => createAnnualDeck(DESIGN, content)
