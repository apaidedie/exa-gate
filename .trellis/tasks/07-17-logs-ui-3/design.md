# Design: 请求日志 UI 3.0

## Layout

```
[logs tab]
  logs-hero (title + line + primary CTA)
  log-panel[data-density=compact]
    panel-head (title, count, tools + density toggle)
    filter summary + chips
    diagnostics strip (4 actions, unchanged contracts)
    table-scroll (compact/full columns)
    trace-panel (hero strip + existing summary/list)
    pager
```

## Density

| Mode | Visible columns |
|------|-----------------|
| compact (default) | 时间, 请求 ID, 路径, 状态, 延迟, 尝试 |
| full | + 方法, 搜索内容, 密钥链路, 令牌, 错误 |

Secondary columns use class `col-log-extra` and hide under `[data-density="compact"]`.

## Hero CTA priority

1. errors > 0 → 筛选异常 (`data-log-diagnostic-action=errors`)
2. rateLimits > 0 → 筛选 429
3. filters active → 清除筛选
4. has rows → 查看最新链路 (`data-trace-id` of first row)
5. else → 刷新日志

## Trace progressive

- Keep `renderTraceSummary` grid (e2e).
- Prefix active panel with `.trace-hero` (path · status · attempts).
- Selected table row: `tr.is-selected` when `state.trace.requestId` matches.

## Files

- `index.html` — hero + density toggle + col classes
- `logs/render-list.js` — hero render, selected row, colspan aware empty
- `logs/render-trace.js` — trace hero strip
- `boot/bind-logs.js` — density toggle + hero clicks
- `css/logs-ui3.css` — layout/density/hero/selection
- `admin.css`, `static.ts`, `copy-admin-ui.mjs` — register asset
- tests only if contracts need soft extension
