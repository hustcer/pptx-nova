# Author: hustcer
# Create: 2022/04/29 18:05:20
# Description:
#   Some helper task for setup-nu
# Ref:
#   1. https://github.com/casey/just
#   2. https://www.nushell.sh/book/

set shell := ['nu', '-c']

# The export setting causes all just variables
# to be exported as environment variables.

set export := true
set dotenv-load := true

# If positional-arguments is true, recipe arguments will be
# passed as positional arguments to commands. For linewise
# recipes, argument $0 will be the name of the recipe.

set positional-arguments := true

# Just commands aliases
# alias r := run
# alias b := build

# Use `just --evaluate` to show env vars

# Used to handle the path separator issue
SETUP_NU_PATH := parent_directory(justfile())
NU_DIR := parent_directory(`$nu.current-exe`)
_query_plugin := if os_family() == 'windows' { 'nu_plugin_query.exe' } else { 'nu_plugin_query' }

# To pass arguments to a dependency, put the dependency
# in parentheses along with the arguments, just like:
# default: (sh-cmd "main")

# List available commands by default
default:
  @just --list --list-prefix "··· "

# Run all tests
t:
  @node tools/run-tests.mjs

# Format code
fmt:
  @$'(ansi g)Start `fmt` task...(ansi reset)'; \
  $'(ansi p)───────────────────────────────────────(ansi reset)'; \
  oxfmt --no-error-on-unmatched-pattern .; \
  $'(ansi g)The `fmt` task finished!(ansi reset)(char nl)';

# Code linting
lint:
  @$'(ansi g)Start `lint` task...(ansi reset)'; \
  $'(ansi p)───────────────────────────────────────(ansi reset)'; \
  oxlint --fix; \
  $'(ansi g)The `lint` task finished!(ansi reset)(char nl)';

# Update the contract-only xdoc schema snapshot from a local runtime or file
schema schema_file='':
  #!/usr/bin/env nu

  def run-updater [args: list<string>] {
    let result = (^nu --no-config-file tools/update-xdoc-public-docs.nu ...$args | complete)
    if $result.exit_code != 0 {
      error make {
        msg: 'Failed to update public xdoc documentation'
        help: ($result.stderr | str trim)
      }
    }
    let output = ($result.stdout | str trim)
    if $output != '' {
      print $output
    }
  }

  def main [schema_file: string] {
    let scratch = (mktemp --directory)
    try {
      let candidate = if ($schema_file | str trim) == '' {
        let captured = ($scratch | path join 'xdoc-schema.json' | into string)
        let result = (^xdoc schema | complete)
        if $result.exit_code != 0 {
          error make {
            msg: 'Failed to capture schema from the local xdoc runtime'
            help: ($result.stderr | str trim)
          }
        }
        $result.stdout | save --force $captured
        $captured
      } else {
        $schema_file | path expand --strict | into string
      }
      run-updater [--schema-file $candidate]
      run-updater [--check]
    } finally {
      if ($scratch | path exists) {
        rm -r $scratch
      }
    }
  }

# Build, gate, capture, and publish schema from an approved public xdoc CLI
schema-public manifest xdoc_repo='../pptx':
  #!/usr/bin/env nu

  def main [manifest: path, xdoc_repo: path] {
    let result = (
      ^nu --no-config-file tools/refresh-xdoc-public-docs.nu
        --manifest $manifest
        --xdoc-repo $xdoc_repo
      | complete
    )
    if $result.exit_code != 0 {
      error make {
        msg: 'Failed to refresh public xdoc documentation from a controlled CLI build'
        help: ($result.stderr | str trim)
      }
    }
    let output = ($result.stdout | str trim)
    if $output != '' {
      print $output
    }
  }

# Generate or check deterministic Brotli icon pack
icon *OPTIONS: 
  @nu tools/generate-pptx-nova-tabler-icons.nu {{OPTIONS}}

# Check/generate pptx-nova themePack source-derived outputs:
# `just theme` checks, `just theme -g` updates.
theme flag=(''):
    #!/usr/bin/env nu

    let flag = '{{ flag }}'
    match $flag {
      '' => {
        nu tools/generate-pptx-theme-catalog.nu --check
        nu tools/generate-pptx-deckkit-catalog.nu --check
        node tools/check-pptx-theme-contrast.mjs
      }
      '-g' => {
        nu tools/generate-pptx-theme-catalog.nu
        nu tools/generate-pptx-deckkit-catalog.nu
        node tools/check-pptx-theme-contrast.mjs
      }
      _ => { error make { msg: 'usage: just theme [-g]' } }
    }

# Update/check pptx-nova DeckKit user-facing examples:
# `just deckkit-examples`, `just deckkit-examples -d broadside`, `just deckkit-examples check`, `just deckkit-examples all`
deckkit-examples action=('update') *args='':
    #!/usr/bin/env nu

    let action = '{{ action }}'
    if $action in ['update' 'check' 'all'] {
      match $action {
        'update' => { node tools/update-pptx-nova-deckkit-examples.mjs --write {{ args }} }
        'check' => { node tools/update-pptx-nova-deckkit-examples.mjs --check {{ args }} }
        'all' => { node pptx-nova/scripts/cli/deckkits/benchmark.mjs --all --out .tmp/pptx-nova-visual --clean {{ args }} }
      }
    } else if ($action | str starts-with '-') {
      node tools/update-pptx-nova-deckkit-examples.mjs --write $action {{ args }}
    } else {
      error make { msg: 'usage: just deckkit-examples [update|check|all] [-d|--deckkit <id>]' }
    }

# Plugins need to be registered only once after nu v0.61
_setup:
  @register -e json {{ join(NU_DIR, _query_plugin) }}
