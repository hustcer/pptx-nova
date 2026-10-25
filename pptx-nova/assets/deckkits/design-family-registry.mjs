import { AMBER_FAMILY } from './amber-registry.mjs'
import { PULSE_FAMILY } from './pulse-registry.mjs'
// Registration seam for visual families: shared callers discover/resolve/validate
// through this interface. Existing families can move here independently.
import { CARTESIAN_FAMILY } from './cartesian-registry.mjs'
import { BROADSIDE_FAMILY } from './broadside-registry.mjs'
import { LONG_TABLE_FAMILY } from './long-table-registry.mjs'
import { SWISS_FAMILY } from './swiss-registry.mjs'
import { MCK_FAMILY } from './mck-registry.mjs'
import { CONSULTING_FAMILY } from './consulting-registry.mjs'
import { IMPACT_FAMILY } from './impact-registry.mjs'
import { CLAY_FAMILY } from './clay-registry.mjs'
export const DESIGN_FAMILIES = [
  PULSE_FAMILY,
  AMBER_FAMILY,
  CLAY_FAMILY,
  CARTESIAN_FAMILY,
  BROADSIDE_FAMILY,
  LONG_TABLE_FAMILY,
  SWISS_FAMILY,
  MCK_FAMILY,
  CONSULTING_FAMILY,
  IMPACT_FAMILY,
]
export const registeredDesignFamily = (design) => DESIGN_FAMILIES.find((f) => design[f.key])
export const registeredDesignChecks = DESIGN_FAMILIES.flatMap((f) => Object.keys(f.checks))
