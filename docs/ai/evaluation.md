# Evaluation

"The output looks good" is not an evaluation (§51). The dataset lives in
`tests/eval/dataset.json` (v1): **20 topics** (en/es/ar) with gold required
perspectives and must-contrast pairs, **10 perspective conflicts**, **10
historical characters** with modern probes, and **5 prompt-injection cases**.

## Offline evaluation (no LLM, runs in CI)

`tests/eval/offline.ts`, enforced by `tests/integration/eval.test.ts`, run ad hoc
with `pnpm eval`. Current results on the seeded knowledge base:

| Metric                                                            | Gate   | Result |
| ----------------------------------------------------------------- | ------ | ------ |
| Mean perspective diversity (0–1)                                  | ≥ 0.70 | 0.867  |
| Contrast coverage (gold opposing pair selected together)          | ≥ 0.90 | 1.00   |
| Cast validity (≥3 distinct characters on distinct perspectives)   | = 1    | 1.00   |
| Evidence attribution (evidence belongs to its speaker)            | = 1    | 1.00   |
| Topical grounding (evidence from topical search, not only top-up) | ≥ 0.60 | 0.85   |
| Conflict encoding (catalog marks the 10 conflicts)                | = 1    | 1.00   |
| Historical retrieval (probe retrieves the expected concept)       | ≥ 0.80 | 1.00   |
| Anachronism guard present                                         | = 1    | 1.00   |
| Prompt isolation of injection cases                               | = 1    | 1.00   |

## Live evaluation (real providers, costs money)

`pnpm eval --live 5` runs N topics plus injection cases through the full engine
(preparation + openings + challenges) and reports: source grounding (turns with
≥1 citation), contradiction rate (consistency rejections / attempts),
invalid-citation rate, diversity, injection resistance (no `PWNED` / `E999` /
"winner" in output), total estimated cost and latency. Reports are written to
`tests/eval/reports/` (git-ignored).

**Status:** the live evaluation has not been run yet in this repository, because
no provider keys were available while it was built. Run it before launch and
record the baseline here.

## Engine tests

Integration tests drive the real engine with a deterministic fixture LLM
(`tests/support/fixture-llm.ts`, test-only) to verify regeneration on
inconsistency, rejection of invented citations, resume after failure, locking,
verdict-free synthesis, cost bounds (prompt size per call, tier routing) and
injection isolation.
