import { renderNativeEvidencePlan } from '../shared/native-evidence-plan.mjs'
export function renderForestPlan(d, layouts) {
  const patch = renderNativeEvidencePlan(d, layouts, d.forest)
  for (const op of patch.ops) {
    const l = layouts[op.slide],
      c = l?.components.find((c) => `S${op.slide}_${c.name}` === (op.name ?? op.shape?.name))
    if (op.op === 'set-text-frame' && op.text && c?.runs) op.text = c.runs[0].text
    if (op.op === 'set-run' && c?.style.role === 'mono' && !/\p{Script=Han}/u.test(c.text))
      op.font.letterSpacing = '1pt'
    if (op.op === 'set-run' && c?.style.role === 'display' && !/\p{Script=Han}/u.test(c.text))
      op.font.letterSpacing = '-0.5pt'
    if (op.op === 'set-slide-background') op.fill = { type: 'solid', color: d.colors[l.surface] }
    if (op.op === 'set-shape' && c?.outline) op.line = { color: d.colors[c.outline], width: '1pt' }
    if (op.op === 'set-table' && c?.dark)
      for (const cell of op.cells) cell.style.borders.bottom.color = d.colors.paper
    if (op.op === 'set-chart') {
      op.plot.gapWidth = 160
      op.plot.overlap = -20
      for (const s of op.series ?? [])
        s.fill = { type: 'solid', color: d.colors[s.series ? 'paper' : 'accent'] }
      for (const a of op.axes ?? []) {
        a.line = { color: d.colors.paper, width: '1pt' }
        a.ticks.font = {
          name: d.fonts.mono.latin,
          eastAsian: d.fonts.mono.eastAsian,
          size: '12pt',
          color: d.colors.paper,
        }
        if (a.axis === 'value') {
          a.ticks.visible = true
          a.gridlines = null
        }
      }
      for (const v of op.dataLabels ?? [])
        v.font = {
          name: d.fonts.mono.latin,
          eastAsian: d.fonts.mono.eastAsian,
          size: '12pt',
          color: d.colors.paper,
        }
    }
  }
  for (const [s, l] of layouts.entries())
    for (const c of l.components)
      for (const run of c.runs?.slice(1) ?? [])
        patch.ops.push({
          op: 'add-run',
          slide: s,
          shape: { name: `S${s}_${c.name}` },
          paragraph: 0,
          text: run.text,
          font: {
            name: d.fonts[run.style.role].latin,
            eastAsian: d.fonts[run.style.role].eastAsian,
            size: run.style.sizePt + 'pt',
            color: d.colors[run.style.color],
            bold: false,
            italic: false,
          },
        })
  return patch
}
