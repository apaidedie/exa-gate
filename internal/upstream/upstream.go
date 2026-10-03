// Package upstream performs single upstream attempts with per-attempt
// timeout, client-disconnect propagation and a pooled transport (H2 optional).
package upstream

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

type Client struct {
	http *http.Client
}

func New(baseURL string, poolConnections int, allowH2 bool) *Client {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        poolConnections,
		MaxIdleConnsPerHost: poolConnections,
		IdleConnTimeout:     30 * time.Second,
		ForceAttemptHTTP2:   allowH2,
	}
	return &Client{http: &http.Client{
		Transport: transport,
		// No client-wide timeout: each attempt applies its own via context.
	}}
}

// cancelReadCloser wraps a response body to cancel the context on Close.
type cancelReadCloser struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (c *cancelReadCloser) Close() error {
	c.cancel()
	return c.ReadCloser.Close()
}

// Do performs one upstream request. timeoutMs bounds the request phase only
// (until response headers arrive): the timer is armed via time.AfterFunc and
// stopped once Do returns, so the context carries no deadline and streaming
// response bodies (SSE, long research) are not killed. clientGone cancels
// early when the downstream client disconnects.
func (c *Client) Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error) {
	ctx, cancel := context.WithCancel(context.Background())
	if clientGone != nil {
		merged, cancelMerged := context.WithCancel(ctx)
		go func() {
			select {
			case <-clientGone:
				cancelMerged()
			case <-merged.Done():
			}
		}()
		ctx = merged
		cancel = cancelMerged
	}
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, pathAndQuery, bodyReader)
	if err != nil {
		cancel()
		return nil, err
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	// A context deadline here would keep firing during the body phase and cut
	// streams short; the AfterFunc timer only survives until headers arrive.
	timer := time.AfterFunc(time.Duration(timeoutMs)*time.Millisecond, cancel)
	resp, err := c.http.Do(req)
	if !timer.Stop() {
		// The deadline fired while the request was in flight: the context is
		// already cancelled, so the attempt failed regardless of what Do saw.
		if resp != nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
		cancel()
		return nil, fmt.Errorf("upstream request phase timeout (%dms) exceeded", timeoutMs)
	}
	if err != nil {
		cancel()
		return nil, err
	}
	// Headers received: the body phase is unbounded. Cleanup happens on
	// Body.Close() via cancelReadCloser.
	resp.Body = &cancelReadCloser{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}
