# 部署检查清单

在把代理暴露到 localhost 之外前，按这份清单复核。

## 一、本机已验证

以下命令已在 `E:\codex\Working` 通过：

```bash
npm test
npm run build
docker build --build-arg NODE_IMAGE=docker.1ms.run/library/node:22-bookworm-slim -t exa-reverse-proxy:local .
docker compose up --build -d
docker compose ps
curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/health
curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/keys
```

已验证结果：

* 自动化测试：14 个测试文件、58 个用例通过。
* TypeScript 构建：`tsc -p tsconfig.json` 通过。
* Docker 构建阶段内 `npm test` 14 个测试文件、58 个用例通过，`npm run build` 通过。
* 本地控制台：`http://127.0.0.1:8787` 可打开，登录页只要求管理员令牌。
* 控制台 UI 已拆分为 `src/admin-ui/index.html`、`src/admin-ui/admin.css`、`src/admin-ui/admin.js`、`api.js`、`state.js`、`renderKeys.js`、`renderLogs.js`、`renderObservability.js`，构建时复制到 `dist/src/admin-ui/`，便于后续独立维护。
* 管理控制台响应包含 CSP、`x-content-type-options`、`referrer-policy` 和 `permissions-policy`；脚本以 ES module 加载。
* 控制台支持 `/_proxy/events` SSE 事件流，浏览器会用管理员会话订阅实时刷新提示。
* 管理会话：登录成功后使用服务端 session，支持过期、退出和失败锁定。
* 安全开关：`EXA_ADMIN_REQUIRE_HTTPS=true` 时，非 HTTPS 管理请求返回 426，反向代理需转发 `x-forwarded-proto: https`。
* 运行观测：趋势窗口支持近 1 小时、近 24 小时、近 7 天；包含可用密钥过低、失败率、429 比例、突增告警、真实运行配置摘要、Prometheus 低基数指标和可选告警 webhook。
* 告警 webhook：支持测试投递、Bearer、HMAC 签名、最近响应码、投递尝试数、失败重试和冷却去重。
* 日志治理：支持按路径、状态、密钥筛选，CSV 导出，手动清理；服务启动和运行中都会按 `EXA_LOG_RETENTION_DAYS` 自动清理过期请求日志，控制台展示保留窗口、总量、保留量和过期量。
* 批量运维：支持批量测试当前页、禁用异常密钥、单密钥测试、重置冷却、按策略复制原始密钥、原文/脱敏切换。
* 演示数据：6 把密钥，其中 2 健康、3 冷却、1 禁用；日志含 200、429、503、504。
* 演示启动命令：`npm run demo:ui`，管理员令牌为 `admin_local_token`。
* 本地演示服务：`http://127.0.0.1:8787`。
* UI 截图：`output/playwright/exa-admin-ui-1440-final.png`。
* 生产构建产物 smoke：`node dist/src/index.js` 可启动并代理 fake upstream，`/_proxy/keys` 不返回 `value` 字段。
* Docker 构建上下文：`.dockerignore` 已排除 `.env`、`exa_api_key.txt`、SQLite、本地临时目录和截图目录，避免把本机敏感/临时文件发送进构建上下文。
* Docker Compose 冒烟：容器状态 `healthy`，health 返回 `ok: true`；当前真实密钥池加载 2429 把 key，管理 API 默认返回内部 `displayId`，不返回 `value` 字段，也不批量暴露原始 key。

当前机器已安装 Docker Desktop 4.76.0，Docker Engine 29.5.2，Docker Compose v5.1.4。当前网络直连 Docker Hub 会超时；本机验证使用 `--build-arg NODE_IMAGE=docker.1ms.run/library/node:22-bookworm-slim` 拉取等价 Node 基础镜像。

## 二、Docker 镜像验证

在安装 Docker 的环境中运行：

```bash
docker build --build-arg NODE_IMAGE=docker.1ms.run/library/node:22-bookworm-slim -t exa-reverse-proxy:local .
```

期望结果：镜像构建成功，构建阶段内的 `npm test` 和 `npm run build` 均通过。

## 三、Docker Compose 冒烟测试

先创建 `.env`。小规模测试可以用 fake-safe `EXA_KEYS`，真实密钥池建议使用 `EXA_KEYS_FILE`：

