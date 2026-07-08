# Backend Development Guidelines

> Fastify reverse proxy, admin API, SQLite state, and release-quality guidelines.

## Overview

This project is a Node.js 22 TypeScript Fastify reverse proxy. Runtime state is stored in SQLite through `better-sqlite3`; admin routes and the static Admin Console are served by the same process.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Backend module ownership and route boundaries | Active |
| [Database Guidelines](./database-guidelines.md) | SQLite state, migrations, and query patterns | Active |
| [Error Handling](./error-handling.md) | Error types, handling strategies | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Verification, CI, security audit, release metadata | Active |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | To fill |

## Pre-Development Checklist

- Read `src/app.ts` before changing startup, plugin registration, process lifecycle, or route order.
- Read `src/proxy.ts` before changing proxy request flow, retry semantics, header handling, or resource affinity.
- Read `src/admin.ts` and `src/admin/*` before changing management API contracts.
- Read `src/state.ts` before adding fields, migrations, logs, sessions, or key state.
- Add or update Vitest coverage for backend behavior changes before editing production logic.

## Quality Check

- Run `npm run verify` before claiming backend or release work is ready.
- Run `docker compose config --no-interpolate` after Docker Compose or `.env.example` changes.
- Run `npm run test:e2e` if backend changes affect admin auth, admin routes, static assets, webhook testing, logs, or key actions.

**Language**: All code-spec documentation should be written in English.
