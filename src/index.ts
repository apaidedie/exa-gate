import { buildApp } from './app.js';
import { loadConfigFromEnv } from './config.js';

const config = loadConfigFromEnv();
const app = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });

// Graceful shutdown: stop accepting new connections, let in-flight upstream
// requests finish, run onClose hooks (pool + SQLite), then exit. Docker's
// 10s stop timeout is the upper bound; force-exit before SIGKILL.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const force = setTimeout(() => process.exit(0), 9_000);
    force.unref();
    app.close().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
