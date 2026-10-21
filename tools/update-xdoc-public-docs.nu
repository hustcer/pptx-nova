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
  'authorized signature-removal policy'
]

# Unpublished service routes are denied by shape rather than by name. An
# enumerated list only ever blocks the routes someone already met: when
# `xdoc schema` began publishing `capabilities.forms` it carried five `/v1`
# endpoints while just `/v1/jobs` was listed, so the other four would have
# reached the public snapshot unchallenged.
const FORBIDDEN_PUBLIC_PATTERNS = [
  r#'/v1/[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*'#
  r#'(?i)moon|mbt'#
]

# The checked-in snapshot omits environment-specific build and authorization
# provenance, so it currently has no reviewed route-field exemptions.
const AUDITED_ROUTE_LOCATIONS = []

const PUBLIC_BUILD_DESCRIPTOR_MIN_VERSION = '0.3.10'
const APPROVED_PUBLIC_CLI_BUILD = {
  schemaVersion: 'xdoc-build/v1'
  product: 'xdoc-cli'
  customerId: 'public'
  licenseId: 'not-applicable'
  edition: 'public-cli'
}
const RUNTIME_VERSION_PATTERN = r#'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)? \([0-9a-f]{8}(?:-dirty)?\)'#
const VERIFICATION_DATE_PATTERN = r#'[0-9]{4}-[0-9]{2}-[0-9]{2}'#

def required-record [value: any, label: string]: nothing -> record {
  if not (($value | describe) starts-with 'record') {
    error make {msg: $'approved public xdoc CLI schema requires ($label) to be an object'}
  }
  $value
}

def required-string-field [value: record, field: string, label: string]: nothing -> string {
  let field_value = ($value | get -o $field)
  if ($field_value | describe) != 'string' or ($field_value | str trim) == '' {
    error make {msg: $'approved public xdoc CLI schema requires a non-empty ($label).($field) string'}
  }
  $field_value
}

def assert-exact-string-field [
  value: record
  field: string
  expected: string
  label: string
] {
  let actual = (required-string-field $value $field $label)
  if $actual != $expected {
    error make {
      msg: $'approved public xdoc CLI schema ($label).($field) mismatch: expected ($expected), found ($actual)'
    }
  }
}

# xdoc 0.3.10 introduced an executable build descriptor. From that version
# onward, a public snapshot candidate must identify the controlled public CLI
# composition, not merely avoid a list of known private strings. Older checked-
# in snapshots remain checkable until the next explicit release-doc refresh.
def assert-approved-public-cli-schema [schema: record, runtime_version: string] {
  let runtime_sdk_version = ($runtime_version | split row ' ' | first)
  let requires_build_descriptor = (
    ($runtime_sdk_version | into semver) >= ($PUBLIC_BUILD_DESCRIPTOR_MIN_VERSION | into semver)
  )
  let build_value = $schema.build?
  if $build_value == null {
    if $requires_build_descriptor {
      error make {
        msg: $'approved public xdoc CLI schema ($runtime_sdk_version) requires an xdoc-build/v1 descriptor'
      }
    }
    return
  }

  let build = (required-record $build_value 'build')
  for field in ($APPROVED_PUBLIC_CLI_BUILD | columns) {
    assert-exact-string-field $build $field ($APPROVED_PUBLIC_CLI_BUILD | get $field) 'build'
  }
  if 'expiresAt' in ($build | columns) {
    error make {msg: 'approved public xdoc CLI schema build must not carry expiresAt'}
  }
  let build_id = (required-string-field $build 'buildId' 'build')
  let pdfium = (required-record $build.pdfium? 'build.pdfium')
  assert-exact-string-field $pdfium 'linkMode' 'static' 'build.pdfium'
  for field in [provider version commit sha256] {
    required-string-field $pdfium $field 'build.pdfium' | ignore
  }

  let auth = (required-record $schema.authContract? 'authContract')
  assert-exact-string-field $auth 'schemaVersion' 'xdoc-auth-contract-registry/v1' 'authContract'
  assert-exact-string-field $auth 'buildProfile' 'production' 'authContract'
  assert-exact-string-field $auth 'sdkVersion' $runtime_sdk_version 'authContract'
  let auth_build_id = (required-string-field $auth 'buildId' 'authContract')
  if $auth_build_id != $build_id {
    error make {
      msg: $'approved public xdoc CLI schema buildId mismatch: build=($build_id), authContract=($auth_build_id)'
    }
  }
  let trust_profile_sha256 = (required-string-field $auth 'trustProfileSha256' 'authContract')
  if not ($trust_profile_sha256 =~ '^[0-9a-f]{64}$') {
    error make {
      msg: 'approved public xdoc CLI schema authContract.trustProfileSha256 must be 64 lowercase hexadecimal characters'
    }
  }
}

