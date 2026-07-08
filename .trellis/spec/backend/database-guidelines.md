# Database Guidelines

## Overview

The state store uses `better-sqlite3` synchronously behind the `StateStore` interface in `src/state.ts`. SQLite is the source of truth for persistent keys, request logs, admin audit logs, admin sessions, and resource affinity.

## Query Patterns

- Prepare static statements once inside `createStateStore()` and reuse them through returned methods.
- Clamp public query limits to safe upper bounds. Request and audit exports should cap at 5000 rows.
- Store arrays as JSON only where needed by existing contracts, such as `request_logs.key_ids_json`.
- When filtering `key_ids_json`, match exact JSON string values with the existing quoted pattern helper; do not use unescaped raw substrings.

## Migrations

- Use additive safe migrations after `CREATE TABLE IF NOT EXISTS`.
- Check existing columns with `PRAGMA table_info(<table>)` before `ALTER TABLE`.
- Existing databases must continue to open without manual migration commands.

## Contracts

- `key_stats.value` stores the encrypted upstream key when an encryption secret is configured.
- `request_logs.query` stores a short extracted query string for operator diagnostics, not the full request body.
- Admin audit entries should be recorded for sensitive actions: raw key display, export, prune, key mutation, and webhook delivery/test.

## Wrong vs Correct

### Wrong

```typescript
db.exec('ALTER TABLE key_stats ADD COLUMN raw_secret TEXT NOT NULL');
```

This breaks existing databases because SQLite cannot add a non-null column without a default.

### Correct

```typescript
const columns = db.prepare('PRAGMA table_info(key_stats)').all() as Array<{ name: string }>;
if (!columns.some((col) => col.name === 'value')) {
  db.exec('ALTER TABLE key_stats ADD COLUMN value TEXT');
}
```
