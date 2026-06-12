import { request, type Dispatcher } from 'undici';

export type UpstreamResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Dispatcher.ResponseData['body'];
};

export async function callUpstream(options: {
  baseUrl: string;
  pathAndQuery: string;
  method: string;
  headers: Record<string, string>;
  body?: Buffer | null;
  timeoutMs: number;
}): Promise<UpstreamResponse> {
  const url = new URL(options.pathAndQuery, options.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await request(url, {
      method: options.method,
      headers: options.headers,
      body: options.body ?? undefined,
      signal: controller.signal
    });
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body
    };
  } finally {
    clearTimeout(timer);
  }
}