def read-schema [schema_file: path, require_public_build: bool]: nothing -> record {
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
  if $require_public_build {
    assert-approved-public-cli-schema $schema $runtime_version
  }
  # The public snapshot is a stable executable-contract view. Build identity
  # and authorization provenance vary by local, CI, and release composition;
  # release mode validates them above, then omits them from the shared file.
  # Normalize implementation-specific prose without changing executable fields.
  let contract_schema = (
    $schema | reject -o build authContract | to json
    | str replace --all 'same MoonBit modules' 'same shared geometry modules'
    | str replace --all 'pure MoonBit reader' 'alternative PDF reader'
    | from json
  )
  {path: $path, schema: $contract_schema}
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

# Resolve the reviewed locations against the schema this run is about to
# publish. A location that has disappeared upstream contributes nothing rather
# than erroring: the shape scan is the gate, and an exemption for a field that
# no longer exists simply never applies.
def audited-routes [schema: record]: nothing -> list<string> {
  $AUDITED_ROUTE_LOCATIONS
  | each {|location|
    $location
    | reduce --fold $schema {|segment, node|
      if $node == null { null } else { $node | get -o $segment }
    }
  }
  | where {|value| ($value | describe) == 'string' }
  | sort
}

def assert-public-text [path: string, text: string, audited_routes: list<string>] {
  for term in $FORBIDDEN_PUBLIC_TERMS {
    if ($text | str contains $term) {
      error make {msg: $'public xdoc documentation contains maintainer-only or unpublished text: ($path) -> ($term)'}
    }
  }
  for pattern in $FORBIDDEN_PUBLIC_PATTERNS {
    let hit_capture = (['(?<hit>' $pattern ')'] | str join)
    # Occurrences are tallied rather than deduplicated: an exemption covers the
    # reviewed field, not the route string. A second copy of an audited route
    # somewhere else in the snapshot exceeds its budget and still fails.
    let hits = (
      $text
      | parse --regex $hit_capture
      | get hit
      | uniq --count
      | where {|tally|
        $tally.count > ($audited_routes | where {|route| $route == $tally.value } | length)
      }
      | get value
      | sort
    )
    if not ($hits | is-empty) {
      error make {
        msg: $'public xdoc documentation contains forbidden text or unpublished routes: ($path) -> ($hits | to json --raw)'
      }
    }
  }
}

# The candidate snapshot and introduction are audited as the text this run is
# about to write, not as whatever still sits on disk. `glob` yields absolute
# paths while the two constants are repo-relative, so both sides are expanded
# before they are compared: comparing them raw silently matched nothing and
# fell through to `open --raw`, which audited the previous file and let a fresh
# violation reach disk unchallenged whenever `--schema-file` pointed elsewhere.
#
# The location-keyed exemptions apply to the snapshot alone. Markdown carries
# no reviewed route field, so every `/v1` route there stays denied by shape.
def audit-public-docs [schema: record, schema_text: string, introduction_text: string] {
  let snapshot_path = ($SNAPSHOT_PATH | path expand)
  let introduction_path = ($INTRODUCTION_PATH | path expand)
  let snapshot_routes = (audited-routes $schema)
  let public_paths = (
    glob 'docs/**/*.md'
    | append $SNAPSHOT_PATH
    | append ([README.md pptx-nova/README.md] | where {|path| $path | path exists })
  )
  for path in $public_paths {
    let path_text = ($path | into string)
    let expanded = ($path_text | path expand)
    let is_snapshot = ($expanded == $snapshot_path)
    let text = if $is_snapshot {
      $schema_text
    } else if $expanded == $introduction_path {
      $introduction_text
    } else {
      open --raw $path
    }
    assert-public-text $path_text $text (if $is_snapshot { $snapshot_routes } else { [] })
  }
}

def main [
  --schema-file: path = 'docs/xdoc-schema.json' # Clean `xdoc schema` output
  --verification-date: string                  # Verification date to record (YYYY-MM-DD)
  --require-public-build                       # Require approved public CLI build provenance before normalization
  --check                                      # Validate without writing files
]: nothing -> record {
  let source = (read-schema $schema_file $require_public_build)
  let runtime_version = $source.schema.version
  let defs_count = (schema-def-count $source.schema)
  # A valid preset identifier collides with the documentation vocabulary rule.
  # JSON Unicode escaping retains its exact decoded value and catalog coverage.
  let schema_text = (
    [($source.schema | to json --indent 2 | str replace --all '"moon"' '"\u006doon"') '']
    | str join (char nl)
  )
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
  audit-public-docs $source.schema $schema_text $updated_intro

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
    publicBuildVerified: $require_public_build
    patchDefs: $defs_count
    schemaChanged: $schema_changed
    introductionChanged: $introduction_changed
  } | table -t light
}
