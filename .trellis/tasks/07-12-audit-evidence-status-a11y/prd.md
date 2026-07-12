# Audit Evidence Status A11y

## Goal

Frame audit governance summary and audit-evidence values as status regions with dynamic accessible labels; keep evidence action buttons named with current values.

## Problem

`#auditLatest` / totals and `#auditEvidence*` update as plain text. Buttons already get action labels via `syncAuditEvidenceAction`, but value nodes lack status framing.

## Requirements

- Governance: `#auditLatest`, `#auditTotal`, `#auditSuccess`, `#auditFailure` → status + dynamic labels
- Evidence values: `#auditEvidenceTotal`, `#auditEvidenceFailures`, `#auditEvidenceActor`, `#auditEvidenceExport` → status + dynamic labels
- Evidence button labels continue to include actionable intent (existing sync) and remain coherent with values
- Preserve DOM ids; unit + e2e pins; verify green

## Acceptance Criteria

- [x] Status attributes present and updated in renderAuditSummary / renderAuditEvidence
- [x] Verify + e2e green
