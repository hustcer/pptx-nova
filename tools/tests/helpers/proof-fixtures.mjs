import { storedZip, contentTypes } from './pptx-package.mjs'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
export function proofPptx(
  paint,
  {
    x = 100000,
    width = 500000,
    background = true,
    backgroundEffects = '',
    hidden,
    geometry = '<a:prstGeom prst="ellipse"/>',
    effects = '',
    style = '',
    shapeAttrs = '',
    tableGridWidth,
    tableRowHeight = 500000,
    wrapObject = (object) => object,
  } = {},
) {
  const nativeObject =
    tableGridWidth === undefined
      ? `<p:sp ${shapeAttrs}><p:nvSpPr><p:cNvPr id="7" name="Milestone"${hidden === undefined ? '' : ` hidden="${hidden}"`}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="100000"/><a:ext cx="${width}" cy="500000"/></a:xfrm>${geometry}${paint}${effects}</p:spPr>${style}<p:txBody><a:bodyPr/><a:p><a:r><a:t>Step</a:t></a:r></a:p></p:txBody></p:sp>`
      : `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Evidence table"${hidden === undefined ? '' : ` hidden="${hidden}"`}/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="100000"/><a:ext cx="${width}" cy="500000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="${tableGridWidth}"/></a:tblGrid><a:tr h="${tableRowHeight}"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Step</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  return storedZip([
    [
      '[Content_Types].xml',
      contentTypes([
        [
          'ppt/slides/proof.xml',
          'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
        ],
      ]),
    ],
    [
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      `<Relationships xmlns="${REL}"><Relationship Id="slide" Type="${R}/slide" Target="slides/proof.xml"/></Relationships>`,
    ],
    [
      'ppt/slides/proof.xml',
      `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld>${background ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>${backgroundEffects}</p:bgPr></p:bg>` : ''}<p:spTree>${wrapObject(nativeObject)}</p:spTree></p:cSld></p:sld>`,
    ],
  ])
}
