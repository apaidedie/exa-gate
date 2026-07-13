# Admin perf baseline (scaled dataset)

## Goal

Measure login + tab-switch latency with a larger local dataset (many keys + request logs). Measure only; no product rewrite unless clear regression vs session 157 small baseline.

## Dataset

- ~50 keys
- ~500 request logs
- local buildApp + fakeExa, silent

## Acceptance

- [ ] metrics.json with desktop + mobile timings
- [ ] comparison notes vs session-157 small baseline
- [ ] no product code change unless justified
