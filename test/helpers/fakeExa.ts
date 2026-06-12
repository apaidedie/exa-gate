import Fastify, { type FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';

export type FakeExaRequest = {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: unknown;
};

export type FakeExaResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
};

export async function createFakeExa(
  handler: (request: FakeExaRequest) => FakeExaResponse | Promise<FakeExaResponse>
): Promise<{ app: FastifyInstance; url: string }> {
  const app = Fastify({ logger: false });

  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.all('/*', async (request, reply) => {
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name] = Array.isArray(value) ? value.join(',') : value?.toString();
    }

    let body: unknown = request.body ?? '';
    if (Buffer.isBuffer(request.body)) {
      const rawBody = request.body.toString('utf8');
      body = rawBody;
      if (rawBody.length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }
    }

    const response = await handler({
      method: request.method,
      url: request.url,
      headers,
      body
    });

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    reply.code(response.status ?? 200);
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      reply.header(name, value);
    }

    if (response.body instanceof Readable) {
      return reply.send(response.body);
    }
    if (typeof response.body === 'string' || Buffer.isBuffer(response.body)) {
      return reply.send(response.body);
    }
    return reply.send(response.body ?? { ok: true });
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Fake Exa did not bind to a TCP port');
  return { app, url: `http://127.0.0.1:${address.port}` };
}
