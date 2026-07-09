# 脚本目录

## 常用脚本

- `backup-state.mjs` / `restore-state.mjs` - 备份和恢复 Docker volume 中的 SQLite 状态。
- `setup-env.mjs` - 从 `.env.example` 生成带强随机必填密钥的 `.env`。
- `scan-secrets.mjs` - 扫描已跟踪和未忽略文件中的明显密钥材料。
- `publish-docker-hub.bat` - 手动构建并推送 Docker Hub 镜像。
- `prepare-deployment.bat` - 部署前检查和准备。
- `check-docker.bat` / `fix-sqlite.bat` - 本地排查辅助脚本。
- `copy-admin-ui.mjs`, `demo-ui-server.ts`, `capture-admin-preview.ts` - 开发、演示和 README 桌面/移动端截图辅助脚本；`npm run capture:preview` 会刷新 `docs/assets/admin-console.png` 和 `docs/assets/admin-console-mobile.png`。
