# Export And Check

Read this file when the user only wants conversion, extraction, preview, or
validation of an existing deck. Do not load create/edit mode details unless the
user also asks to change the PPTX.

Read `common-workflow.md` before this file. Export/check tasks still write
artifacts, so use a run directory by default and follow its `--overwrite` safety
rules.

## Conversion

Use `xdoc convert`:

```bash
xdoc convert deck.pptx --to pdf -o <run-dir>/out/
xdoc convert deck.pptx --to png -o <run-dir>/previews --overwrite
xdoc convert deck.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet
xdoc convert deck.pptx --to png --slides 25-38 -o <run-dir>/previews --overwrite --contact-sheet
xdoc convert deck.pptx --to md -o <run-dir>/out/
xdoc convert deck.pptx --to json -o <run-dir>/out/
xdoc convert deck.pptx --to text -o <run-dir>/out/
```

The command shape is `xdoc convert <pptx> --to <format>`, not
`xdoc <pptx> -t png`.

For PNG and multi-format outputs, path shape matters:

- `-o <run-dir>/previews` means `<run-dir>/previews` is the output root. It
  contains `slide-001.png`, `manifest.json`, and `contact-sheet.png`.
- `-o <run-dir>/previews/` means parent-directory mode. It creates
  `<run-dir>/previews/<deck>-img/` for PNG or `<deck>.xdoc/` for multi-format
  output.

Use `--overwrite` only when replacing outputs that belong to this conversion
run, usually under `<run-dir>`. If the user explicitly requests a final export
path that already exists, ask before replacing it.

## Contact Sheet

For visual review, prefer:

```bash
xdoc convert deck.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet
```

For targeted edits, render only the changed slides as a first-class review
artifact instead of hand-making a montage:

```bash
xdoc convert deck.pptx --to png --slides 25-38 -o <run-dir>/previews --overwrite --contact-sheet
```

The PNG filenames and contact-sheet metadata preserve original slide numbers,
so `slide-025.png` still refers to slide 25 even though the contact sheet starts
at page 1.

Read the contact sheet first to detect cross-slide issues such as rhythm, page
number jumps, inconsistent dark/light pages, and obvious layout problems. Then
inspect full-size PNGs for suspicious slides.

Adjust contact sheet options only when needed:

- `--contact-cols 3` or `4` for longer decks
- `--contact-thumb 960x540` when small text must be readable
- `--contact-background EEEEEE` to see page edges better
- `--contact-output path/to/contact-sheet.png` for a custom output path

## Preflight Checks

For fonts, links, and compatibility:

```bash
xdoc check deck.pptx \
  --checks fonts,links,compat \
  -o <run-dir>/check.json \
  --pretty \
  --overwrite
```

`xdoc check` is not a visual gate. It does not replace `vision-check` or PNG
review for created/edited decks.

For `fonts`, `missingRiskCandidates` excludes common system fonts such as
Arial, Aptos, Calibri, Times New Roman, Courier New, Helvetica, Verdana, and
Tahoma. These may appear under `systemFontCandidates`: acceptable for many
internal decks, but still a cross-machine consistency risk for strict external
delivery. Non-system `font_not_embedded` warnings should be fixed by embedding
the font or switching to an approved system/DeckKit font.

## Extract

Use extract for notes, resources, links, and fonts:

```bash
xdoc extract deck.pptx --parts notes,resources,links,fonts
```

Save extracted JSON/report files in the run directory unless the user asks for a
specific output location.

## Ingest HTML / URL / PDF (inbound)

The commands above send a PPTX outward. These two go the other way: they turn an
external HTML page, URL, or PDF into Markdown/text. Use them when the user just
wants the converted Markdown/text. If the result will become a new or edited
deck, follow `common-workflow.md` -> Source Ingestion instead.

```bash
# HTML file / glob / directory / URL -> Markdown (omit -o for stdout)
xdoc html2md page.html -o <run-dir>/page.md
xdoc html2md "https://example.com/post" -o <run-dir>/page.md
xdoc html2md ./pages --recursive --out-dir <run-dir>/md     # batch
xdoc html2md page.html --html-base-url "https://site.com/"  # resolve relative links
xdoc html2md ./pages --recursive --report <run-dir>/html2md-report.json

# PDF -> copyable text (omit -o for stdout)
xdoc pdf extract-text input.pdf -o <run-dir>/text.txt
xdoc pdf extract-text input.pdf --pages 1,3-5 --mode layout
xdoc pdf extract-text input.pdf --engine pdfium --json --pretty  # pdf-text/v1
```

Notes:

- `xdoc html2md` and `xdoc convert <input> --from html --to md` share the same
  HTML-to-Markdown engine; a URL passed to `convert` auto-detects as `html`.
- `xdoc pdf extract-text`: `--engine auto` resolves to PDFium in native builds
  (`pdflite` is not yet available); `--pages` is 1-based; `--mode layout` keeps
  visual order, `natural` is the reading flow. With `--json --pretty` inspect
  `summary` and `warnings` for dropped/reordered characters.
- This is text only. Images, styles, and layout from the source are not imported.
- `html2md -o file.md` also writes a `file.manifest.json` sidecar and refuses to
  overwrite an existing output; add `--overwrite` for current-run files, or use
  `--manifest false` (or stdout without `-o`) for a single clean file.

## When Export Finds A Problem

If conversion/check reveals a problem and the user asks you to fix it, switch to
`edit-mode.md` plus the relevant domain reference (`styles-and-themes.md`,
`charts.md`, `tables.md`, or `patch-ops-cheatsheet.md`).
