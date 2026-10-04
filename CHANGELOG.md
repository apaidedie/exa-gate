# 更新日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 格式。
项目版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [2.1.8] - 2026-10-04

### 修复（深挖批次：模糊测试 + 并发压力 + 全栈 e2e）

- **并发写丢数据（最严重）**：`busy_timeout` PRAGMA 通过 `db.Exec` 设置时只覆盖连接池中的一个连接，其余连接超时为 0——网关只要有两笔请求并行，写路径就撞 `SQLITE_BUSY`，请求日志与密钥统计**静默丢失**（压力测试实测 2640 笔并发请求只落库 126 行）。修复：PRAGMA 移入 DSN（每个池化连接都应用），`:memory:` 场景收敛为单连接。并发插入测试现在 2000/2000 零丢失。
- **Decrypt nonce 长度 panic**：存量数据被篡改或损坏时（IV 部分 ≠ 16 字节），GCM Open 直接 panic 打崩请求。改为返回错误，走既有的解密失败路径。
- **MaskSecret 短串 panic**：≤2 字符的密钥值在 `text[:3]` 处越界崩溃（Node 的 `slice` 会钳位，Go 字面翻译没有）。已按 TS 钳位语义修复并兼容原输出。
- **Retry-After 整数溢出**：形如 `9227000000000000A` 的头经毫秒换算溢出为负数，冷却截止时间被算到过去、冷却形同虚设。现按 ~100 年上限钳制（超大值语义 = 永久冷却）。
- **空 ID 密钥**：`EXA_KEYS=":"` 之类输入会生成 ID 为空的密钥行。现在空 ID 自动回退生成 ID，空 value 条目直接跳过。

### 新增

- **10 个模糊测试目标**（路由解析/重试分类/加解密/查询提取/密钥解析，累计约 800 万次执行）进入常规测试集，输入解析边界从此有持续变异测试覆盖。
- **并发压力测试**：40 goroutine × 混合流量（缓存争用/未命中/亲和创建复用）打进 CI 竞态检测范围，断言零失败、日志行数精确、密钥全程健康。
- **全栈 e2e 测试**：真实二进制接线（配置→存储→调度→代理→管理面）对假 Exa 上游发真实请求，验证 429→密钥轮换→200 的完整链路及统计落库。

## [2.1.7] - 2026-10-04

### 修复

- **`exa_proxy_request_logs_total` 指标从未被喂值**：`RecordLogsTotal` 在生产代码中没有调用方，Grafana 里该面板恒为 0。`handleMetrics` 现通过新增的 `Store.CountLogs()` 喂真实行数。

### 工程

- **测试乱序化**：CI 测试步骤加 `-shuffle=on`，并修复乱序暴露的两处全局状态泄漏——proxy 的 `sharedCache` 跨测试共享缓存键（相同请求体的用例互相污染命中结果）、metrics 全局计数器跨测试累积（精确值断言受执行顺序影响）。两处测试现在各自重置全局状态。

## [2.1.6] - 2026-10-04

### 修复

- **重试计数漏报**：2.1.5 的 proxy 拆分把成功响应路径的重试标记写死为 `false`——重试链路中第 2+ 次尝试拿到 HTTP 状态时不再计入密钥统计的 `retry_count`。已恢复 `attempt > 0` 语义并补断言锁定（k2 首次成功必须带 retry_count=1）。
- **启动日志时序误导**：`config validation passed` 与 `state database opened successfully` 被无条件前置打印——配置校验失败时 docker 日志会先声称通过再报 FATAL。已移回各自的成功节点。

## [2.1.5] - 2026-10-04

### 结构（整洁度批次，行为不变）

