# Readiness and Config Evidence Status A11y

## Goal

Frame launch-readiness check values and config-evidence values as status regions with dynamic accessible labels (and keep config evidence buttons named with current values).

## Problem

`#readiness*Value` and `#configEvidence*` update as plain text. Config evidence buttons use static action-only `aria-label`, so assistive tech never hears the current posture value.

## Requirements

- Readiness values (`readinessHttpsValue`, `readinessRawKeyValue`, `readinessStateValue`, `readinessRetentionValue`):
  - `role="status"`, `aria-live="polite"`, `aria-atomic="true"`
  - Dynamic labels: `HTTPS 管理：…` / `原始密钥：…` / `状态持久化：…` / `日志保留：…` (include hint when present)
- Config evidence values (`configEvidenceHttps`, `configEvidenceRawKey`, `configEvidencePaths`, `configEvidenceState`):
  - Same status attributes on the value node
  - Parent button `aria-label` includes current value + action intent
- Preserve DOM ids and existing visual copy
- Unit + e2e pins; verify green

## Acceptance Criteria

- [x] Status attributes present and updated via setReadinessCheck / setEvidenceCell
- [x] Verify + e2e green
