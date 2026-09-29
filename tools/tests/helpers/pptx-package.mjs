export function storedZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name)
    const data = Buffer.from(value)
    const local = Buffer.alloc(30 + nameBytes.length + data.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    nameBytes.copy(local, 30)
    data.copy(local, 30 + nameBytes.length)
    locals.push(local)

    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    nameBytes.copy(central, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralBytes = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBytes, eocd])
}

export function contentTypes(entries = []) {
  return (
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    entries
      .map(([part, type]) => '<Override PartName="/' + part + '" ContentType="' + type + '"/>')
      .join('') +
    '</Types>'
  )
}

export const translationSource = storedZip([
  [
    '[Content_Types].xml',
    contentTypes([
      [
        'ppt/slideLayouts/slideLayout1.xml',
        'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
      ],
    ]),
  ],
  ['ppt/slideLayouts/slideLayout1.xml', '<layout/>'],
])
