// Registration seam for visual families: shared callers discover/resolve/validate
// through this interface. Existing families can move here independently.
import { CARTESIAN_FAMILY } from './cartesian-registry.mjs'
export const DESIGN_FAMILIES = [CARTESIAN_FAMILY]
export const registeredDesignFamily = (design) => DESIGN_FAMILIES.find((f) => design[f.key])
export const registeredDesignChecks = DESIGN_FAMILIES.flatMap((f) => Object.keys(f.checks))
