#!/usr/bin/env nu

# List all cataloged DeckKits, their readiness and committed showcase locations.
def main [
  --json # Emit structured rows with full repository-relative asset paths.
]: nothing -> string {
  
  let repo_root = ($env.CURRENT_FILE | path dirname | path dirname)
  let example_base = 'pptx-nova/assets/examples/deckkits'
  let example_root = ($repo_root | path join $example_base)
  let catalog = (open ($repo_root | path join 'pptx-nova/assets/deckkits/catalog.json'))
  let manifest = (open ($example_root | path join 'manifest.json'))
  let rows = (
    $catalog.entries
    | sort-by id
    | each {|entry|
      let matches = ($manifest.examples | where deckkit == $entry.id)
      let example = ($matches.0? | default {})
      let deck = ($example | get --optional files.deck.path)
      let preview = ($example | get --optional files.contactSheet.path)
      let content = ($example | get --optional files.content.path)
      let example_status = if ($deck | is-empty) {
        'unregistered'
      } else if ($example_root | path join $deck | path exists) {
        'available'
      } else {
        'missing'
      }
      {
        id: $entry.id
        readiness: ($entry.readiness? | default 'unknown')
        version: ($entry.version? | default '-')
        slide_types: ($entry.supportedSlideTypes? | default [] | length)
        example_status: $example_status
        # Rebuild components so manifest slashes become native separators on Windows too.
        pptx: (if ($deck | is-not-empty) { $example_base | path join $deck | path split | path join } else { null })
        preview: (if ($preview | is-not-empty) { $example_base | path join $preview | path split | path join } else { null })
        content: (if ($content | is-not-empty) { $example_base | path join $content | path split | path join } else { null })
      }
    }
  )
  if $json {
    $rows | to json
  } else {
    print $'DeckKits: ($rows | length)'
    print $'PPTX root: ($example_base)/'; print (char nl) -n
    let display = (
      $rows
      | each {|row|
        let pptx = match $row.example_status {
          'unregistered' => 'not registered'
          'missing' => $'missing: ($row.pptx | path relative-to $example_base)'
          _ => ($row.pptx | path relative-to $example_base)
        }
        {id: $row.id, readiness: $row.readiness, version: $row.version, pptx: $pptx}
      }
    )
    
    $display | sort-by id readiness | table --expand --theme light
  }
}