- **认知复杂度归零**：SonarCloud 全部 S3776 清除——`proxy.ServeHTTP`（56→按阶段拆为认证/读体/缓存/亲和/转发循环/响应七个函数）、`adminapi.handleKeyItem`（50→按方法两级分发）、`handleKeysBatch`/`handleKeysImport`、`main.run`（37→密钥加载与后台任务各自成函数）。
- **字面量提常量**：`x-admin-session-id`/`bearer `前缀/`content-type`/`content-disposition`/`Key not found`/`monitors` 路径段等 8 处 S1192 清除。
- **Go 现代化**：`clamp` 参数改名避开内建遮蔽（S978）、移除测试本地 `min`（用内建）、`TrendWindow` 参数分组、shutdown context 改用 `context.WithoutCancel(ctx)`（S8239）、单方法接口改名 `UpstreamDoer`（S8196）、测试重复闭包合并（S4144）。
- **测试重组**：11 个超复杂度测试函数拆分为聚焦的独立测试（键 CRUD、批量、导入导出、告警规则、自适应调度、互操作夹具等），附带 fixture helper 提取。

## [2.1.4] - 2026-10-04

### 新增

- **后台保留清理**：新增每小时维护任务——按 `EXA_LOG_RETENTION_DAYS` 清理请求日志、按 `EXA_AFFINITY_RETENTION_DAYS` 清理资源亲和、清理过期管理会话。此前这些清理只有手动调用 `/_proxy/logs/prune` 才会发生，三张表在无人调用时会无限增长。
- **代理限流**：`EXA_PROXY_RATE_LIMIT_PER_MINUTE` 从死配置变为真实实现——按 client token 的滑动窗口限流（该配置在 Node 版由 @fastify/rate-limit 承载，Go 迁移时丢失）。超限返回 429 + `retry-after`，并记录 `rate_limited` 日志；0 关闭。

### 优化

- **metrics 热路径去锁**：状态分组/缓存命中/日志行数计数改用 `sync/atomic`，代理请求不再每次抢全局互斥锁（动态标签 map 仍保留锁）。
- **响应缓存驱逐改为「最早过期优先」**：满 500 条时不再随机挤掉一条（热门条目可能无辜被逐），而是淘汰最快到期的条目。
- **请求日志 INSERT 预编译**：热路径 SQL 只解析一次（`Open` 时 Prepare，`Close` 时释放），解析失败自动回退逐次 Exec。
- **Docker 构建**：模块与编译缓存改用 BuildKit cache mount，多架构镜像构建不再每次全量重下重编。

### 结构

- 测试文件合并整理：23 个碎片文件（`_extra`/`_tails`）归并为每包一个 `<pkg>_test.go`，覆盖率不变。

## [2.1.3] - 2026-10-04

### 修复与结构

- main() 拆分为 `run(ctx) error`（标准 Go 模式）：启动错误返回而非 os.Exit（defer 清理生效）、SIGINT/SIGTERM 与 ctx 取消双通道优雅关停、监听失败作为错误返回。启动序列获得端到端测试：环境种子密钥落盘加密、legacy 密钥轮换迁移、坏密钥拒绝、无效配置与状态路径失败、live 轮询与干净关停。
- 清理 `RegisterConsole` 中针对已不存在占位符的死代码版本注入（版本芯片自改版后从 `/_proxy/config-summary` 动态取数）。
- 消除 legacy 解密路径上的无效赋值（原被 nolint 掩盖）。
- 测试覆盖冲刺：cmd/exa-gate 0→82.1%、adminapi 77→90.5%、state 85→90.1%，总体覆盖率 83.1%→94.2%。

## [2.1.2] - 2026-10-04

### 修复

- **流式响应仍会被请求超时掐断**：上游尝试超时的 `context.WithTimeout` 定时器在响应头到达后依然存活，超时一到即掐断响应体（SSE / 长 research 流超过 `EXA_ATTEMPT_TIMEOUT_MS` 就会中断）。现改为 `time.AfterFunc` 计时、响应头到达即停表，真正实现「仅请求阶段限时」，并补流式回归测试锁死该行为。
- **Prometheus 标签双重转义**：`escapeLabel` 手工转义后再经 `%q` 输出，含引号/反斜杠/换行的 key id 在指标文本中被双重转义，Prometheus 解析出的标签值错误。现改为手工引号 + 单层转义（常规 id 的输出不变）。

### 测试

- 新增 upstream / keycrypt / metrics / observability 四个包的单元测试（upstream 94.1%、keycrypt 93.7%、metrics 100%、observability 97%），全部 11 个内部包均有测试覆盖。
- CI 竞态检测范围扩展至 upstream。

## [2.1.1] - 2026-10-04

### 修复

