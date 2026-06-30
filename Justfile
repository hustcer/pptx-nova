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

# Plugins need to be registered only once after nu v0.61
_setup:
  @register -e json {{ join(NU_DIR, _query_plugin) }}
