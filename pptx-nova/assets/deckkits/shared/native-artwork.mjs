// Shared, theme-independent editable illustrations; no reference-topic text or bitmap assets.
export const ARTWORK_PATH_NAMES = new Set([
  ...Array.from({ length: 5 }, (_, i) => `ArtworkContour${i}`),
  'ArtworkPageBack',
  'ArtworkPageFront',
  'ArtworkPageFold',
  'ArtworkPageAccent',
  ...Array.from({ length: 3 }, (_, i) => `ArtworkPageRule${i}`),
  ...Array.from({ length: 3 }, (_, i) => `ArtworkOutput${i}`),
  ...Array.from({ length: 4 }, (_, i) => `ArtworkLink${i}`),
  ...Array.from({ length: 4 }, (_, i) => `ArtworkNode${i}`),
  'ArtworkHubRing',
  'ArtworkHubDot',
])

export const NATIVE_ARTWORK_KINDS = ['contours', 'documents', 'connections']

/** Return native-evidence components for any kit; the caller owns region and palette roles. */
export function createNativeArtwork({
  frame,
  kind = 'contours',
  tones = { surface: 'paper', ink: 'ink', accent: 'accent', secondary: 'highlight' },
  linePt = 1.25,
  accentPt = 3.2,
  prefix = 'Artwork',
}) {
  if (!NATIVE_ARTWORK_KINDS.includes(kind)) throw Error('Unregistered native artwork: ' + kind)
  if (
    !Array.isArray(frame) ||
    frame.length !== 4 ||
    frame.some((v) => !Number.isFinite(v)) ||
    frame[0] < 0 ||
    frame[1] < 0 ||
    frame[2] <= 0 ||
    frame[3] <= 0
  )
    throw Error('Native artwork requires a nonnegative origin and positive finite dimensions')
  if (![linePt, accentPt].every((v) => Number.isFinite(v) && v > 0))
    throw Error('Native artwork line widths must be positive and finite')
  if (typeof prefix !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix))
    throw Error('Native artwork prefix must be an object-name identifier')
  if (
    ['surface', 'ink', 'accent', 'secondary'].some((k) => typeof tones[k] !== 'string' || !tones[k])
  )
    throw Error('Native artwork requires all four color roles')
  const spec = { linePt, accentPt }
  const out = []
  const move = (x, y) => ({ type: 'move', x, y })
  const line = (x, y) => ({ type: 'line', x, y })
  const curve = (x1, y1, x2, y2, x, y) => ({ type: 'cubic', x1, y1, x2, y2, x, y })
  const path = (name, commands, fill, color = 'ink', linePt = spec.linePt) =>
    out.push({
      kind: 'path',
      name: prefix + name,
      frame: [...frame],
      fill: fill
        ? {
            paper: tones.surface,
            ink: tones.ink,
            accent: tones.accent,
            highlight: tones.secondary,
          }[fill]
        : undefined,
      line: color
        ? {
            paper: tones.surface,
            ink: tones.ink,
            accent: tones.accent,
            highlight: tones.secondary,
          }[color]
        : undefined,
      linePt,
      path: {
        width: 100000,
        height: 100000,
        commands: commands.map((c) =>
          Object.fromEntries(
            Object.entries(c).map(([k, v]) => [k, k === 'type' ? v : Math.round(v * 100000)]),
          ),
        ),
      },
    })
  const polygon = (name, points, fill, color) =>
    path(
      name,
      points.map(([x, y], i) => (i ? line(x, y) : move(x, y))).concat({ type: 'close' }),
      fill,
      color,
    )
  const rectangle = (name, x, y, w, h, fill, color) =>
    polygon(
      name,
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      fill,
      color,
    )
  const circle = (name, cx, cy, radius, fill, color) => {
    const scale = Math.min(frame[2], frame[3])
    const rx = (radius * scale) / frame[2],
      ry = (radius * scale) / frame[3],
      k = 0.55228475
    path(
      name,
      [
        move(cx + rx, cy),
        curve(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry),
        curve(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy),
        curve(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry),
        curve(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy),
        { type: 'close' },
      ],
      fill,
      color,
    )
  }
  if (kind === 'contours') {
    for (let i = 0; i < 5; i++) {
      const offset = i * 0.105
      path(
        'Contour' + i,
        [
          move(0.07 + offset, 0.02),
          curve(0.03 + offset, 0.3, 0.75 + offset * 0.3, 0.23, 0.9 - offset * 0.2, 0.5),
          curve(0.99 - offset * 0.2, 0.76, 0.26 + offset, 0.69, 0.14 + offset, 0.98),
        ],
        undefined,
        i === 2 ? 'accent' : 'ink',
        i === 2 ? spec.accentPt : spec.linePt,
      )
    }
  } else if (kind === 'documents') {
    rectangle('PageBack', 0.27, 0.03, 0.6, 0.67, 'highlight')
    polygon(
      'PageFront',
      [
        [0.13, 0.14],
        [0.6, 0.14],
        [0.73, 0.27],
        [0.73, 0.79],
        [0.13, 0.79],
      ],
      'paper',
    )
    polygon(
      'PageFold',
      [
        [0.6, 0.14],
        [0.6, 0.27],
        [0.73, 0.27],
      ],
      'accent',
    )
    rectangle('PageAccent', 0.23, 0.28, 0.12, 0.05, 'accent', false)
    for (let i = 0; i < 3; i++)
      path('PageRule' + i, [
        move(0.23, 0.43 + i * 0.11),
        line(i === 2 ? 0.49 : 0.62, 0.43 + i * 0.11),
      ])
    path('Link0', [move(0.43, 0.79), line(0.43, 0.86), line(0.16, 0.86), line(0.16, 0.91)])
    path('Link1', [move(0.43, 0.86), line(0.5, 0.86), line(0.5, 0.91)])
    path('Link2', [move(0.5, 0.86), line(0.84, 0.86), line(0.84, 0.91)])
    for (let i = 0; i < 3; i++)
      rectangle('Output' + i, 0.06 + i * 0.34, 0.91, 0.2, 0.08, i === 1 ? 'accent' : 'paper')
  } else if (kind === 'connections') {
    const center = [0.51, 0.49],
      nodes = [
        [0.15, 0.14],
        [0.85, 0.16],
        [0.85, 0.84],
        [0.15, 0.85],
      ]
    nodes.forEach(([nx, ny], i) => {
      const vx = (nx - center[0]) * frame[2],
        vy = (ny - center[1]) * frame[3],
        distance = Math.hypot(vx, vy)
      const scale = Math.min(frame[2], frame[3]),
        sx = center[0] + ((vx / distance) * 0.16 * scale) / frame[2],
        sy = center[1] + ((vy / distance) * 0.16 * scale) / frame[3]
      const ex = nx - ((vx / distance) * 0.1 * scale) / frame[2],
        ey = ny - ((vy / distance) * 0.1 * scale) / frame[3]
      path('Link' + i, [move(sx, sy), curve(sx, (sy + ey) / 2, ex, (sy + ey) / 2, ex, ey)])
      circle('Node' + i, nx, ny, 0.1, i === 1 || i === 3 ? 'accent' : 'paper')
    })
    circle('HubRing', ...center, 0.16, 'paper')
    circle('HubDot', ...center, 0.052, 'accent', false)
  } else throw Error(`Unregistered native artwork: ${kind}`)
  return out
}