- **SSE 端点鉴权缺失**：`/_proxy/events` 未做管理员校验（Node 版有），未鉴权方可读取密钥/日志计数。现恢复鉴权，并支持 EventSource 场景的 `?sessionId=` 查询参数认证。
- **根路径 panic**：资源亲和开启时，`POST /`、`GET /` 等空路径段请求会在亲和解析处触发 index-out-of-range panic（routes 三处），已加守卫并补回归测试。
- **EXA_KEYS_FILE 解析错误**：Go 版误用逗号分割整个文件内容；Node 原版为逐行解析（每行一个 key，支持 `id:value:weight`）。多行密钥文件此前会被解析成单个错误密钥。
- **趋势统计噪音**：请求日志 `keyIds` 为 nil 时序列化成 JSON `null`，绕过趋势聚合的探针噪音过滤（401 无密钥链），导致失败率虚高。现已归一化为 `[]`，SQL 过滤同时兼容历史 `null` 行。

### 测试

- 新增 retry / routes / config / state / adminapi 五个包的单元测试（此前仅 3 个包有测试），包覆盖率：routes 100%、config 98.8%、retry 92.5%、state 85%、adminapi 77%。
- 登录锁定 `isLockedOut` 补 nil map 防护（与 `recordLoginFailure` 对称）。

### 工程

- CI 竞态检测范围扩展至 adminapi 与 state。

## [1.0.0] - 2026-10-01

**首个正式版本。** 定位：Exa API 密钥池网关——多密钥轮换、故障转移、加密存储与管理台一体的自部署代理。

### 新增

- **密钥池与调度**：多密钥轮换（加权/自适应/轮询）、逐密钥熔断与冷却（rate limit / credits / transient 分级）、402 额度耗尽自动禁用、测试探针与密钥健康巡检。
- **官方 API 语义对齐**（对照 exa-spec.yaml 全量 42 端点）：全路径透传、重试安全名单（search/contents/answer/findSimilar/preview/cancel）、资源亲和（websets/research/agent runs/monitors/batches 子资源钉住创建密钥）。
- **管理控制台**（浅色 Porcelain / 深色双主题）：状态条 + 分区面板概览、密钥池表格/卡片双视图、请求日志与链路追踪、审计留痕、会话管理（查看/撤销）、命令面板、SSE 实时刷新、深色 FOUC 消除（cookie + 服务端注入）。
- **可观测性**：Prometheus 指标（计数器 + 进程/持久化双延迟直方图 + 缓存命中）、请求日志（SQLite WAL，保留窗口可配）、告警 webhook（HMAC 签名 + 重试）。
- **安全**：密钥静态加密（AES-256-GCM + scrypt）、密钥轮换迁移（LEGACY 启动重加密）、管理会话撤销、登录锁定、CSP、secrets 扫描进 CI。
- **工程**：优雅关闭（SIGTERM/SIGINT → 在途请求排空）、上游 HTTP/2（allowH2）、modulepreload 首载优化、114 单元 + 7 e2e 测试、verify 链（secrets/lint/test/audit/build）。

## [1.1.0] - 2026-10-01

### 新增

- **密钥加密密钥轮换**：新增 `EXA_KEYS_ENCRYPTION_SECRET_LEGACY`——启动时用旧密钥解不开的存量 Key 会自动用旧密钥解密、新密钥重加密（一次启动完成，事务内写回）；纯明文历史的部署也会自动升级为加密存储。配置层同时强制 `EXA_KEYS_ENCRYPTION_SECRET` 必填且 ≥16 字符。
- `/metrics` 新增 `exa_proxy_request_duration_ms` 直方图（path_class × status_group 低基数标签，11 档桶 + sum/count）：Grafana 可直接观测 p95/p99 与按端点类别的延迟分布。
- 管理控制台深色模式：令牌双主题（跟随系统 + 顶栏 ☾/☀ 手动切换，localStorage 记忆），全组件字面量颜色收敛为语义令牌。
- 密钥池表格/卡片双视图：顶栏「表格/卡片」分段切换（localStorage 记忆），卡片视图含状态徽章、用量四格、行内操作，事件委托与批量选择全兼容。
- README 补充 Caddy / nginx HTTPS 反向代理示例与 `EXA_ADMIN_REQUIRE_HTTPS=true` 组合说明。
- e2e 配置 CI 环境重试 1 次，吸收登录时序偶发抖动。

