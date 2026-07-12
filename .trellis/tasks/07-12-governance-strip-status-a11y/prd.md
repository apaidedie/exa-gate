# Governance Strip Status A11y

## Goal

Frame governance strip values (`#governanceHttps`, `#governanceRawKey`, `#governanceSession`, `#governancePathPolicy`, `#governanceRetention`, `#governanceExpired`, `#governanceRetentionWindow`) as status regions with dynamic accessible labels.

## Problem

Security posture and log-governance values update as plain text. Assistive tech does not get framed names when HTTPS, raw-key, session, path, or retention summaries change.

## Requirements

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"` on all seven values.
- Dynamic aria-labels:
  - `安全 HTTPS：…`
  - `原始密钥策略：…`
  - `会话策略：…`
  - `路径策略：…`
  - `日志保留：…`
  - `过期日志：…`
  - `保留窗口：…`
- Preserve existing DOM ids and text content semantics.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present in HTML and updated in renderConfigSummary / renderRetention.
- [x] Verify + e2e green.
