# 部署准备检查清单

## 部署前

### 1. 配置 `.env`

```env
# 必须配置（所有 Token 至少 16 字符）
EXA_KEYS_ENCRYPTION_SECRET=<随机加密密钥>
EXA_PROXY_TOKENS=<客户端令牌>
EXA_ADMIN_TOKENS=<管理员令牌>
```

生成随机密钥：`openssl rand -hex 32`

源码部署可运行 `npm run setup:env` 自动生成强随机 `.env`，已有 `.env` 时需显式使用 `npm run setup:env -- --force` 覆盖。

### 2. 环境检查

```bash
docker --version
docker compose version
npm ci
npm run verify
```

### 3. 备份现有数据（如有）

```bash
npm run backup:docker
```

## 部署后

```bash
# 启动服务
docker compose up -d

# 检查日志
docker compose logs -f

# 存活与可服务检查
curl http://127.0.0.1:8787/_proxy/live
curl http://127.0.0.1:8787/_proxy/ready

# 管理健康检查
curl -H "Authorization: Bearer <管理员令牌>" http://127.0.0.1:8787/_proxy/health

# 添加 Exa Key
curl -X POST http://127.0.0.1:8787/_proxy/keys \
  -H "Authorization: Bearer <管理员令牌>" \
  -H "Content-Type: application/json" \
  -d '{"id":"exa_01","value":"你的Exa API Key","weight":1}'

# 测试代理
curl -X POST http://127.0.0.1:8787/search \
  -H "Authorization: Bearer <客户端令牌>" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","numResults":1}'
```

访问 `http://127.0.0.1:8787/` 可打开管理控制台。

## 回滚

```bash
docker compose down
docker compose up -d --force-recreate
```

## 监控

- `/_proxy/live` — 存活探针，仅判断进程是否运行
- `/_proxy/ready` — 可服务探针，无可用 Key 时返回 503
- `/_proxy/metrics` — Prometheus 指标
- `/_proxy/observability` — 趋势与告警
- `/_proxy/keys` — Key 状态
