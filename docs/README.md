# 文档目录

## 活动文档

- `DEPLOYMENT.md` - Docker Hub 发布、VPS 部署和运维命令。
- `DEPLOYMENT_CHECKLIST.md` - 部署前后检查清单。
- `openapi.json` - `/_proxy` 探针与管理接口的 OpenAPI 3.1 契约；运行服务会同步暴露为 `/_proxy/openapi.json`。
- `../scripts/setup-env.mjs` - 源码部署时可用 `npm run setup:env` 生成强随机 `.env`。
- `assets/admin-auth-entry.png` / `assets/admin-console.png` / `assets/admin-console-mobile.png` - README 使用的受控访问入口、桌面运维总览与移动端请求日志真实控制台截图，由 `npm run capture:preview` 从本地 demo 渲染生成。
