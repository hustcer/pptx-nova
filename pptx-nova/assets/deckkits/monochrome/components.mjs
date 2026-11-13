import { renderNativeEvidencePlan } from '../shared/native-evidence-plan.mjs'

// Reuse the existing native plan executor; only the literary typography and shells are specific.
export function renderMonochromePlan(design, layouts) {
  const patch = renderNativeEvidencePlan(design, layouts, design.monochrome)
  for (const op of patch.ops) {
    const c = layouts[op.slide]?.components.find((c) => `S${op.slide}_${c.name}` === op.shape?.name)
    if (op.op === 'set-slide-background')
      op.fill.color = design.colors[layouts[op.slide].surface ?? 'paper']
    if (op.op === 'set-run' && c?.style) {
      op.font.italic = !!c.style.italic && !/[\u2e80-\u9fff]/u.test(c.text)
      if (c.style.trackingPt && !/[\u2e80-\u9fff]/u.test(c.text))
        op.font.letterSpacing = `${c.style.trackingPt}pt`
    }
    if (op.op === 'set-chart') {
      for (const a of op.axes ?? []) if (a.axis === 'value') a.gridlines = null
    }
  }
  return patch
}
