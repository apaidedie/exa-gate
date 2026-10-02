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

// Do performs one upstream request. timeoutMs bounds the whole attempt
// (request + response headers). clientGone cancels early when the
// downstream client disconnects.
func (c *Client) Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	if clientGone != nil {
		merged, cancelMerged := context.WithCancel(ctx)
		defer cancelMerged()
		go func() {
			select {
			case <-clientGone:
				cancelMerged()
			case <-merged.Done():
			}
		}()
		ctx = merged
	}
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, pathAndQuery, bodyReader)
	if err != nil {
		return nil, err
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	return c.http.Do(req)
}
