# Repository tests

Run every suite through `node tools/run-tests.mjs` or `just t`. CI uses the same recursive
discovery. It finds `*.test.mjs` beneath this directory and excludes `helpers/`, `fixtures/`,
and hidden directories. No compatibility runner or flat test glob is maintained.

| Directory      | Responsibility                                                                   |
| -------------- | -------------------------------------------------------------------------------- |
| `deckkits/`    | Design families, content contracts, slots, quality and readiness                 |
| `workflows/`   | Create, edit-related composition, refurbish, translation and delivery            |
| `contracts/`   | PPTX packages, native/runtime contracts, session rules and source constraints    |
| `evidence/`    | Layout, semantic and visual evidence, comparison, caches and Office snapshots    |
| `runtime/`     | Capability discovery, initialization, filesystem behavior, recovery and routing  |
| `maintenance/` | Authoring tools, generated metadata, public documentation and layout policy      |
| `helpers/`     | Shared test functions and fake executables; no tests execute on import           |
| `fixtures/`    | Reusable input data and scenario builders; never discovered as test entry points |

```sh
node tools/run-tests.mjs deckkits
node tools/run-tests.mjs workflows/create-runner.test.mjs
node tools/run-tests.mjs --list
node tools/run-tests.mjs -- --test-name-pattern=readiness
```

Selectors are relative to this directory. Pass Node test options after `--`. The runner anchors
the repository working directory and supports paths with spaces without shell expansion.

Keep new tests in the owning domain and split cross-workflow aggregates into focused suites.
Share fixture builders only when multiple suites need them. Moving or splitting tests must
preserve test names, assertions and conditional integration coverage. Record the pre-migration
inventory and compare it with the final run so nested or generated tests cannot disappear.

Executable integration tests retain their documented environment switches, including
`XDOC_TEST_BIN`, `XDOC_TEST_EVIDENCE_DIR`, and `XDOC_TEST_VISUAL`. Missing optional prerequisites
produce explicit skips. Do not replace integration assertions with unconditional skips.
