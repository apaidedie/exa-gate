# 文档目录

## 按任务找文档

| 我想要 | 入口 | 说明 |
| --- | --- | --- |
| 我要部署到 VPS | [DEPLOYMENT.md](DEPLOYMENT.md) | Docker Hub 镜像、Compose 启动、反向代理、备份恢复和发布流程。 |
| 我要检查上线条件 | [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | 令牌、加密密钥、探针、HTTPS、Key 导入和回滚检查清单。 |
| 我要接入管理 API | [openapi.json](openapi.json) | `/_proxy` 探针、会话、Key、日志、审计、可观测和 Webhook 接口契约。 |
| 我要复现 README 截图 | [assets/](assets/) | `npm run capture:preview` 会从本地 demo 渲染受控访问入口、桌面运维总览和移动端请求日志截图。 |
| 我要接 Grafana | [grafana-dashboard.json](grafana-dashboard.json) | Prometheus 指标的 Grafana 面板模板。 |

## README 预览资产

- `assets/admin-auth-entry.png` - 受控访问入口，展示管理员令牌、浏览器会话和上游隔离边界。
- `assets/admin-console.png` - 桌面运维总览，展示代理链路地图、最近活动、Key 池健康、趋势和告警建议。
- `assets/admin-console-mobile.png` - 移动端请求日志，展示从请求列表进入链路面板的实操路径。

这些图片必须由 `npm run capture:preview` 生成，并由静态测试校验路径、尺寸和非空 PNG 字节。
