import { buildApp } from './app.js';
import { loadConfigFromEnv } from './config.js';

const config = loadConfigFromEnv();
const app = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });
