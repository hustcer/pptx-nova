#!/usr/bin/env nu

# Build and gate one controlled public xdoc CLI, capture its schema, and feed
# that trusted snapshot into this repository's public-documentation updater.

def repo-root []: nothing -> string {
  $env.CURRENT_FILE
  | path dirname
  | path dirname
  | path expand --strict
  | into string
}

def require-path [value: path, label: string, expected_type: string]: nothing -> string {
  let expanded = ($value | path expand --strict | into string)
  let actual_type = ($expanded | path type)
  if $actual_type != $expected_type {
    error make {
      msg: $'($label) must name a ($expected_type)'
      help: $'Received ($actual_type): ($expanded)'
    }
  }
  $expanded
}

def run-checked [
  executable: string
  args: list<string>
  description: string
]: nothing -> record {
  let result = (run-external $executable ...$args | complete)
  if $result.exit_code != 0 {
    error make {
      msg: $'Failed to ($description)'
      help: ($result.stderr | str trim)
    }
  }
  $result
}

def parse-json-result [result: record, description: string]: nothing -> record {
  let value = try {
    $result.stdout | from json
  } catch {|err|
    error make {
      msg: $'($description) returned invalid JSON'
      help: $err.msg
    }
  }
  if not (($value | describe) starts-with 'record') {
    error make {msg: $'($description) must return a JSON object'}
  }
  $value
}

def main [
  --manifest (-m): path # Approved xdoc-cli-trust-profile/v1 manifest
  --xdoc-repo: path = '../pptx' # Clean xdoc source checkout
  --nova-repo: path # pptx-nova checkout; defaults to this script's repository
  --verification-date: string # Optional YYYY-MM-DD documentation date
] {
  if $manifest == null {
    error make {msg: '--manifest is required'}
  }

  let manifest_path = (require-path $manifest '--manifest' 'file')
  let xdoc_root = (require-path $xdoc_repo '--xdoc-repo' 'dir')
  let nova_root = if $nova_repo == null {
    repo-root
  } else {
    require-path $nova_repo '--nova-repo' 'dir'
  }
  let build_script = (
    require-path
      ($xdoc_root | path join 'tools/build-production-xdoc-cli.nu')
      'controlled build script'
      'file'
  )
  let gate_script = (
    require-path
      ($xdoc_root | path join 'tools/xdoc-cli-release-check.nu')
      'public CLI release gate'
      'file'
  )
  let updater = (
    require-path
      ($nova_root | path join 'tools/update-xdoc-public-docs.nu')
      'public documentation updater'
      'file'
  )

  let source_status = (
    run-checked 'git' [
      '-C'
      $xdoc_root
      'status'
      '--porcelain'
      '--untracked-files=normal'
    ] 'inspect the xdoc source worktree'
  )
  if ($source_status.stdout | str trim) != '' {
    error make {
      msg: 'Controlled public xdoc CLI builds require a clean source worktree'
      help: ($source_status.stdout | str trim)
    }
  }

  let scratch = (mktemp --directory)
  let package_dir = ($scratch | path join 'xdoc-cli-package' | into string)
  let captured_schema = ($scratch | path join 'xdoc-schema.json' | into string)
  let release_report = ($scratch | path join 'xdoc-cli-release-check.json' | into string)

  try {
    let build_result = (run-checked 'nu' [
      '--no-config-file'
      $build_script
      '--manifest'
      $manifest_path
      '--output-dir'
      $package_dir
      '--json'
    ] 'build the controlled public xdoc CLI')
    let build = (parse-json-result $build_result 'Controlled public xdoc CLI build')
    if $build.schemaVersion? != 'xdoc-cli-controlled-build/v1' or $build.status? != 'built' {
      error make {msg: 'Controlled public xdoc CLI build returned an unexpected report'}
    }
    let source_revision = ($build.sourceRevision? | default '')
    if not ($source_revision =~ '^[0-9a-f]{40}$') {
      error make {msg: 'Controlled public xdoc CLI build returned an invalid source revision'}
    }
    let binary_name = if $nu.os-info.name == 'windows' { 'xdoc.exe' } else { 'xdoc' }
    let binary = (
      require-path
        ($package_dir | path join $binary_name)
        'controlled public xdoc CLI binary'
        'file'
    )
    let reported_binary = (require-path $build.binary? 'reported public xdoc CLI binary' 'file')
    if $reported_binary != $binary {
      error make {msg: 'Controlled public xdoc CLI build reported a binary outside its package'}
    }

    let gate_result = (run-checked 'nu' [
      '--no-config-file'
      $gate_script
      '--manifest'
      $manifest_path
      '--package-dir'
      $package_dir
      '--source-revision'
      $source_revision
      '--report'
      $release_report
      '--json'
    ] 'run the public xdoc CLI release gate')
    let gate = (parse-json-result $gate_result 'Public xdoc CLI release gate')
    if $gate.schemaVersion? != 'xdoc-cli-release-check/v1' or $gate.status? != 'passed' {
      error make {msg: 'Public xdoc CLI release gate returned an unexpected report'}
    }
    if $gate.sourceRevision? != $source_revision {
      error make {msg: 'Public xdoc CLI release gate reported a different source revision'}
    }
    if $gate.binary? != $binary {
      error make {msg: 'Public xdoc CLI release gate reported a different binary'}
    }

    let schema_result = with-env {
      XDOC_CONFIG_PATH: ($scratch | path join 'isolated-config' | into string)
    } {
      run-checked $binary ['schema'] 'capture the gated public xdoc CLI schema'
    }
    parse-json-result $schema_result 'Gated public xdoc CLI schema' | ignore
    $schema_result.stdout | save --force $captured_schema

    let update_args = [
      '--no-config-file'
      $updater
      '--schema-file'
      $captured_schema
      '--require-public-build'
    ]
    let update_args = if $verification_date == null {
      $update_args
    } else {
      $update_args | append ['--verification-date' $verification_date]
    }
    let update_result = do {
      cd $nova_root
      run-checked 'nu' $update_args 'update public xdoc documentation'
    }
    let check_result = do {
      cd $nova_root
      run-checked 'nu' [
        '--no-config-file'
        $updater
        '--check'
      ] 'verify updated public xdoc documentation'
    }

    let update_output = ($update_result.stdout | str trim)
    if $update_output != '' {
      print $update_output
    }
    let check_output = ($check_result.stdout | str trim)
    if $check_output != '' {
      print $check_output
    }
    print $'Public xdoc documentation refreshed from gated build ($source_revision)'
  } finally {
    if ($scratch | path exists) {
      rm -r $scratch
    }
  }
}
