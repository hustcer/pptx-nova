export function cartesianImageContent(imageSlots) {
  return {
    meta: { deckkit: 'cartesian' },
    slides: [
      {
        type: 'cartesianImageStatsSlide',
        ...(imageSlots ? { imageSlots } : {}),
        data: {
          imageLabel: 'Editorial Reference',
          label: 'Case Study',
          title: 'Structural overview',
          paragraphs: ['A concise description of the visual evidence and its strategic role.'],
          stats: [
            { value: '47%', label: 'Efficiency gain' },
            { value: '12x', label: 'Scale factor' },
          ],
        },
      },
    ],
  }
}