### 新增（续）

- 生产入口 `src/index.ts` 补充 SIGTERM/SIGINT 优雅关闭：停止接新连接、在途请求完成后退出（9s 强制上限），滚动更新不再切断在途请求。
- 上游连接池启用 HTTP/2（`allowH2`，ALPN 实测 api.exa.ai 支持）：并发下复用更少连接；`EXA_UPSTREAM_ALLOW_H2=false` 可关闭。
- 控制台 HTML 注入 `modulepreload`/`preload` 链接（服务端按 asset-manifest 生成）：消除首载模块瀑布。
- 深色模式首帧闪烁修复：主题选择同步写入 cookie，服务端按 cookie 注入 `data-theme`，OS 深色用户首访不再闪白。

### 性能

- SQLite 连接启用 `synchronous = NORMAL` + `busy_timeout = 5000`（WAL 标准搭配）：请求日志写入不再逐次 fsync，Linux 云盘部署下每次提交节省 1-20ms；对应用崩溃的数据安全性不变。代理转发自身开销实测 p50=1.5ms / p95=2.9ms，瓶颈在上游 Exa 延迟。

## [0.6.0] - 2026-09-27

### 修复

- 代理转发与 Exa 官方 API 语义对齐（对照官方 exa-spec.yaml 全量 42 个端点核对）：
  - 重试安全名单补齐官方幂等 POST：`/findSimilar`、`/v0/websets/preview`，以及所有 `*/cancel` 取消端点（5xx 时可切换密钥重试，不再直接返回 502）。
  - 资源亲和补齐创建类 POST：`/batches`、`/v0/websets/{id}/enrichments|items|searches`（子资源固定钉在父 webset 的密钥上，消除跨密钥 404）。

### 变更

- 管理控制台整体重构为浅色「Porcelain」主题（布局与信息密度对齐 CPA-Manager-Plus，保留 Exa 墨黑签名）：
  - CSS 从 20 个叠加补丁文件收敛为 9 个分层文件（tokens/shell/login/controls/panels/overview/observability/modals/responsive）。
  - 概览布局：大 Hero 压缩为状态条、新增分区竖线标题、「运行概览」面板套内嵌统计卡（彩色图标方块 + 装饰弧线）、指标卡行、代理链路地图、最近活动、运行态势与链路诊断等此前隐藏的数据区块全部呈现。
  - 趋势图重写为 SVG 图表引擎：请求柱 + 失败折线、左右双 Y 轴刻度、横向网格线、X 轴时间标签；替换旧的 div 柱状实现。
  - 蓝主色体系：主按钮/开关/导航激活/分区条统一蓝色，语义色（绿/琥珀/红）按浅色底重新调校。
  - 精简界面描述性文字：移除面板副标题、KPI 描述行、状态条重复前缀与未筛选状态说明。
  - 移动端与触控：44px 触控目标、底部抽屉式更多菜单、表格横向滚动淡出指示；修复顶栏 backdrop-filter 导致的 fixed 定位包含块问题。
  - 视觉层从零重写（v2「Ink & Porcelain」）：白侧栏 + 淡蓝渐变场 + 大字号统计卡 + SVG 趋势图，全面对齐 CPA-Manager-Plus 的界面语言。
  - 无障碍与回归：全量 aria 标注保留，110 单元测试 + 7 Playwright e2e + lint + build 全绿。

## [0.5.1] - 2026-07-18

### 变更

- 依赖大版本与工具链升级（验证通过 `npm run verify` + Playwright e2e）：
  - 生产：`undici` 8、`better-sqlite3` 12、`@fastify/rate-limit` 11、`fastify` 5.10
  - 开发：`typescript` 7、`@types/node` 26、Playwright 1.61、Vitest 4.1.10、tsx 4.23
- 项目更名为 **Exa Gate**（仓库 `apaidedie/exa-gate`）；包名、文档、Docker 镜像标识与控制台品牌文案同步更新。加密 salt 保持不变，已有密钥库可继续解密。

