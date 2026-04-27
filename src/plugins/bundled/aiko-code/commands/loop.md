---
description: "Run a 9-phase fractal development loop on the given task — survey → ship, with a Fibonacci parallelism budget and a fib-harness escape"
argument-hint: "TASK [--session NAME] [--north-star \"<text>\"] [--completion-promise TEXT]"
allowed-tools: ["Bash(bash ${aiko_PLUGIN_ROOT}/scripts/setup-loop.sh:*)"]
---

# Aiko Code

Activate the 9-phase loop in this session:

```!
bash ${aiko_PLUGIN_ROOT}/scripts/setup-loop.sh $ARGUMENTS
```

Once active, every Stop is intercepted and the loop advances one phase:

1. **Survey** — inventory (read, search, enumerate). No building.
2. **Boundaries** — separations (layers, contracts, modules).
3. **Skeleton** — first runnable artifacts (stub, draft, slice).
4. **Signals** — falsifiable checks (tests, types, metrics).
5. **Edges** — adversarial behavior (edge cases, concurrency).
6. **Integration** — end-to-end exercise.
7. **Verdict** — promote, hold, or reject — single-threaded.
8. **Audit** — re-read the artifact cold; evidence over intention.
9. **Ship** — publish, hand off, deliver.

Each step injects a core engineering principle plus a rotating tactical principle, and asks for an element-by-element mapping from the principle onto the current step before doing the work. A Fibonacci parallelism budget (1, 1, 2, 3, 5, 8, 1, 13, 21) sets the worker count for that phase.

If a step can't close in one pass, run the harness break for that step instead of faking progress — it spawns a child fib-harness cycle scoped to the stuck sub-problem.

At Step 9, when the verdict is genuinely PROMOTE, output `<promise>SHIPPED</promise>` (or the configured phrase) to exit the loop.

Stop early: `/cancel`. Read the log: `/log`. Re-aim mid-flight: `/steer "<new north star>"`.
