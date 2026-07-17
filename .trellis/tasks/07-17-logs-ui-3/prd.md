# 请求日志 UI 3.0

## Goal

把「请求日志」抬到与概览 / 密钥池同级的取证体验：进入页后 3 秒内能判断有无异常、优先看哪条、如何展开链路。

## Background

- 概览与密钥池已完成 structure-star、紧凑密度、渐进详情。
- 请求日志仍是宽表 + 底部链路，信息密度高、与其它两页视觉不一致。
- 审计页保持隐藏；本任务不恢复审计导航。

## Requirements

1. **页头判断**：日志页提供一句 hero 判断 + 主 CTA（异常优先 / 429 / 清除筛选 / 查看最新链路 / 刷新）。
2. **默认紧凑表**：默认 `data-density="compact"`，可见列聚焦时间、requestId、路径、状态、延迟、尝试；方法/搜索内容/密钥链/令牌/错误仅在「展开列」显示。
3. **密度切换**：工具栏提供与密钥池同模式的紧凑/展开切换。
4. **选中态**：展开链路时，对应日志行高亮；链路区保留现有 `trace-summary` / `trace-item` / `log-key-link` 合约。
5. **渐进链路**：活动链路顶部增加一行 path·状态摘要；不删减 e2e 依赖的摘要字段。
6. **骨架/空态**：延续 `life` / empty-state 模式；不改后端 API 与导出语义。

## Acceptance Criteria

- [x] 默认紧凑：`data-density="compact"`，次要列 CSS 隐藏。
- [x] 可切换到完整列并回切紧凑。
- [x] Hero 在有异常时 CTA 指向筛选异常；无异常时指向查看最新链路或刷新。
- [x] 点击 requestId 后 `#tracePanel` 仍含「请求链路」「最终状态」「密钥链路」与 `.trace-item`。
- [x] `npm run verify` 与 `npm run test:e2e` 通过（允许为新 DOM 做最小断言更新，不破坏既有链路合约）。

## Out of Scope

- 后端日志 API、保留策略、分页语义变更
- 恢复审计主导航
- 新图表库或框架

## Technical Notes

- 静态 Admin Console only；新 CSS 必须进 `admin.css` import、`static.ts`、`copy-admin-ui.mjs`。
- 保留 DOM id：`logSearch`、`logsBody`、`tracePanel`、`logDiagnostics`、筛选控件等。