### 优化

- 管理控制台：概览态势与观测窗口口径统一、请求日志 UI 3.0、无感后台刷新、生产登录入口（移除 demo 填入）、告警空态与失败分流。
- 管理控制台结构级改版：概览英雄区、密钥池紧凑列、侧栏 SVG 图标、v2–v5 polish 与骨架屏动效。

### 修复

- Docker 入口脚本在启动前 `chown` 状态目录，修复 bind-mount `./data` 为 root 所有时 `SQLITE_CANTOPEN` 无法打开数据库的问题。
- 修正 `keys/import.js` 中非法 ESM 写法 `async export function`，避免管理台模块图解析失败。

### 安全

- 升级 `undici` 等到当前审计通过版本（`npm audit --audit-level=high` 无高危）。

### 部署

- `Dockerfile` 在构建阶段复制 `docs/openapi.json`；`docker-compose.yml` 拉取 `ghcr.io/apaidedie/exa-gate:latest`。
- Docker 发布默认镜像标签版本更新为 `0.5.1`。

### 重构

- 管理控制台按域拆分（`ui/`、`session/`、`live/`、`keys/`、`logs/` 等）；`admin.css` 模块化；后端 SQLite 状态层拆分。

### 优化

- 新增无认证 `/_proxy/ready` 可服务探针，区分进程存活与 Key 池可用状态，并让 Docker HEALTHCHECK 使用 readiness。
- 管理控制台登录后默认进入密钥池，贴近最常用的运维路径。
- 管理控制台新增显式 Webhook 测试入口，并补齐异步按钮反馈。
- 重构控制台视觉系统：统一暗色 token、焦点态、减少动效、响应式布局、表格和模态质感。
- README 改为面向 GitHub 评估的产品说明，新增真实控制台截图、快速试用、部署、安全模型和验证命令。
- 新增 `docs/openapi.json`，为 `/_proxy` 探针与管理接口提供机器可读 OpenAPI 3.1 契约。
- 新增 `npm run setup:env`，可从 `.env.example` 生成带强随机代理令牌、管理员令牌和 Key 加密密钥的 `.env`。
- CI、Release 与 Docker 发布流程纳入管理控制台 Playwright E2E，并修正发布、贡献和安全文档中的旧版本与占位链接。

## [0.5.0] - 2026-06-20

### 新增

- 代理路由可选速率限制：`EXA_PROXY_RATE_LIMIT_PER_MINUTE` 环境变量，通过 Fastify 封装上下文实现路由级隔离
- 全局安全响应头：所有响应自动添加 `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Strict-Transport-Security`
- Docker Compose 资源限制（512MB 内存 / 1 CPU）与日志轮转配置
- Prometheus 抓取配置文档与 Grafana 预置仪表板（`docs/grafana-dashboard.json`）
- GitHub Release 自动化工作流（`v*.*.*` 标签触发）
- 项目社区文件：`CHANGELOG.md`、`CONTRIBUTING.md`、`.github/PULL_REQUEST_TEMPLATE.md`

### 优化

- `docs/DEPLOYMENT.md` 版本引用更新、新增 Prometheus 监控章节
- 速率限制从管理路由移至代理路由封装上下文，管理端登录仍由账户锁定机制保护

## [0.4.10] - 2026-06-20

### 无障碍

- 侧边栏导航添加 ARIA `tablist`/`tab`/`tabpanel` 角色
- 标签页切换时同步更新 `aria-selected` 状态
- 装饰性导航图标添加 `aria-hidden`，折叠按钮添加 `aria-label`

### 修复

- 移除无效的 `.token-input` CSS 规则

### 更新

- README 版本徽章: 0.1.1 → 0.4.9
- `package.json` 版本号: 0.3.9 → 0.4.9

## [0.4.9] - 2026-06-20

### 优化

- `api()` 的 `extractErrorMessage()` 增加 HTML 错误页面清洗（如 Cloudflare 502）——优先尝试 JSON 解析，回退提取 `<title>`，最终使用 HTTP 状态文本

### 移除

- 密钥列表表格中移除权重列（始终显示 1，且 UI 不可编辑）；详情面板中保留显示

## [0.4.8] - 2026-06-20

### 移除