```dotenv
EXA_KEYS_FILE=/run/secrets/exa_api_key.txt
EXA_PROXY_TOKENS=client_local_token
EXA_ADMIN_TOKENS=admin_local_token
EXA_ADMIN_HEALTHCHECK_TOKEN=admin_local_token
# 可选：告警 webhook，留空即禁用
# EXA_ALERT_WEBHOOK_URL=https://ops.example.com/exa-alerts
# EXA_ALERT_WEBHOOK_BEARER_TOKEN=replace_with_webhook_token
# EXA_ALERT_WEBHOOK_HMAC_SECRET=replace_with_signing_secret
EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS=300
EXA_ALERT_WEBHOOK_MAX_ATTEMPTS=2
EXA_ALERT_WEBHOOK_RETRY_BACKOFF_MS=250
```

Docker Compose 会把本机 `exa_api_key.txt` 只读挂载到 `/run/secrets/exa_api_key.txt`。管理员令牌来自 `EXA_ADMIN_TOKENS`，用于登录控制台和管理接口，不是 Exa API Key。

然后运行：

```bash
docker compose up --build -d
docker compose ps
curl -X POST -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/session
curl -H "x-admin-session-id: <session-id>" http://127.0.0.1:8787/_proxy/health
curl -H "x-admin-session-id: <session-id>" http://127.0.0.1:8787/_proxy/config-summary
curl -H "x-admin-session-id: <session-id>" http://127.0.0.1:8787/_proxy/observability?hours=24
curl -H "x-admin-session-id: <session-id>" http://127.0.0.1:8787/_proxy/metrics
curl -H "x-admin-session-id: <session-id>" http://127.0.0.1:8787/_proxy/logs/export?limit=10
docker compose down
```

期望结果：服务启动，health 返回 `{"ok":true}`，观测接口返回趋势窗口、告警数组、日志保留摘要和 webhook 状态；metrics 返回 Prometheus 文本；日志导出为 CSV。管理 API 不返回 `value` 字段；控制台默认只显示内部密钥 ID，公网部署前必须启用 HTTPS、网络访问控制和强管理员令牌。

## 四、SQLite 运维检查

真实密钥池和请求日志增长后，需要把 SQLite 文件当成运维对象管理：

```bash
# 在线备份时优先使用 sqlite3 backup；停机备份时同时保留 .sqlite、.sqlite-wal、.sqlite-shm。
sqlite3 /data/exa-proxy.sqlite ".backup '/backup/exa-proxy-$(date +%Y%m%d%H%M%S).sqlite'"

# 低峰维护：回收 WAL、压缩数据库、检查完整性。
sqlite3 /data/exa-proxy.sqlite "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA integrity_check;"

# 索引检查：至少应看到 request_logs_created_at_idx 和 admin_audit_logs_created_at_idx。
sqlite3 /data/exa-proxy.sqlite "PRAGMA index_list('request_logs'); PRAGMA index_list('admin_audit_logs');"
```

## 五、真实 Key 手动检查

把真实 Exa Key 放入 `exa_api_key.txt` 后运行：

```bash
curl -X POST http://127.0.0.1:8787/search   -H "Authorization: Bearer client_local_token"   -H "Content-Type: application/json"   -d '{"query":"What is Exa search?","numResults":2}'

curl -X POST http://127.0.0.1:8787/contents   -H "Authorization: Bearer client_local_token"   -H "Content-Type: application/json"   -d '{"urls":["https://exa.ai"],"text":true}'

curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/keys
curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/logs
```

期望结果：公开端点返回 Exa 兼容响应；管理端显示用量、冷却、请求日志、趋势告警和审计记录。VPS 部署默认不显示原始 key；如临时开启原始 key reveal，只允许受信网络访问，并必须在生产反代层开启 HTTPS。

## 六、VPS 覆盖配置

公网 VPS 建议使用 `docker compose -f docker-compose.yml -f docker-compose.vps.yml up --build -d` 启动。基础 Compose 和覆盖文件都会把服务端口绑定到 `127.0.0.1:8787`，覆盖文件还会开启 `EXA_ADMIN_REQUIRE_HTTPS=true` 与 `EXA_ADMIN_ALLOW_RAW_KEY_DISPLAY=false`。
