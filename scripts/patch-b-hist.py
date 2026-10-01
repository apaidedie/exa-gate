# logs.ts: DB-backed histogram method (placeholder replace, no format)
p = 'src/state/logs.ts'
s = open(p, encoding='utf-8').read()
bounds = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
cases = ',\n        '.join(
    'SUM(CASE WHEN latency_ms <= ' + str(b) + ' THEN 1 ELSE 0 END) AS b' + str(i)
    for i, b in enumerate(bounds)
)
method = (
  '  requestLatencyHistogram(cutoffMs: number): { buckets: Array<{ le: string; count: number }>; count: number; sum: number } {\n'
  '    const bounds = [' + ', '.join(str(b) for b in bounds) + '];\n'
  '    const row = db.prepare(`\n'
  '      SELECT\n'
  '        COUNT(*) AS total,\n'
  '        COALESCE(SUM(latency_ms), 0) AS total_ms,\n'
  + cases + '\n'
  '      FROM request_logs\n'
  '      WHERE created_at >= ?\n'
  '    `).get(cutoffMs) as Record<string, number>;\n'
  "    const perBound = bounds.map((_, i) => Number(row['b' + i] ?? 0));\n"
  '    const buckets: Array<{ le: string; count: number }> = [];\n'
  '    let cumulative = 0;\n'
  '    bounds.forEach((b, i) => {\n'
  '      cumulative += perBound[i];\n'
  '      buckets.push({ le: String(b), count: cumulative });\n'
  '    });\n'
  "    buckets.push({ le: '+Inf', count: Number(row.total ?? 0) });\n"
  '    return { buckets, count: Number(row.total ?? 0), sum: Number(row.total_ms ?? 0) };\n'
  '  },\n\n'
)
anchor = '  requestLogRetentionSummary(cutoffMs: number): RequestLogRetentionSummary {'
assert anchor in s, 'logs anchor'
s = s.replace(anchor, method + anchor, 1)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('logs.ts method added')

# metrics.ts: DB-backed renderer
p = 'src/metrics.ts'
s = open(p, encoding='utf-8').read()
addition = '''

export type RequestLogLatencyHistogram = {
  buckets: Array<{ le: string; count: number }>;
  count: number;
  sum: number;
};

export function renderRequestLogLatencyHistogram(histogram: RequestLogLatencyHistogram): string[] {
  const lines = [
    '# HELP exa_proxy_request_log_duration_ms Upstream request duration in milliseconds over the log retention window',
    '# TYPE exa_proxy_request_log_duration_ms histogram'
  ];
  for (const bucket of histogram.buckets) {
    lines.push('exa_proxy_request_log_duration_ms_bucket{le="' + bucket.le + '"} ' + bucket.count);
  }
  lines.push('exa_proxy_request_log_duration_ms_sum ' + histogram.sum);
  lines.push('exa_proxy_request_log_duration_ms_count ' + histogram.count);
  return lines;
}
'''
assert 'renderRequestLogLatencyHistogram' not in s
s = s.rstrip() + '\n' + addition
open(p, 'w', encoding='utf-8', newline='').write(s)
print('metrics.ts renderer added')