- 移除冗余的侧边栏品牌区块，避免"Exa 代理"重复显示
- 清理关联的 CSS 规则（`.sidebar-brand`、`.sidebar-mark`、`.sidebar-title`）

## [0.4.7] - 2026-06-20

### 新增

- 新增 `httpStatusClass` 辅助函数，内置 `Number.isFinite` NaN 安全防护
- 日志搜索、路径过滤、关键词过滤添加 250ms 防抖
- 剪贴板写入添加 `try/catch`，失败时向用户反馈提示

### 优化

- 替换内联的 NaN 不安全状态码分类逻辑，统一使用 `httpStatusClass`
- `showToast` 计时器从函数属性改为模块级变量
- SSE 重连计时器在 `closeEventStream` 时正确清理
- 自动刷新计时器增加 `eventRefreshPending` 标志检查及 `Math.max(5000, ...)` 最小间隔保护
- `renderConfigSummary` 缓存 9 个 `el()` DOM 查询
- 替换 `JSON.stringify` 日志搜索为定向 7 字段搜索

### 修复

- 移除 `renderDetails()` 末尾多余的 `renderKeys()` 调用（导致双重渲染）
- 移除 `state.js` 中未使用的 `filterMap` 导出
- 移除 3 条无效 CSS 规则

## [0.4.6] - 2026-06-20

### 修复

- 修复切换按钮初始文本与默认脱敏状态不一致的问题（脱敏显示 → 显示原文）

## [0.4.5] - 2026-06-20

### 优化

- 详情面板按钮标签统一为 4 字格式
- "重置熔断"重命名为"重置冷却"，保持术语一致

## [0.4.4] - 2026-06-20

### 修复

- 详情面板操作区从 4 列布局回退为 2 列，修复按钮文字换行问题

## [0.4.3] - 2026-06-20

### 优化

- 压缩密钥详情面板高度，消除不必要的滚动条

## [0.4.2] - 2026-06-20

### 修复

- 解决 7 项代码审查问题

## [0.4.1] - 2026-06-20

### 修复

- 侧边栏重构后恢复版本号显示

## [0.4.0] - 2026-06-20

### 新增

- 管理后台 UI 全面重构为专业侧边栏布局，采用标签页导航

## [0.3.8] - 早期版本

### 新增

- 管理后台请求日志中显示搜索查询内容
- 管理后台 UI 采用标签页导航并简化顶部栏

### 优化

- 多轮布局与视觉细节打磨

## [0.3.0] - 早期版本

### 新增

- 加密 API 密钥存储（SQLite），支持管理后台增删改查
- 管理后台支持批量导入密钥
- 零密钥启动支持（无密钥时返回 503，添加密钥后自动恢复）

### 优化

- Exa API 端点优化与可靠性提升
- CSP 合规性修复

## [0.1.0] - 初始版本

### 新增

- Exa 反向代理控制台初始版本
- Docker 部署支持
- MIT 开源许可证及社区文件

[1.1.0]: https://github.com/apaidedie/exa-gate/compare/v1.0.5...v1.1.0
[0.5.1]: https://github.com/apaidedie/exa-gate/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/apaidedie/exa-gate/releases/tag/v0.5.0
[0.4.10]: https://github.com/apaidedie/exa-gate/compare/v0.4.9...v0.4.10
[0.4.9]: https://github.com/apaidedie/exa-gate/compare/v0.4.8...v0.4.9
[0.4.8]: https://github.com/apaidedie/exa-gate/compare/v0.4.7...v0.4.8
[0.4.7]: https://github.com/apaidedie/exa-gate/compare/v0.4.6...v0.4.7
[0.4.6]: https://github.com/apaidedie/exa-gate/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/apaidedie/exa-gate/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/apaidedie/exa-gate/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/apaidedie/exa-gate/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/apaidedie/exa-gate/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/apaidedie/exa-gate/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/apaidedie/exa-gate/compare/v0.3.8...v0.4.0
[0.3.8]: https://github.com/apaidedie/exa-gate/compare/v0.3.0...v0.3.8
[0.3.0]: https://github.com/apaidedie/exa-gate/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/apaidedie/exa-gate/releases/tag/v0.1.0
