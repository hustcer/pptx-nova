#!/usr/bin/env nu

const unpack_marker = '.unpack-pptx-generated'

# Unpack a PPTX file under .tmp-slides/ for debugging.
def glob-files [pattern: string]: nothing -> list<string> {
  glob --no-dir $pattern | sort | each {|path| $path | path relative-to (pwd) }
}

def ooxml-files [output_dir: string]: nothing -> list<string> {
  [
    (glob-files $'($output_dir)/ppt/**/*.xml')
    (glob-files $'($output_dir)/ppt/**/*.rels')
  ] | flatten | uniq | sort
}

def default-output-dir [pptx_file: string]: nothing -> string {
  let parsed = ($pptx_file | path parse)
  let safe_stem = ($parsed.stem | str replace -ar '[^A-Za-z0-9._-]' '_')
  let suffix = (random uuid | str substring 0..7)
  ['.tmp-slides' $'($safe_stem)-($suffix)'] | path join
}

def assert-safe-output-dir [output_dir: string]: nothing -> nothing {
  let expanded = ($output_dir | path expand)
  let cwd = (pwd | path expand)
  let home = ($nu.home-dir | path expand)

  if $expanded == '/' or $expanded == $cwd or $expanded == $home {
    error make {
      msg: $'Refusing to clear unsafe output directory: ($output_dir)'
    }
  }
}

def marker-file [output_dir: string]: nothing -> string {
  [$output_dir $unpack_marker] | path join
}

def prepare-output-dir [output_dir: string]: nothing -> nothing {
  assert-safe-output-dir $output_dir

  if not ($output_dir | path exists) {
    mkdir $output_dir
  } else {
    let path_type = ($output_dir | path type)
    if $path_type != 'dir' {
      error make {msg: $'Output path exists and is not a directory: ($output_dir)'}
    }

    let marker = (marker-file $output_dir)
    if not ($marker | path exists) {
      error make {
        msg: $'Refusing to clear unmarked output directory: ($output_dir)'
        help: $'Choose a new --output-dir, or delete the directory manually if it is safe. Directories created by this tool contain ($unpack_marker).'
      }
    }

    rm --recursive --force --permanent $output_dir
    mkdir $output_dir
  }

  '' | save --force (marker-file $output_dir)
}

def ordered-slide-files [output_dir: string]: nothing -> list<string> {
  let presentation = (open --raw $'($output_dir)/ppt/presentation.xml' | from xml)
  let relationships = (open --raw $'($output_dir)/ppt/_rels/presentation.xml.rels' | from xml)

  let slide_targets = (
    $relationships.content
    | where tag == 'Relationship'
    | where {|node| ($node.attributes.Type? | default '') | str ends-with '/slide' }
    | each {|node|
        {
          id: $node.attributes.Id
          target: ($node.attributes.Target | str replace -r '^/' '')
        }
      }
  )

  $presentation.content
  | where tag == 'sldIdLst'
  | get 0.content
  | where tag == 'sldId'
  | each {|node|
      let rel_id = $node.attributes.id
      let match = ($slide_targets | where id == $rel_id)

      if ($match | is-empty) {
        error make {msg: $'Missing slide relationship for ($rel_id)'}
      }

      let target = ($match | get 0.target)
      resolve-ppt-target $output_dir $target
    }
}

def resolve-ppt-target [output_dir: string, target: string]: nothing -> string {
  let clean_target = ($target | str replace -r '^/' '')
  if $clean_target =~ '^ppt/' {
    [$output_dir $clean_target] | path join
  } else {
    [$output_dir 'ppt' $clean_target] | path join
  }
}

def slide-rels-file [slide_path: string]: nothing -> string {
  let slide_dir = ($slide_path | path dirname)
  let slide_name = ($slide_path | path basename)
  [$slide_dir '_rels' $'($slide_name).rels'] | path join
}

def slide-records [slide_files: list<string>]: nothing -> list<record> {
  $slide_files | enumerate | each {|entry|
    let xml_path = $entry.item
    let rels_path = (slide-rels-file $xml_path)
    {
      index: ($entry.index + 1)
      xml: $xml_path
      xml_exists: ($xml_path | path exists)
      rels: $rels_path
      rels_exists: ($rels_path | path exists)
    }
  }
}

def search-xml-files [
  files: list<string>
  pattern: string
  --regex
]: nothing -> list<record> {
  $files
  | where {|file| $file | path exists }
  | each {|file|
      open --raw $file
      | lines
      | enumerate
      | where {|row|
          if $regex {
            $row.item =~ $pattern
          } else {
            $row.item | str contains $pattern
          }
        }
      | each {|row|
          {
            file: $file
            line: ($row.index + 1)
            text: $row.item
          }
        }
    }
  | flatten
}

def print-slide [slide: record]: nothing -> nothing {
  print $"\nSlide ($slide.index) XML: ($slide.xml)"
  if $slide.rels_exists {
    print $"Slide ($slide.index) rels: ($slide.rels)"
  } else {
    print $"Slide ($slide.index) rels: ($slide.rels) [missing]"
  }
}

