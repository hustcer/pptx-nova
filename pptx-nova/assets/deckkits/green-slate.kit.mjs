// Green Slate 0.1.0: contract adapter for bounded strategy reports.
import { loadDesignContract } from './design-contract.mjs'
import { createStrategyDeck } from './strategy-components.mjs'
export const DESIGN = loadDesignContract('green-slate')
export const createDeck = (content) => createStrategyDeck(DESIGN, content)
