import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createFakeExa } from './helpers/fakeExa.js';
import { testConfig } from './testConfig.js';

const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

describe('resource affinity', () => {
  it('uses the creating key for follow-up resource requests', async () => {
    const fake = await createFakeExa((request) => {
      if (request.url === '/agent/runs' && request.method === 'POST') return { status: 200, body: { id: 'run_123' } };
      return { status: 200, body: { used: request.headers['x-api-key'] } };
    });
    apps.push(fake.app);
    const app = await buildApp({ config: testConfig({ upstreamUrl: fake.url, maxAttempts: 1 }) });
    apps.push(app);

    await app.inject({
      method: 'POST',
      url: '/agent/runs',
      headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' },
      payload: { prompt: 'hello' }
    });
    const followUp = await app.inject({ method: 'GET', url: '/agent/runs/run_123', headers: { authorization: 'Bearer client_token' } });

    expect(followUp.statusCode).toBe(200);
    expect(followUp.json()).toEqual({ used: 'key-a' });
  });
});
