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
]

# Deny-by-shape leaves no way to publish a route xdoc itself projects as part
# of its executable contract, so the exemption is keyed on the *location* in
# the schema rather than on the route string. Each entry below names a field
# whose value has been reviewed as public; whatever route currently sits there
# is subtracted from the shape scan for the snapshot only. A route that moves,
# multiplies, or appears anywhere else still fails, which is exactly the
# failure mode the enumerated allowlist could not catch.
#
# `authContract.provenanceProtocol.signingService.endpoint.path` is the wire
# contract a self-hosted provenance signer must implement. Unlike `/healthz`
# or the maintainer-side job routes it is addressed to whoever operates that
# signer, and the block carries its own `availability` marker, so readers see
# for themselves whether it is live yet.
const AUDITED_ROUTE_LOCATIONS = [
  [authContract provenanceProtocol signingService endpoint path]
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
        msg: $'public xdoc documentation contains maintainer-only or unpublished routes: ($path) -> ($hits | to json --raw)'
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
  for path in (glob 'docs/xdoc-*') {
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
    patchDefs: $defs_count
    schemaChanged: $schema_changed
    introductionChanged: $introduction_changed
  } | table -t light
}
