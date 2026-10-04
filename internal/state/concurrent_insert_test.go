package state

import (
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func TestConcurrentRequestLogInserts(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "conc.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	const workers = 40
	const perWorker = 50
	var wg sync.WaitGroup
	var lost atomic.Int64
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				err := st.RecordRequestLog(RequestLog{RequestID: "r", Method: "POST", Path: "/search", Status: 200, CreatedAt: 1})
				if err != nil {
					lost.Add(1)
					t.Logf("insert error: %v", err)
				}
			}
		}(w)
	}
	wg.Wait()
	if count, err := st.CountLogs(); err != nil || count != workers*perWorker {
		t.Errorf("rows = %d (err %v), want %d; lost inserts: %d", count, err, workers*perWorker, lost.Load())
	}
}
