const pictures = (inspect) =>
  (inspect?.slides ?? []).flatMap((slide) =>
    (slide.shapes ?? [])
      .filter((shape) => ['picture', 'image'].includes(shape.shapeType))
      .map((shape) => ({ slide, shape })),
  )

function dimensions(shape) {
  const box = shape?.bbox
  const w = Number(box?.wEmu),
    h = Number(box?.hEmu)
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { wEmu: w, hEmu: h } : null
}

function crop(shape) {
  if (
    !shape?.image ||
    !Object.hasOwn(shape.image, 'crop') ||
    !Object.hasOwn(shape.image, 'maskPreset')
  )
    return null
  const values = ['left', 'top', 'right', 'bottom'].map((key) =>
    Number(shape.image.crop?.[key] ?? 0),
  )
  return values.every(Number.isFinite) ? values : null
}

/** Checks original slide-local picture frames, not their media bytes, effects, or grouped transforms. */
export function buildImageGeometryReport({
  sourceInspect,
  candidateInspect,
  source = null,
  candidate = null,
}) {
  const sourcePictures = pictures(sourceInspect)
  const issues = [],
    results = []
  for (const { slide, shape } of sourcePictures) {
    const local = []
    const targetSlides = (candidateInspect?.slides ?? []).filter(
      (s) => slide.partName && s.partName === slide.partName,
    )
    const matches =
      targetSlides.length === 1 && Number.isInteger(shape.id) && shape.id > 0
        ? (targetSlides[0].shapes ?? []).filter((s) => s.id === shape.id)
        : []
    const target = matches.length === 1 ? matches[0] : null
    const add = (code, message) =>
      local.push({
        code,
        message,
        slideNumber: slide.index + 1,
        slidePart: slide.partName,
        shapeId: shape.id,
      })
    if (!target || !['picture', 'image'].includes(target.shapeType))
      add(
        'picture-identity-unresolved',
        'Original picture identity is missing, ambiguous, or no longer a picture; no remapping was guessed.',
      )
    const before = dimensions(shape),
      after = dimensions(target)
    const beforeCrop = crop(shape),
      afterCrop = crop(target)
    let scaleX = null,
      scaleY = null
    if (!before || !after)
      add(
        'picture-geometry-undisclosed',
        'Positive source and candidate frame dimensions are required.',
      )
    else {
      scaleX = after.wEmu / before.wEmu
      scaleY = after.hEmu / before.hEmu
      // At most one EMU of rounding on each candidate dimension; do not hide perceptible stretching.
      if (
        Math.abs(after.wEmu * before.hEmu - after.hEmu * before.wEmu) >
        before.wEmu + before.hEmu
      ) {
        add(
          'picture-nonuniform-scale',
          'Source picture width and height were scaled independently.',
        )
      }
    }
    if (!beforeCrop || !afterCrop)
      add(
        'picture-crop-undisclosed',
        'Both source and candidate crop and mask disclosure are required.',
      )
    else {
      if (JSON.stringify(beforeCrop) !== JSON.stringify(afterCrop))
        add('picture-crop-changed', 'Source picture crop offsets changed.')
    }
    const masks = [shape.image?.maskPreset, target?.image?.maskPreset]
    if (masks.some((mask) => typeof mask !== 'string' || !mask.trim()))
      add(
        'picture-mask-undisclosed',
        'Custom or undisclosed picture masks require independent geometry evidence; equal null presets do not prove preservation.',
      )
    else if (masks[0] !== masks[1])
      add('picture-mask-changed', 'Source picture mask geometry changed.')
    results.push({
      slideNumber: slide.index + 1,
      slidePart: slide.partName,
      shapeId: shape.id,
      source: before,
      candidate: after,
      scaleX,
      scaleY,
      moved: shape.bbox?.xEmu !== target?.bbox?.xEmu || shape.bbox?.yEmu !== target?.bbox?.yEmu,
      status: local.length ? 'fail' : 'pass',
    })
    issues.push(...local)
  }
  return {
    schemaVersion: 'pptx-nova-image-geometry/v1',
    status: issues.length ? 'fail' : sourcePictures.length ? 'pass' : 'not-applicable',
    policy: 'Original picture frames may move and scale uniformly; preserve crop and mask.',
    source,
    candidate,
    coverage: {
      checked: ['slide-local picture identity', 'uniform frame scaling', 'crop', 'preset mask'],
      unverified: [
        'media bytes and relationships',
        'color/effects and theme-bound recoloring',
        'grouped picture transforms',
        'custom mask geometry',
        'pixel-level appearance',
      ],
    },
    summary: {
      picturesChecked: sourcePictures.length,
      passed: results.filter((r) => r.status === 'pass').length,
      issueCount: issues.length,
    },
    pictures: results,
    issues,
  }
}
