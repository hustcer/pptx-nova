# Biennale Yellow

Warm paper, disciplined ink, editorial display type and solar yellow form the identity.
Yellow carries a structural plane, an atmospheric bloom or one data emphasis; it is not a body-text color.
Thin rules organize programmes and evidence. Keep the quiet, institutional rhythm without adding cards,
shadows, decorative icons, photography or screenshot backgrounds.

The exact palette, fonts, text frames, legacy slot geometry, evidence compositions and executable rules
live in `design.json`. This document explains their purpose; it does not override their numeric values.

The original eight page types remain useful for covers, quotations, programme strands, chapters,
compact attendance, calendars and colophons. Preserve the large display anchors and varied scale.
Their readable labels and expanded text boxes intentionally improve the old rendering baseline.

Use `biennaleEvidenceSlide` for numeric evidence that needs an editable PowerPoint chart. Choose a bar
for categorical comparisons or a line for an ordered series. Supply real numbers, explicit units,
source/basis, two supporting KPIs and at most one emphasized observation. Missing values require a
content decision; they must not become zero. Original numeric data remain in the native chart.

Prefer `layoutId: "auto"`. The three compositions place the chart beside a KPI rail, below a KPI band,
or above a KPI band. Their hierarchy stays recognizable while density and reading direction change.
Explicit variants are useful for a deliberate narrative, but must still meet content capacity.
Long titles receive additional header space; body regions adapt within the contract. A layout name
alone does not establish diversity: the resolved geometry and component styles form its fingerprint.

CJK descriptions receive layout line breaks to keep closing punctuation attached. No input characters
are removed. Latin and CJK fonts are explicit and must be available to the actual renderer. Review
native chart labels, very long categories and the final contact sheet; machine checks do not establish
PowerPoint rendering parity or aesthetic acceptance. Wide numeric ranges request a precision-preserving
format; a runtime may render an unsupported format using its full-value fallback. Check visible labels
separately from the exact source-number readback.
