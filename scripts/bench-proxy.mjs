// Proxy overhead smoke: N requests through the gateway, report p50/p95.
const N = 300;
const url = 'http://127.0.0.1:8787/search';
const times = [];
for (let i = 0; i < N; i += 1) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer client_local_token', 'content-type': 'application/json' },
    body: JSON.stringify({ query: `bench-${i}` })
  });
  await res.arrayBuffer();
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const p = (q) => times[Math.floor(times.length * q)].toFixed(1);
console.log(`proxy /search x${N}: p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms max=${times.at(-1).toFixed(1)}ms`);