def print-matches [
  matches: list<record>
  label: string
  scope: string
]: nothing -> nothing {
  print ''
  print $'Searching ($label) in ($scope):'

  if ($matches | is-empty) {
    print '  No matches found'
  } else {
    $matches | each {|match|
      print $'  ($match.file):($match.line):($match.text)'
    }
  }
}

def main [
  pptx_file: string # Path to the PPTX file
  --list (-l) # List all slides and key files after unpacking
  --slide (-s): int # Show paths for the 1-based slide order
  --find (-f): string # Search text in XML files; with --slide, only that slide XML and rels
  --regex (-r): string # Search regex in XML files; with --slide, only that slide XML and rels
  --info (-i) # Show PPTX structure info
  --json (-j) # Emit machine-readable JSON and suppress progress text
  --output-dir (-o): string # Directory to unpack into; default is a unique .tmp-slides/<stem>-<id>
] {
  let unpack_dir = if $output_dir != null {
    $output_dir
  } else {
    default-output-dir $pptx_file
  }

  if not ($pptx_file | path exists) {
    error make {msg: $'PPTX file not found: ($pptx_file)'}
  }

  if (which unzip | is-empty) {
    error make {msg: 'unzip command not found'}
  }

  prepare-output-dir $unpack_dir

  if not $json {
    print $'Unpacking ($pptx_file) to ($unpack_dir)/'
  }

  let unzip_result = (^unzip -o -q $pptx_file -d $unpack_dir o+e>| complete)
  if $unzip_result.exit_code != 0 {
    let unzip_error = ($unzip_result.stderr? | default ($unzip_result.stdout? | default ''))
    error make {msg: $'Failed to unpack PPTX file: ($unzip_error)'}
  }

  if not $json {
    print $'✓ Successfully unpacked to ($unpack_dir)/'
  }

  let should_collect_slides = (
    $list or $info or $json or ($slide != null) or ($find != null) or ($regex != null)
  )
  let slide_files = if $should_collect_slides {
    ordered-slide-files $unpack_dir
  } else {
    []
  }
  let slides = (slide-records $slide_files)

  let selected_slide = if $slide != null {
    if $slide <= 0 {
      error make {msg: 'Slide number must be >= 1'}
    }

    if $slide <= ($slides | length) {
      $slides | get ($slide - 1)
    } else {
      error make {msg: $'Slide ($slide) not found'}
    }
  } else {
    null
  }

  let layout_files = (glob-files $'($unpack_dir)/ppt/slideLayouts/*.xml')
  let master_files = (glob-files $'($unpack_dir)/ppt/slideMasters/*.xml')
  let theme_files = (glob-files $'($unpack_dir)/ppt/theme/*.xml')
  let pptx_info = {
    slides: ($slides | length)
    layouts: ($layout_files | length)
    masters: ($master_files | length)
    themes: ($theme_files | length)
  }

  if $list and not $json {
    print "\nSlides:"
    $slides | each {|entry|
      let rels_note = if $entry.rels_exists {
        $entry.rels
      } else {
        $'($entry.rels) [missing]'
      }
      print $'  ($entry.index): ($entry.xml) | rels: ($rels_note)'
    }

    print "\nLayouts:"
    $layout_files | each {|file| print $'  ($file)' }

    print "\nMasters:"
    $master_files | each {|file| print $'  ($file)' }

    print "\nThemes:"
    $theme_files | each {|file| print $'  ($file)' }
  }

  if ($selected_slide != null) and not $json {
    print-slide $selected_slide
  }

  let search_files = if $selected_slide != null {
    [$selected_slide.xml $selected_slide.rels]
  } else {
    ooxml-files $unpack_dir
  }

  let find_matches = if $find != null {
    search-xml-files $search_files $find
  } else {
    []
  }

  let regex_matches = if $regex != null {
    search-xml-files $search_files $regex --regex
  } else {
    []
  }

  let search_scope = if $selected_slide != null {
    $"slide ($selected_slide.index) XML and rels"
  } else {
    "all XML files"
  }

  if ($find != null) and not $json {
    print-matches $find_matches $'"($find)"' $search_scope
  }

  if ($regex != null) and not $json {
    print-matches $regex_matches $'/($regex)/' $search_scope
  }

  if $info and not $json {
    print ''
    print 'PPTX Info:'
    print $'  Slides: ($pptx_info.slides)'
    print $'  Layouts: ($pptx_info.layouts)'
    print $'  Masters: ($pptx_info.masters)'
    print $'  Themes: ($pptx_info.themes)'
  }

  if $json {
    {
      pptx_file: $pptx_file
      output_dir: $unpack_dir
      info: $pptx_info
      slides: $slides
      slide: $selected_slide
      find_matches: $find_matches
      regex_matches: $regex_matches
    } | to json
  }
}
