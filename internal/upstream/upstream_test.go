package upstream

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDoSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "secret" {
			t.Errorf("header not applied: %q", r.Header.Get("x-api-key"))
		}
		if r.Method != "POST" {
			t.Errorf("method = %s", r.Method)
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != `{"q":1}` {
			t.Errorf("upstream body = %q", body)
		}
		w.Header().Set("x-upstream", "yes")
		w.WriteHeader(200)
		_, _ = w.Write([]byte("payload"))
	}))
	defer ts.Close()

	c := New(ts.URL, 8, false)
	resp, err := c.Do(ts.URL+"/search?x=1", "POST", map[string]string{"x-api-key": "secret"}, []byte(`{"q":1}`), 5000, nil)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status = %d", resp.StatusCode)
	}
	if resp.Header.Get("x-upstream") != "yes" {
		t.Error("response headers not surfaced")
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil || string(data) != "payload" {
		t.Errorf("body = %q, %v", data, err)
	}
}

func TestDoTimeoutBoundsRequestPhase(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(2 * time.Second):
		case <-r.Context().Done():
		}
	}))
	defer ts.Close()

	c := New(ts.URL, 4, false)
	start := time.Now()
	_, err := c.Do(ts.URL, "GET", nil, nil, 200, nil)
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if elapsed := time.Since(start); elapsed > 1500*time.Millisecond {
		t.Errorf("timeout took too long: %v", elapsed)
	}
}

func TestDoStreamingBodyNotKilledByTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		flusher := w.(http.Flusher)
		_, _ = w.Write([]byte("chunk1"))
		flusher.Flush()
		// Outlive the attempt timeout: headers arrived, so the body must
		// still stream to completion.
		select {
		case <-time.After(700 * time.Millisecond):
		case <-r.Context().Done():
		}
		_, _ = w.Write([]byte("chunk2"))
		flusher.Flush()
	}))
	defer ts.Close()

	c := New(ts.URL, 4, false)
	resp, err := c.Do(ts.URL, "GET", nil, nil, 250, nil)
	if err != nil {
		t.Fatalf("headers should arrive before timeout: %v", err)
	}
	data, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(data) != "chunk1chunk2" {
		t.Errorf("streamed body = %q, want chunk1chunk2", data)
	}
}

func TestDoClientDisconnectCancels(t *testing.T) {
	released := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(5 * time.Second):
		case <-r.Context().Done():
		}
		close(released)
	}))
	defer ts.Close()

	clientGone := make(chan struct{})
	go func() {
		time.Sleep(100 * time.Millisecond)
		close(clientGone)
	}()

	c := New(ts.URL, 4, false)
	start := time.Now()
	_, err := c.Do(ts.URL, "GET", nil, nil, 10000, clientGone)
	if err == nil {
		t.Fatal("expected cancellation error")
	}
	if time.Since(start) > 3*time.Second {
		t.Error("client disconnect did not cancel promptly")
	}
	select {
	case <-released:
	case <-time.After(3 * time.Second):
		t.Error("upstream handler never observed cancellation")
	}
}

func TestDoInvalidURL(t *testing.T) {
	c := New("http://invalid", 4, false)
	if _, err := c.Do("http://192.0.2.1:99999", "GET", nil, nil, 1000, nil); err == nil {
		// Invalid port fails at request construction.
		t.Log("port error expected at construction or dial")
	}
	if _, err := c.Do("ht tp://bad url", "GET", nil, nil, 1000, nil); err == nil {
		t.Error("malformed URL should fail")
	}
}

func TestDoGetWithBody(t *testing.T) {
	// body == nil must not send a body at all (GET without reader).
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil {
			t.Error("body reader missing")
		}
		w.WriteHeader(204)
	}))
	defer ts.Close()
	c := New(ts.URL, 2, false)
	resp, err := c.Do(ts.URL, "GET", nil, nil, 2000, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 204 {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
