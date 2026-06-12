import { afterEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { buildApp } from '../src/app.js';
import { createFakeExa } from './helpers/fakeExa.js';
import { testConfig } from './testConfig.js';

const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

describe('proxy streaming', () => {
  it('passes event streams through without JSON parsing', async () => {
    const fake = await createFakeExa(() => ({
      headers: { 'content-type': 'text/event-stream' },
      body: Readable.from(['data: one\n\n', 'data: two\n\n'])
    }));
    apps.push(fake.app);
    const app = await buildApp({ config: testConfig({ upstreamUrl: fake.url, maxAttempts: 1 }) });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/search',
      headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' },
      payload: { query: 'hello', stream: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toBe('data: one\n\ndata: two\n\n');
  });
});
