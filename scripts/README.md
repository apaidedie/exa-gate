# scripts

- `docker-entrypoint.sh` - 容器入口：确保 `/data` 可写后以 uid 10001 运行网关。
- `make-interop-fixture.mjs` - （已归档）历史 Node↔Go 加密互操作夹具生成器；夹具已提交至 `test/fixtures/interop-node.sqlite`。
