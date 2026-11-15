import { readFileSync } from 'node:fs'

// Keep the pre-icon contract tests on the legacy input path. The dedicated
// semantic-icons suite covers optional icon inputs and every registered variant.
export function withoutSemanticIcons(id, value) {
  if (!Array.isArray(value?.slides)) return value
  const content = structuredClone(value)
  const design = JSON.parse(
    readFileSync(new URL(`../../../pptx-nova/assets/deckkits/${id}/design.json`, import.meta.url)),
  )
  for (const slide of content.slides)
    for (const binding of design.semanticIcons?.bindings ?? []) {
      if (slide.type !== binding.slideType) continue
      if (binding.iconArray) delete slide.data[binding.iconArray]
      else {
        const items = binding.items.split('.').reduce((v, key) => v?.[key], slide.data)
        for (const item of items ?? []) delete item.icon
      }
    }
  return content
}
