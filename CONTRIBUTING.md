# 贡献指南

感谢你对本项目的关注！以下是参与开发的相关说明。

## 开发环境搭建

- **Go** 1.26 或更高版本
- **Docker**（用于本地容器化测试，可选）

克隆仓库后构建：

```bash
git clone <repo-url>
cd exa-gate
CGO_ENABLED=0 go build -o exa-gate ./cmd/exa-gate
```

## 开发流程

```bash
# 静态检查
go vet ./...

# 运行全部测试（含 Node↔Go 加密互操作夹具）
go test ./... -timeout 180s

# 本地构建单二进制
CGO_ENABLED=0 go build -o exa-gate ./cmd/exa-gate
```

常用命令速查：

| 命令 | 说明 |
| --- | --- |
| `go vet ./...` | 静态分析 |
| `go test ./...` | 运行全部测试 |
| `go test -race ./internal/scheduler ./internal/proxy` | 竞态检测 |
| `CGO_ENABLED=0 go build -o exa-gate ./cmd/exa-gate` | 构建单二进制 |

## 代码规范

- Go 标准项目布局：`cmd/` 入口、`internal/` 包。
- `admin-ui` 目录下的前端代码使用 **vanilla JavaScript**（`go:embed` 打入二进制），不引入框架。
- 面向用户的界面文案统一使用 **中文**。
- SQLite 操作统一走 `internal/state`，使用 WAL + busy_timeout 5000 + 单写连接。

## 提交规范

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

常用类型：

- `feat` — 新功能
- `fix` — 修复缺陷
- `refactor` — 重构（不影响功能）
- `docs` — 文档变更
- `test` — 测试相关
- `chore` — 构建 / 工具链变更

示例：

```
feat(proxy): 支持流式响应透传

添加对上游 SSE 流式响应的透传能力，降低首字节延迟。

Closes #42
```

## 测试要求

- 提交前必须通过 `go vet ./...` 和 `go test ./...`。
- 并发相关代码需通过 `go test -race` 竞态检测。
- 新增功能需附带对应的单元测试。
- 修复缺陷时，建议补充回归测试用例以防止问题复现。
- Docker 或部署文件变更需额外确认 `docker compose config --no-interpolate` 仍可通过。
