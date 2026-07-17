# UI layout trust and density P0/P1

## Goal

Fix overview narrative trust (Hero/KPI/trend same window) and reclaim vertical space on keys/logs for the table.

## Requirements

1. Overview request/error KPI and hero use observability window stats when trends exist; key pool totals only as fallback.
2. Trend badge must not say「稳定」when window failure rate is high.
3. Next-action CTA labels match the action (probe path → 打开日志).
4. Keys: compact workflow strip so table sits higher.
5. Logs: thinner idle trace empty so more log rows visible.

## Acceptance

- [ ] When trends show failures but key counters are 0, hero is not「等待第一条请求」with KPI 0 while trend is full red.
- [ ] Trend badge reflects failure pressure.
- [ ] verify + e2e pass.
