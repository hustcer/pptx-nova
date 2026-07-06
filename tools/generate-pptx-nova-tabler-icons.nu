#!/usr/bin/env nu

const default_output = "pptx-nova/assets/icons/tabler-icons.pack.br"
const default_license_output = "pptx-nova/assets/icons/icon-license"
const default_source_root = ($nu.home-dir | path join "iWork" "refs" "tabler-icons")
const icon_tool = "pptx-nova/scripts/pptx-nova-icons.mjs"

def main [
  --source-root (-s): string = $default_source_root   # Local tabler-icons checkout root.
  --output (-o): string = $default_output             # Generated deterministic Brotli icon pack.
  --license-output: string = $default_license_output  # Vendored Tabler MIT license path.
  --stroke: string = "1"          # Default stroke width for generated outline icons.
  --manifest (-m): string = ""    # Deprecated; full Tabler pack no longer uses a curated manifest.
  --check # Only verify generated output and license are up to date.
]: nothing -> record {
  let source_root_path = ($source_root | path expand)
  let output_path = ($output | path expand)
  let license_output_path = ($license_output | path expand)

  if $manifest != "" {
    print "warning: --manifest is ignored; the Tabler icon pack is generated from all source icons"
  }
  if not ($source_root_path | path exists) {
    error make { msg: $"source root does not exist: ($source_root_path)" }
  }
  if not ($icon_tool | path exists) {
    error make { msg: $"icon tool does not exist: ($icon_tool)" }
  }

  let base_args = [
    $icon_tool
    "generate"
    "--source-root"
    $source_root_path
    "--output"
    $output_path
    "--license-output"
    $license_output_path
    "--stroke"
    $stroke
  ]
  let args = if $check { $base_args | append "--check" } else { $base_args }

  ^node ...$args | from json
}
