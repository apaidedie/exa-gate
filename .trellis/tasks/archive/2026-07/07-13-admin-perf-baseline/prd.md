# Admin console perf baseline

## Goal

Record evidence-based interaction timings for Admin Console login + primary tab switches on local test server. No product rewrite unless a clear regression is found.

## Evidence need

- Performance work requires measure-before-change
- Continuous goal includes real interaction smoothness

## Method

1. Playwright script against buildApp + fake upstream
2. Measure: login shell ready, overview/keys/logs/audit tab visible after click
3. Write JSON + console summary to output/session-157-perf-baseline/
4. Document env: platform, node, data scale (1 key, 0 logs)

## Acceptance

- [ ] metrics.json with timings
- [ ] no product code change unless justified by metrics
- [ ] verify still green if any code touched
