import { createOps } from './core-primitives.kit.mjs'
import { designTheme } from './design-contract.mjs'

export function renderAmberPlan(design, layouts) {
  const p = createOps({ textbox: design.textFrame }),
    C = design.colors,
    b = design.amber
  p.ops.push(designTheme(design))
  const font = (st) => ({
    name: design.fonts[st.role].latin,
    eastAsian: design.fonts[st.role].eastAsian,
    size: `${st.sizePt}pt`,
    color: C[st.color],
    bold: st.bold ?? false,
    italic: false,
  })
  const text = (s, name, c) => {
    p.setText(s, name, c.text)
    c.text.split(/\r\n|\r|\n/).forEach((_, i) => {
      p.runFont(s, name, font(c.style), i)
      p.ops.push({
        op: 'set-paragraph',
        slide: s,
        shape: { name },
        paragraph: i,
        format: {
          alignment: c.style.alignment ?? 'left',
          lineSpacing: c.style.lineHeight,
          spaceAfter: '0pt',
        },
      })
    })
    p.ops.push({
      op: 'set-text-frame',
      slide: s,
      shape: { name },
      frame: {
        verticalAnchor: 'top',
        marginLeft: '0in',
        marginRight: '0in',
        marginTop: '0in',
        marginBottom: '0in',
        autofit: { mode: 'none' },
      },
    })
  }
  for (const [s, l] of layouts.entries()) {
    p.addSlide(s, C.paper)
    for (const c of l.components) {
      const name = `S${s}_${c.name}`,
        [x, y, w, h] = c.frame
      if (c.kind === 'text') {
        p.textbox(s, name, x, y, w, h)
        text(s, name, c)
      } else if (['box', 'circle'].includes(c.kind))
        p.box(s, name, c.kind === 'circle' ? 'ellipse' : 'rectangle', x, y, w, h, C[c.color])
      else if (c.kind === 'microLine') {
        const commands = c.points.map(([a, b], i) => ({
          type: i ? 'line' : 'move',
          x: Math.round(a * 100000),
          y: Math.round(b * 100000),
        }))
        p.ops.push({
          op: 'add-freeform',
          slide: s,
          name,
          x: x + 'in',
          y: y + 'in',
          w: w + 'in',
          h: h + 'in',
          path: { width: 100000, height: 100000, commands },
        })
        p.ops.push({
          op: 'set-shape',
          slide: s,
          shape: { name },
          fill: { type: 'none' },
          line: { color: C.ink, width: '1.6pt' },
        })
      } else if (c.kind === 'table') {
        p.ops.push({
          op: 'add-table',
          slide: s,
          name,
          rows: c.cells.length,
          columns: c.cells[0].length,
          x: x + 'in',
          y: y + 'in',
          w: w + 'in',
          h: h + 'in',
          data: c.cells,
        })
        p.ops.push({
          op: 'set-table',
          slide: s,
          shape: { name },
          style: { firstRow: false, horizontalBanding: false, verticalBanding: false },
          columns: c.widths.map((v, column) => ({ column, width: v + 'in' })),
          rows: c.rowHeights.map((v, row) => ({ row, height: v + 'in' })),
          cells: c.cells.flatMap((row, i) =>
            row.map((_, j) => ({
              row: i,
              column: j,
              style: {
                fill:
                  j === c.focusColumn ? { type: 'solid', color: C[c.focusTone] } : { type: 'none' },
                font: font({
                  ...b.styles.small,
                  bold: i === 0 || j === c.focusColumn,
                  color: j === c.focusColumn && c.focusTone === 'ink' ? 'paper' : 'ink',
                }),
                alignment: c.columns[j].align,
                verticalAnchor: 'middle',
                marginLeft: '0.07in',
                marginRight: '0.07in',
                marginTop: '0.05in',
                marginBottom: '0.05in',
                borders: {
                  top: { noLine: true },
                  left: { noLine: true },
                  right: { noLine: true },
                  bottom: { color: C.rule, width: b.spacing.rulePt + 'pt' },
                },
              },
            })),
          ),
        })
      } else if (c.kind === 'chart') {
        const ring = c.chartKind === 'doughnut',
          line = c.chartKind === 'line',
          colors = ['ink', 'accent', 'history', 'body']
        p.ops.push({
          op: 'add-chart',
          slide: s,
          name,
          kind: c.chartKind,
          ...(!ring ? { variant: line ? 'markers' : 'clustered' } : {}),
          x: x + 'in',
          y: y + 'in',
          w: w + 'in',
          h: h + 'in',
          data: c.data,
        })
        const series = {
          series: 0,
          fill: { type: 'solid', color: C.history },
          line: { color: C.ink, width: line ? '1.6pt' : '0pt' },
          ...(line ? { smooth: false } : !ring ? { invertIfNegative: false } : {}),
        }
        if (line) {
          series.marker = { symbol: 'circle', size: 5, fill: C.ink, line: C.ink }
          series.points = [
            {
              point: c.focusPoint,
              marker: { symbol: 'circle', size: 6, fill: C.accent, line: C.accent },
            },
          ]
        } else
          series.points = c.data.categories.map((_, i) => ({
            point: i,
            fill: {
              type: 'solid',
              color:
                C[ring ? colors[i] : i === c.data.categories.length - 1 ? 'accent' : 'history'],
            },
            line: { color: C.paper, width: ring ? '1pt' : '0pt' },
          }))
        p.ops.push({
          op: 'set-chart',
          slide: s,
          shape: { name },
          series: [series],
          ...(!ring
            ? {
                axes: [
                  {
                    axis: 'category',
                    line: { color: C.rule, width: '0.65pt' },
                    ticks: {
                      font: font(b.styles.small),
                      major: 'none',
                      minor: 'none',
                      labelPosition: 'low',
                    },
                  },
                  {
                    axis: 'value',
                    scale: { min: c.minimum, max: c.maximum },
                    line: { color: C.paper, width: '0pt' },
                    gridlines: { color: C.rule, width: '0.4pt' },
                    minorGridlines: null,
                    ticks: {
                      visible: line,
                      font: font(b.styles.small),
                      major: 'none',
                      minor: 'none',
                    },
                  },
                ],
              }
            : {}),
          dataLabels: [
            {
              showValue: !ring,
              showSeriesName: false,
              showCategoryName: false,
              showPercentage: false,
              ...(!ring ? { position: line ? 'above' : 'outside-end' } : {}),
              font: font({ ...b.styles.small, color: 'ink' }),
              numberFormat: c.numberFormat,
            },
          ],
          ...(!line
            ? { plot: ring ? { holeSize: 68, firstSliceAngle: 270 } : { gapWidth: 85 } }
            : {}),
        })
      } else throw Error(`Unregistered Amber Ledger component: ${c.kind}`)
    }
  }
  return { schemaVersion: 'pptx-patch/v1', ops: p.ops }
}
