# Hook Guidelines

## Status

This project does not use React, Vue, Svelte, or custom frontend hooks. Do not introduce a hook runtime for ordinary Admin Console work.

## Equivalent Local Patterns

- Use small named functions in `admin.js` for event handlers and workflow orchestration.
- Use `debounce()` from `state.js` for search and filter inputs.
- Use `connectEventStream()` and `closeEventStream()` for SSE lifecycle.
- Use `refresh()` as the shared server-state synchronization point.

## Common Mistake

Adding a frontend framework to get hooks would increase bundle and CSP complexity without solving a current product problem. Prefer the existing static module pattern unless a future requirement clearly exceeds it.
