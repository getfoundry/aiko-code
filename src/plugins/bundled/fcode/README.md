# Aiko Code

A 9-phase fractal development loop for aiko Code. Each Stop is intercepted; the loop advances one phase, injects an engineering principle, and asks for an element-by-element mapping before the work proceeds.

## Phases

1. **Survey** — inventory before building
2. **Boundaries** — separations (layers, contracts)
3. **Skeleton** — first runnable artifact
4. **Signals** — falsifiable checks (tests, types)
5. **Edges** — adversarial behavior
6. **Integration** — end-to-end exercise
7. **Verdict** — promote / hold / reject (single-threaded)
8. **Audit** — re-read the artifact cold
9. **Ship** — publish, hand off

A Fibonacci parallelism budget (1, 1, 2, 3, 5, 8, 1, 13, 21) sets the worker count per phase. If a step can't close in one pass, `break-harness.sh` spawns a child fib-harness cycle scoped to the stuck sub-problem.

## Install

```text
/plugin marketplace add <path-to-this-folder>
/plugin install aiko-code@aiko-code
```

Or run `./install.sh` after extracting the tarball for the same instructions.

## Use

```text
/loop "your task"
/loop "fix the flaky login test" --completion-promise FIXED
/loop "refactor auth" --session refactor --north-star "no behavior change"
```

Other commands:

- `/cancel [--session NAME | --all]`
- `/log [--session NAME | --all]`
- `/steer "<new north star>"`

## Requirements

bash, jq, perl, python3 (for the fib-harness escape).

## Local-only

No telemetry. State lives in `.aiko/aiko-code.<session>.local.md`. Teachings log lives in `.aiko/aiko-code.<session>.teachings.local.md`.
