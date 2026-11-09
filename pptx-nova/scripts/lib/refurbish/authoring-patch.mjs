// Validate identity here; xdoc dry-run remains the authority for operation validity.
export function validateAuthoringPatch(patch, { sourceSha256, deckkit }) {
  if (patch?.schemaVersion !== 'pptx-patch/v1')
    throw new Error('Authoring patch must use pptx-patch/v1')
  if (!Array.isArray(patch.ops) || !patch.ops.length)
    throw new Error('Authoring patch requires nonempty ops')
  if (
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    patch.metadata?.refurbishSourceSha256 !== sourceSha256
  )
    throw new Error('Authoring patch source SHA-256 does not match the current source')
  if (patch.metadata?.deckkit !== deckkit)
    throw new Error('Authoring patch DeckKit does not match the selected DeckKit')
  return patch
}
