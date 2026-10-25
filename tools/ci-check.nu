#!/usr/bin/env nu

def run-step [
    name: string
    command: string
    args: list<any>
] {
    print $'==> ($name)'
    let result = (run-external $command ...$args | complete)

    if $result.exit_code != 0 {
        if (($result.stdout | str trim) != '') {
            print $result.stdout
        }
        if (($result.stderr | str trim) != '') {
            print $result.stderr
        }
        error make {msg: $'($name) failed with exit code ($result.exit_code)'}
    }

    print $'ok: ($name)'
}

def read-delivery-deckkits [catalog_path: path]: nothing -> list<string> {
    let script = 'const fs=require("node:fs"); const path=process.argv[1]; const catalog=JSON.parse(fs.readFileSync(path,"utf8")); const entries=Array.isArray(catalog) ? catalog : (catalog.entries || []); console.log(JSON.stringify(entries.filter((entry)=>["production","default"].includes(entry.readiness)).map((entry)=>entry.id).sort()));'
    let result = (^node -e $script $catalog_path | complete)

    if $result.exit_code != 0 {
        if (($result.stderr | str trim) != '') {
            print $result.stderr
        }
        error make {msg: 'failed to read delivery DeckKit list'}
    }

    $result.stdout | from json
}

def main [] {
    let repo_root = ($env.CURRENT_FILE | path dirname | path dirname | path expand)
    cd $repo_root

    run-step 'pptx-nova smoke test' node [tools/pptx-nova-smoke-test.mjs]
    run-step 'public release audit' node [tools/pptx-nova-audit-public.mjs --strict]

    let validate_script = ($repo_root | path join 'pptx-nova' 'assets' 'deckkits' 'validate-content.mjs')
    let example_contents = (
        glob 'pptx-nova/assets/examples/deckkits/*/content.json'
        | sort
    )

    for content_path in $example_contents {
        let deckkit = ($content_path | path dirname | path basename)
        run-step $'validate example content: ($deckkit)' node [
            $validate_script
            $content_path
            --deckkit
            $deckkit
            --mode
            delivery
            --json
        ]
    }

    let readiness_script = ($repo_root | path join 'pptx-nova' 'scripts' 'cli/deckkits/readiness.mjs')
    let catalog_path = ($repo_root | path join 'pptx-nova' 'assets' 'deckkits' 'catalog.json')
    let delivery_deckkits = read-delivery-deckkits $catalog_path

    for deckkit in $delivery_deckkits {
        run-step $'readiness audit: ($deckkit)' node [
            $readiness_script
            --deckkit
            $deckkit
            --target
            delivery
            --benchmark-mode
            catalog
            --json
        ]
    }

    print 'CI checks passed.'
}
