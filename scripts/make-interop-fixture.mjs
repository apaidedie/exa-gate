import { openDatabase, applySchema } from '../dist/src/state/migrations.js';
import { encrypt as Encrypt } from '../dist/src/crypto.js';
import { createKeysStore } from '../dist/src/state/keys.js';
import path from 'node:path';

const db = openDatabase(':memory:');
applySchema(db);
const secret = 'interop-test-secret-32ch';
// Boot flow parity: seed stat rows WITHOUT values (createKeysStore), then
// persist encrypted values exactly like the admin import endpoint does.
const keys = createKeysStore(db, [
  { id: 'k1', weight: 3, enabled: true },
  { id: 'k2', weight: 1, enabled: false }
]);
keys.upsertKey('k1', Encrypt('sk-exa-one-aaaaaaaa', secret), 3, true);
keys.upsertKey('k2', Encrypt('sk-exa-two-bbbbbbbb', secret), 1, false);
keys.recordAttempt({ keyId: 'k1', status: 200, success: true, latencyMs: 123, retry: false, reason: 'ok' });
keys.recordAttempt({ keyId: 'k1', status: 429, success: false, latencyMs: 45, retry: true, reason: 'rate_limit' });
keys.setCooldown('k2', 1700000000000, 'rate_limit');
keys.setAffinity('webset', 'ws_123', 'k1');
db.prepare("INSERT INTO request_logs (request_id, token_id, method, path, status, key_ids_json, attempts, latency_ms, error_code, query, created_at) VALUES ('req_fixture_1', 'tok_abc', 'POST', '/search', 200, ?, 1, 88, NULL, 'fixture query', 1700000001000)").run('["k1"]');
db.prepare("INSERT INTO admin_audit_logs (actor_token_id, action, target_id, success, detail, ip, user_agent, created_at) VALUES ('tok_abc', 'test_key', 'k1', 1, 'status 200', '127.0.0.1', 'fixture', 1700000002000)").run();
db.prepare("INSERT INTO admin_sessions (id, token_id, created_at, expires_at, last_seen_at) VALUES ('sess_fixture', 'tok_abc', 1700000000000, 1799999999999, 1700000000000)").run();
const out = path.join(process.cwd(), 'test', 'fixtures', 'interop-node.sqlite').split(path.sep).join('/');
db.exec("VACUUM INTO '" + out + "'");
console.log('fixture written:', out);
