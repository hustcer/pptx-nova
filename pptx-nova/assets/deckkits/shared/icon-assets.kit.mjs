// icon-assets.kit.mjs - local Tabler icon pack consumption for DeckKit generators
import { getTablerIconAsset } from '../../../scripts/lib/assets/tabler-icons.mjs'

export {
  getTablerIconAsset,
  getTablerIconPackInfo,
  getTablerIconSvg,
  hasTablerIcon,
  listTablerIconNames,
  loadTablerIcons,
  loadTablerIconSet,
  normalizeTablerIconName,
  resolveTablerIconEntry,
  resolveTablerIconName,
  searchTablerIcons,
} from '../../../scripts/lib/assets/tabler-icons.mjs'

const unit = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${value}in` : value)

export const DEFAULT_DECKKIT_ICON_STROKE = 1.2
export const MAX_DECKKIT_ICON_STROKE = 1.5

export function addTablerIconPicture(ops, slide, shapeName, iconName, x, y, w, h, options = {}) {
  if (!Array.isArray(ops)) {
    throw new Error('addTablerIconPicture requires an ops array')
  }
  const strokeWidth = Number(options.strokeWidth ?? DEFAULT_DECKKIT_ICON_STROKE)
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0 || strokeWidth > MAX_DECKKIT_ICON_STROKE)
    throw new Error('DeckKit icon strokeWidth must be positive and must not exceed 1.5')
  const op = {
    op: 'add-image',
    slide,
    name: shapeName,
    x: unit(x),
    y: unit(y),
    w: unit(w),
    h: unit(h),
    ...getTablerIconAsset(iconName, { ...options, strokeWidth }),
  }
  ops.push(op)
  return op
}
