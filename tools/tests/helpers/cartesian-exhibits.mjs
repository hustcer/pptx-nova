export function cartesianChartMatrix() {
  const categorical = {
    categories: ['A', 'B', 'C'],
    series: [{ name: 'Sample', values: [3, 4, 6] }],
  }
  const extra = {
    histogram: { values: [1, 2, 3, 4, 5, 6, 7, 8], binCount: 4 },
    treemap: {
      nodes: [
        { id: 'r', label: 'Root', value: 9 },
        { id: 'a', parent: 'r', label: 'A', value: 3 },
        { id: 'b', parent: 'r', label: 'B', value: 6 },
      ],
    },
    'box-whisker': {
      series: [
        { name: 'Sample', values: [1, 2, 3, 4, 5] },
        { name: 'Second', values: [2, 4, 6, 8, 10] },
      ],
    },
  }
  extra.sunburst = structuredClone(extra.treemap)
  const kinds = [
    'column',
    'column-3d',
    'bar-3d',
    'line',
    'line-3d',
    'area-3d',
    'pie-3d',
    'surface',
    'surface-3d',
    'scatter',
    'bubble',
    'radar',
    'doughnut',
    ...Object.keys(extra),
  ]
  return {
    meta: { deckkit: 'cartesian', designScope: 'excerpt' },
    slides: kinds.map((kind) => ({
      type: 'cartesianAnalyticalSlide',
      data: {
        label: 'TEST',
        title: kind,
        body: 'Synthetic test data',
        source: 'Synthetic',
        specimen: {
          kind: 'charts',
          charts: [
            {
              kind,
              caption: kind,
              ...(kind === 'histogram'
                ? { labels: [{ scope: { plot: 0 }, showValue: true, showCategoryName: true }] }
                : {}),
              ...(extra[kind]
                ? { dataEx: structuredClone(extra[kind]) }
                : {
                    data: ['scatter', 'bubble'].includes(kind)
                      ? {
                          series: [
                            {
                              name: 'Sample',
                              points: [
                                { x: 1, y: 2, ...(kind === 'bubble' ? { size: 3 } : {}) },
                                { x: 2, y: 3, ...(kind === 'bubble' ? { size: 5 } : {}) },
                              ],
                            },
                          ],
                        }
                      : structuredClone(categorical),
                  }),
              ...(['column', 'column-3d', 'bar-3d'].includes(kind) ? { variant: 'clustered' } : {}),
            },
          ],
        },
      },
    })),
  }
}
