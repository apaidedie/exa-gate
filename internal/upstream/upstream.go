// Package upstream performs single upstream attempts with per-attempt
// timeout, client-disconnect propagation and a pooled transport (H2 optional).
package upstream

import (
	"bytes"
	"context"
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

// Do performs one upstream request. timeoutMs bounds the request phase
// (until response headers arrive). The response body is NOT bounded by the
// timeout so streaming responses (SSE, long research) are not killed.
// clientGone cancels early when the downstream client disconnects.
func (c *Client) Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
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
	resp, err := c.http.Do(req)
	if err != nil {
		cancel()
		return nil, err
	}
	// Headers received: detach from the timeout context so streaming
	// response bodies are not killed. Cleanup happens on Body.Close().
	resp.Body = &cancelReadCloser{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}
