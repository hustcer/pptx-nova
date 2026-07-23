#!/usr/bin/env nu

const SNAPSHOT_PATH = 'docs/xdoc-schema.json'
const INTRODUCTION_PATH = 'docs/xdoc-introducution.md'
const FORBIDDEN_PUBLIC_TERMS = [
  'hustcer/pptx_gen'
  'cmd/pptx-gen'
  'native pptx_gen'
  'compiled pptx-gen'
  '"sourceSymbols"'
  'development build'
  'test-bearing'
  'test declarations'
  'library policy'
  'xdoc-server'
  '0.0.0.0:8080'
  '/healthz'
  '/readyz'
  '/v1/jobs'
  'authorized signature-removal policy'
]

const RUNTIME_VERSION_PATTERN = r#'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)? \([0-9a-f]{8}(?:-dirty)?\)'#
const VERIFICATION_DATE_PATTERN = r#'[0-9]{4}-[0-9]{2}-[0-9]{2}'#

def read-schema [schema_file: path]: nothing -> record {
  let path = ($schema_file | path expand --strict)
  let raw = (open --raw $path)
  let schema = try {
    $raw | from json
  } catch {|err|
    error make {msg: $'xdoc schema is not valid JSON: ($err.msg)'}
  }
  if not (($schema | describe) starts-with 'record') {
    error make {msg: 'xdoc schema root must be a JSON object'}
  }
  if $schema.schemaVersion? != 'cli-agent/v1' {
    error make {msg: $'unsupported xdoc CLI schema version: ($schema.schemaVersion?)'}
  }
  let runtime_version = ($schema.version? | default '')
  if ($runtime_version | str contains '-dirty') {
    error make {msg: $'refusing to synchronize a dirty worktree build: ($runtime_version)'}
  }
  let runtime_version_capture = (
    ['^(?<build>' $RUNTIME_VERSION_PATTERN ')$'] | str join
  )
  let parsed_versions = (
    $runtime_version
    | parse --regex $runtime_version_capture
  )
  if ($parsed_versions | length) != 1 {
    error make {msg: $'xdoc schema contains an invalid runtime version: ($runtime_version)'}
  }
  {path: $path, schema: $schema}
}

def schema-def-count [schema: record]: nothing -> int {
  $schema.commands.pptx.patchSchema.jsonSchema
  | get '$defs'
  | columns
  | length
}

def update-introduction [
  text: string
  runtime_version: string
  defs_count: int
  verification_date: string
]: nothing -> string {
  let dollar = '$'
  let defs_text = $'($defs_count) `($dollar)defs`'
  $text
  | str replace --all --regex $RUNTIME_VERSION_PATTERN { $runtime_version }
  | str replace --all --regex r#'> \*\*Verification date:\*\* [0-9]{4}-[0-9]{2}-[0-9]{2}'# { $'> **Verification date:** ($verification_date)' }
  | str replace --all --regex r#'[0-9]+ `\$defs`'# { $defs_text }
}

def verification-date-from-introduction [text: string]: nothing -> string {
  let dates = (
    $text
    | parse --regex r#'> \*\*Verification date:\*\* (?<date>[0-9]{4}-[0-9]{2}-[0-9]{2})'#
    | get date
    | uniq
  )
  if ($dates | length) != 1 {
    error make {
      msg: $'xdoc introduction must contain exactly one verification date, found: ($dates | to json --raw)'
    }
  }
  $dates | first
}

def normalized-verification-date [value: string]: nothing -> string {
  let verification_date_capture = (
    ['^(?<date>' $VERIFICATION_DATE_PATTERN ')$'] | str join
  )
  let matches = ($value | parse --regex $verification_date_capture)
  if ($matches | length) != 1 {
    error make {msg: $'verification date must use YYYY-MM-DD: ($value)'}
  }
  $value
}

def assert-introduction-contract [
  text: string
  runtime_version: string
  defs_count: int
] {
  let runtime_version_capture = (
    ['(?<build>' $RUNTIME_VERSION_PATTERN ')'] | str join
  )
  let versions = (
    $text
    | parse --regex $runtime_version_capture
    | get build
    | uniq
  )
  if $versions != [$runtime_version] {
    error make {
      msg: $'xdoc introduction build identity mismatch: expected [($runtime_version)], found ($versions | to json --raw)'
    }
  }
  let dollar = '$'
  let expected_defs = $'($defs_count) `($dollar)defs`'
  let defs_values = (
    $text
    | parse --regex r#'(?<count>[0-9]+) `\$defs`'#
    | get count
    | uniq
  )
  if $defs_values != [($defs_count | into string)] {
    error make {
      msg: $'xdoc introduction schema definition count mismatch: expected ($expected_defs), found ($defs_values | to json --raw)'
    }
  }
}

def assert-public-text [path: string, text: string] {
  for term in $FORBIDDEN_PUBLIC_TERMS {
    if ($text | str contains $term) {
      error make {msg: $'public xdoc documentation contains maintainer-only or unpublished text: ($path) -> ($term)'}
    }
  }
}

def audit-public-docs [schema_text: string, introduction_text: string] {
  for path in (glob 'docs/xdoc-*') {
    let path_text = ($path | into string)
    let text = if $path_text == $SNAPSHOT_PATH {
      $schema_text
    } else if $path_text == $INTRODUCTION_PATH {
      $introduction_text
    } else {
      open --raw $path
    }
    assert-public-text $path_text $text
  }
}

def main [
  --schema-file: path = 'docs/xdoc-schema.json' # Clean, approved `xdoc schema` output
  --verification-date: string                  # Verification date to record (YYYY-MM-DD)
  --check                                      # Validate without writing files
]: nothing -> record {
  let source = (read-schema $schema_file)
  let runtime_version = $source.schema.version
  let defs_count = (schema-def-count $source.schema)
  let schema_text = ([($source.schema | to json --indent 2) ''] | str join (char nl))
  let current_schema = (open $SNAPSHOT_PATH)
  let current_intro = (open --raw $INTRODUCTION_PATH)
  let current_verification_date = (verification-date-from-introduction $current_intro)
  let effective_verification_date = if $verification_date != null {
    normalized-verification-date $verification_date
  } else if $check {
    $current_verification_date
  } else {
    date now | format date '%Y-%m-%d'
  }
  let updated_intro = (
    update-introduction $current_intro $runtime_version $defs_count $effective_verification_date
  )

  assert-introduction-contract $updated_intro $runtime_version $defs_count
  audit-public-docs $schema_text $updated_intro

  let schema_changed = ($current_schema != $source.schema)
  let introduction_changed = ($current_intro != $updated_intro)
  if $check {
    if $schema_changed or $introduction_changed {
      error make {
        msg: $'public xdoc documentation is stale: schemaChanged=($schema_changed), introductionChanged=($introduction_changed)'
      }
    }
  } else {
    if $schema_changed {
      $schema_text | save --force $SNAPSHOT_PATH
    }
    if $introduction_changed {
      $updated_intro | save --force $INTRODUCTION_PATH
    }
  }

  {
    schemaVersion: 'xdoc-public-docs-update/v1'
    checked: $check
    runtimeVersion: $runtime_version
    verificationDate: $effective_verification_date
    patchDefs: $defs_count
    schemaChanged: $schema_changed
    introductionChanged: $introduction_changed
  }
}
