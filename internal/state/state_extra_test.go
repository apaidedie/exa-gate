package state

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestClosedStoreMethodsReturnErrors exercises the error-return path of every
// Store method by closing the underlying database first.
func TestClosedStoreMethodsReturnErrors(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "closed.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Close(); err != nil {
		t.Fatal(err)
	}

	value := "v"
	reason := "rate_limit"
	now := time.Now().UnixMilli()
	checks := map[string]func(*testing.T){
		"SeedKeys": func(t *testing.T) {
			if err := st.SeedKeys([]KeySeed{{ID: "a", Weight: 1, Enabled: true}}); err == nil {
				t.Error("want error")
			}
		},
		"RecordAttempt": func(t *testing.T) {
			if err := st.RecordAttempt(AttemptRecord{KeyID: "a", Success: true}); err == nil {
				t.Error("want error")
			}
		},
		"SetCooldown": func(t *testing.T) {
			if err := st.SetCooldown("a", 1, &reason); err == nil {
				t.Error("want error")
			}
		},
		"SetEnabled": func(t *testing.T) {
			if err := st.SetEnabled("a", false); err == nil {
				t.Error("want error")
			}
		},
		"ListKeyStats": func(t *testing.T) {
			if _, err := st.ListKeyStats(); err == nil {
				t.Error("want error")
			}
		},
		"GetKeyValue": func(t *testing.T) {
			if _, err := st.GetKeyValue("a"); err == nil {
				t.Error("want error")
			}
		},
		"ListPersistentKeys": func(t *testing.T) {
			if _, err := st.ListPersistentKeys(); err == nil {
				t.Error("want error")
			}
		},
		"KeyCount": func(t *testing.T) {
			if _, err := st.KeyCount(); err == nil {
				t.Error("want error")
			}
		},
		"DeleteKey": func(t *testing.T) {
			if err := st.DeleteKey("a"); err == nil {
				t.Error("want error")
			}
		},
		"SetAffinity": func(t *testing.T) {
			if err := st.SetAffinity("webset", "w", "a", 1); err == nil {
				t.Error("want error")
			}
		},
		"GetAffinity": func(t *testing.T) {
			if _, err := st.GetAffinity("webset", "w"); err == nil {
				t.Error("want error")
			}
		},
		"PruneAffinity": func(t *testing.T) {
			if _, err := st.PruneAffinity(1); err == nil {
				t.Error("want error")
			}
		},
		"RecordRequestLog": func(t *testing.T) {
			if err := st.RecordRequestLog(RequestLog{RequestID: "r", Method: "GET", Path: "/", Status: 200, CreatedAt: now}); err == nil {
				t.Error("want error")
			}
		},
		"ListRequestLogs": func(t *testing.T) {
			if _, err := st.ListRequestLogs(LogFilter{From: 0}); err == nil {
				t.Error("want error")
			}
		},
		"ListLogsByRequestID": func(t *testing.T) {
			if _, err := st.ListLogsByRequestID("r"); err == nil {
				t.Error("want error")
			}
		},
		"PruneLogs": func(t *testing.T) {
			if _, err := st.PruneLogs(1); err == nil {
				t.Error("want error")
			}
		},
		"RecordAudit": func(t *testing.T) {
			if err := st.RecordAudit(AuditRecord{Action: "x", Success: true}); err == nil {
				t.Error("want error")
			}
		},
		"ListAudit": func(t *testing.T) {
			if _, _, err := st.ListAudit(10); err == nil {
				t.Error("want error")
			}
		},
		"CreateSession": func(t *testing.T) {
			if err := st.CreateSession(AdminSession{ID: "s", TokenID: "t", CreatedAt: now, ExpiresAt: now, LastSeenAt: now}); err == nil {
				t.Error("want error")
			}
		},
		"GetSession": func(t *testing.T) {
			if _, err := st.GetSession("s"); err == nil {
				t.Error("want error")
			}
		},
		"TouchSession": func(t *testing.T) {
			if err := st.TouchSession("s", now); err == nil {
				t.Error("want error")
			}
		},
		"DeleteSession": func(t *testing.T) {
			if err := st.DeleteSession("s"); err == nil {
				t.Error("want error")
			}
		},
		"ListActiveSessions": func(t *testing.T) {
			if _, err := st.ListActiveSessions(now); err == nil {
				t.Error("want error")
			}
		},
		"PruneSessions": func(t *testing.T) {
			if err := st.PruneSessions(now); err == nil {
				t.Error("want error")
			}
		},
		"CountFailedAdminLogins": func(t *testing.T) {
			if _, err := st.CountFailedAdminLogins(0); err == nil {
				t.Error("want error")
			}
		},
		"HourlyCounts": func(t *testing.T) {
			if _, err := st.HourlyCounts(0); err == nil {
				t.Error("want error")
			}
		},
		"DeleteKeysBatch": func(t *testing.T) {
			if err := st.DeleteKeysBatch([]string{"a"}); err == nil {
				t.Error("want error")
			}
		},
		"ListKeyFailureLogs": func(t *testing.T) {
			if _, err := st.ListKeyFailureLogs("a", 10); err == nil {
				t.Error("want error")
			}
		},
		"SeedKeysBatch": func(t *testing.T) {
			if _, err := st.SeedKeysBatch([]KeySeed{{ID: "a", Value: &value, Weight: 1, Enabled: true}}); err == nil {
				t.Error("want error")
			}
		},
	}
	for name, check := range checks {
		t.Run(name, check)
	}
}

func TestOpenFailurePaths(t *testing.T) {
	// State path whose parent is a file: MkdirAll fails.
	dir := t.TempDir()
	blocker := filepath.Join(dir, "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(filepath.Join(blocker, "gate.sqlite")); err == nil {
		t.Error("Open with file-as-parent should fail")
	}

	// Path is an existing DIRECTORY: opening the pragma fails.
	sub := filepath.Join(dir, "as-dir")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(sub); err == nil {
		t.Error("Open on a directory should fail")
	}
}
