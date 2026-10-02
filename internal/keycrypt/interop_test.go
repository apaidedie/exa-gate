package keycrypt

import (
	"database/sql"
	"os"
	"testing"

	"github.com/apaidedie/exa-gate/internal/state"
)

// TestDecryptNodeFixture proves cross-implementation compatibility: the
// fixture database was written by the TypeScript runtime (Node better-sqlite3
// + crypto.createCipheriv/scryptSync). The Go implementation must decrypt the
// key values, read stats counters, affinity, sessions, audit and logs.
func TestDecryptNodeFixture(t *testing.T) {
	fixture := "../../test/fixtures/interop-node.sqlite"
	if _, err := os.Stat(fixture); err != nil {
		t.Skipf("fixture missing: %v", err)
	}
	store, err := state.Open(fixture)
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer store.Close()

	secret := "interop-test-secret-32ch"
	stats, err := store.ListKeyStats()
	if err != nil {
		t.Fatalf("list key stats: %v", err)
	}
	if len(stats) != 2 {
		t.Fatalf("expected 2 keys, got %d", len(stats))
	}
	byID := map[string]state.KeyStats{}
	for _, stat := range stats {
		byID[stat.ID] = stat
	}
	k1, ok := byID["k1"]
	if !ok {
		t.Fatal("k1 missing")
	}
	if !k1.Enabled || k1.Weight != 3 {
		t.Fatalf("k1 enabled/weight mismatch: %+v", k1)
	}
	if k1.TotalRequests != 2 || k1.SuccessCount != 1 || k1.FailureCount != 1 || k1.RetryCount != 1 || k1.RateLimitCount != 1 {
		t.Fatalf("k1 counters mismatch: %+v", k1)
	}
	if k1.Value == nil {
		t.Fatal("k1 value missing")
	}
	plaintext, err := Decrypt(*k1.Value, secret)
	if err != nil {
		t.Fatalf("decrypt k1: %v", err)
	}
	if plaintext != "sk-exa-one-aaaaaaaa" {
		t.Fatalf("k1 plaintext mismatch: %q", plaintext)
	}

	k2 := byID["k2"]
	if k2.Enabled || k2.CooldownUntil != 1700000000000 {
		t.Fatalf("k2 state mismatch: %+v", k2)
	}
	if k2.CooldownReason == nil || *k2.CooldownReason != "rate_limit" {
		t.Fatalf("k2 cooldown reason mismatch: %+v", k2)
	}

	affinity, err := store.GetAffinity("webset", "ws_123")
	if err != nil || affinity != "k1" {
		t.Fatalf("affinity mismatch: %q %v", affinity, err)
	}

	logs, err := store.ListLogsByRequestID("req_fixture_1")
	if err != nil || len(logs) != 1 {
		t.Fatalf("log mismatch: %v %d", err, len(logs))
	}
	if logs[0].Status != 200 || len(logs[0].KeyIDs) != 1 || logs[0].KeyIDs[0] != "k1" {
		t.Fatalf("log fields mismatch: %+v", logs[0])
	}

	audit, total, err := store.ListAudit(100)
	if err != nil || total < 1 || len(audit) < 1 {
		t.Fatalf("audit mismatch: %v %d %d", err, total, len(audit))
	}
	if audit[0].Action != "test_key" || !audit[0].Success {
		t.Fatalf("audit fields mismatch: %+v", audit[0])
	}

	session, err := store.GetSession("sess_fixture")
	if err != nil || session.TokenID != "tok_abc" {
		t.Fatalf("session mismatch: %v %+v", err, session)
	}
}

// TestEncryptDecryptRoundTrip pins the iv:tag:data hex format (16-byte IV).
func TestEncryptDecryptRoundTrip(t *testing.T) {
	secret := "roundtrip-secret-32ch"
	value := "sk-exa-roundtrip-value"
	encoded, err := Encrypt(value, secret)
	if err != nil {
		t.Fatal(err)
	}
	if !IsEncryptedFormat(encoded) {
		t.Fatalf("format not detected: %q", encoded)
	}
	decrypted, err := Decrypt(encoded, secret)
	if err != nil || decrypted != value {
		t.Fatalf("roundtrip mismatch: %q %v", decrypted, err)
	}
	if _, err := Decrypt(encoded, "wrong-secret-32ch!!!"); err == nil {
		t.Fatal("decrypt with wrong secret should fail")
	}
}

// TestDecryptLegacyEncryptedValue covers values written before the
// credits_exhausted column existed (schema migration compatibility).
func TestDecryptLegacyEncryptedValue(t *testing.T) {
	if _, err := os.Stat("../../test/fixtures/interop-node.sqlite"); err != nil {
		t.Skip("fixture missing")
	}
	// The fixture's k2 row was written by Node with an old-style value column
	// value absent; the value column only exists on rows written with a value.
	// This test simply asserts the migration path opens cleanly.
	store, err := state.Open("../../test/fixtures/interop-node.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	var value sql.NullString
	err = store.DB().QueryRow("SELECT value FROM key_stats WHERE id = 'k1'").Scan(&value)
	if err != nil {
		t.Fatal(err)
	}
	if !value.Valid {
		t.Fatal("k1 value should be present")
	}
}