/** Emit a standalone xdoc patch for the same shared artwork, independently of any DeckKit. */
export function createNativeArtworkPatch({
  slide,
  frame,
  kind,
  palette,
  prefix = 'NativeVisual',
  linePt,
  accentPt,
}) {
  if (!Number.isSafeInteger(slide) || slide < 0)
    throw Error('Native artwork slide must be a nonnegative integer')
  if (typeof prefix !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix))
    throw Error('Native artwork prefix must be an object-name identifier')
  const roles = ['surface', 'ink', 'accent', 'secondary']
  if (
    !palette ||
    roles.some((k) => typeof palette[k] !== 'string' || !/^[0-9a-fA-F]{6}$/.test(palette[k]))
  )
    throw Error('Native artwork palette requires four six-digit RGB colors')
  const components = createNativeArtwork({
    frame,
    kind,
    linePt,
    accentPt,
    tones: Object.fromEntries(roles.map((k) => [k, k])),
  })
  return {
    schemaVersion: 'pptx-patch/v1',
    ops: components.flatMap((c) => {
      const name = `${prefix}_${c.name}`,
        [x, y, w, h] = c.frame
      return [
        {
          op: 'add-freeform',
          slide,
          name,
          x: x + 'in',
          y: y + 'in',
          w: w + 'in',
          h: h + 'in',
          path: c.path,
        },
        {
          op: 'set-shape',
          slide,
          shape: { name },
          fill: c.fill ? { type: 'solid', color: palette[c.fill] } : { type: 'none' },
          line: c.line ? { color: palette[c.line], width: c.linePt + 'pt' } : { noLine: true },
        },
      ]
    }),
  }
}
