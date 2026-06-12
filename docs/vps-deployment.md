# VPS 部署说明

这份配置用于把 Exa API 反向代理放到公网 VPS 上。服务本体只监听本机 `127.0.0.1:8787`，公网入口交给 Nginx、Caddy 或其他 HTTPS 反向代理。

## 环境变量

生产环境建议从 `.env.example` 复制一份 `.env`，再替换令牌和真实 Key 文件路径。管理员令牌不是 Exa API Key，只用于登录控制台。

```dotenv
EXA_KEYS_FILE=/run/secrets/exa_api_key.txt
EXA_PROXY_TOKENS=replace_with_long_random_client_token
EXA_ADMIN_TOKENS=replace_with_long_random_admin_token
EXA_ADMIN_HEALTHCHECK_TOKEN=replace_with_long_random_admin_token
EXA_ADMIN_REQUIRE_HTTPS=true
EXA_ADMIN_ALLOW_RAW_KEY_DISPLAY=false
EXA_ADMIN_SESSION_TTL_SECONDS=86400
EXA_ADMIN_LOCKOUT_MAX_FAILURES=5
EXA_ADMIN_LOCKOUT_WINDOW_SECONDS=300
EXA_ADMIN_LOCKOUT_SECONDS=1800
EXA_LOG_RETENTION_DAYS=14
# 可选：告警 webhook，留空即禁用
# EXA_ALERT_WEBHOOK_URL=https://ops.example.com/exa-alerts
# EXA_ALERT_WEBHOOK_BEARER_TOKEN=replace_with_webhook_token
# EXA_ALERT_WEBHOOK_HMAC_SECRET=replace_with_signing_secret
EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS=300
EXA_ALERT_WEBHOOK_MAX_ATTEMPTS=2
EXA_ALERT_WEBHOOK_RETRY_BACKOFF_MS=250
```

`EXA_ADMIN_ALLOW_RAW_KEY_DISPLAY=false` 是 VPS 默认建议。这样 `/_proxy/keys` 只返回内部密钥 ID，不批量返回原始 Exa Key。确实需要临时复制原始 Key 时，改成 `true` 后重启服务，控制台会在复制前确认，并把 reveal 行为写入管理员审计。

如需把可用密钥过低、失败率、429 比例和突增告警推送到外部运维系统，配置 `EXA_ALERT_WEBHOOK_URL`。投递内容只包含告警、阈值、窗口和日志保留摘要，不包含原始 Exa Key；`EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS` 用于防止控制台刷新时重复刷屏。接企业微信、飞书、Grafana Alertmanager 或自建接收器时，建议同时配置 `EXA_ALERT_WEBHOOK_HMAC_SECRET`，接收端校验 `x-exa-alert-signature: sha256=...`；临时网络抖动可通过 `EXA_ALERT_WEBHOOK_MAX_ATTEMPTS` 和 `EXA_ALERT_WEBHOOK_RETRY_BACKOFF_MS` 做轻量重试。

## Docker Compose 启动

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up --build -d
docker compose ps
```

基础 Compose 和 VPS 覆盖文件都会把端口绑定到 `127.0.0.1:8787`，避免容器端口直接暴露到公网。

## Caddy 反向代理示例

```caddyfile
your-domain.example {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8787 {
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Host {host}
  }
}
```

如果使用 Nginx，同样需要把 `X-Forwarded-Proto` 传成 `https`，否则开启 `EXA_ADMIN_REQUIRE_HTTPS=true` 后管理接口会返回 426。

## 验证

```bash
curl -X POST -H "Authorization: Bearer <admin-token>" https://your-domain.example/_proxy/session
curl -H "x-admin-session-id: <session-id>" https://your-domain.example/_proxy/health
curl -H "x-admin-session-id: <session-id>" https://your-domain.example/_proxy/config-summary
curl -H "x-admin-session-id: <session-id>" https://your-domain.example/_proxy/keys
curl -H "x-admin-session-id: <session-id>" https://your-domain.example/_proxy/metrics
```

期望结果是 health 返回 `ok: true`，keys 返回密钥统计和调度状态，metrics 返回 Prometheus 文本；这些响应不包含 `value` 字段，也不包含原始 Exa Key。控制台入口是 `https://your-domain.example/`。

## SQLite 维护

`EXA_STATE_PATH` 指向的 SQLite 数据库默认使用 WAL。备份时优先使用 SQLite 在线备份；如果选择停机复制，需要把主库、`-wal`、`-shm` 三个文件作为同一组处理。

```bash
sqlite3 /data/exa-proxy.sqlite ".backup '/backup/exa-proxy-$(date +%Y%m%d%H%M%S).sqlite'"
sqlite3 /data/exa-proxy.sqlite "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA integrity_check;"
sqlite3 /data/exa-proxy.sqlite "PRAGMA index_list('request_logs'); PRAGMA index_list('admin_audit_logs');"
```

建议保留 `EXA_LOG_RETENTION_DAYS`，并监控 `.sqlite-wal` 文件大小；日志量明显增长后，把 WAL checkpoint、VACUUM 和备份放到低峰窗口执行。
