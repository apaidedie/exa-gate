package upstream

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBodyCloseReleasesContextGoroutine(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("done"))
	}))
	defer ts.Close()

	// clientGone never fires: the merge goroutine must exit through the
	// merged.Done() branch once the body is closed (cancel runs there).
	clientGone := make(chan struct{})
	c := New(ts.URL, 2, false)
	resp, err := c.Do(ts.URL, "GET", nil, nil, 5000, clientGone)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	// Give the merge goroutine a moment to observe the cancelled context.
	time.Sleep(50 * time.Millisecond)
}
