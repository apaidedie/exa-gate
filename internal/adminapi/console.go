// Package adminapi embeds the static console and serves it under /_proxy/ui
// with the same URL shape the console JS expects.
package adminapi

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed console
var consoleFS embed.FS

// RegisterConsole serves the embedded console: index at / and /_proxy/ui,
// static assets under /_proxy/ui/. The version chip is populated by the
// console at runtime from /_proxy/config-summary, so no server-side
// injection happens here.
func RegisterConsole(mux *http.ServeMux, proxy http.Handler) {
	sub, err := fs.Sub(consoleFS, "console")
	if err != nil {
		return
	}
	fileServer := http.StripPrefix("/_proxy/ui/", http.FileServer(http.FS(sub)))
	serveIndex := func(w http.ResponseWriter, r *http.Request) {
		index, err := fs.ReadFile(sub, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html; charset=utf-8")
		w.Header().Set("cache-control", "no-store")
		w.Header().Set("x-content-type-options", "nosniff")
		w.Header().Set("referrer-policy", "no-referrer")
		_, _ = w.Write(index)
	}
	mux.HandleFunc("/_proxy/ui", serveIndex)
	mux.HandleFunc("/_proxy/ui/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			serveIndex(w, r)
			return
		}
		w.Header().Set("x-content-type-options", "nosniff")
		fileServer.ServeHTTP(w, r)
	})
	// Root: console index at "/", proxy 404 for unknown /_proxy/* (defensive),
	// everything else goes to the proxy handler.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/":
			serveIndex(w, r)
		case strings.HasPrefix(r.URL.Path, "/_proxy/"):
			writeError(w, http.StatusNotFound, "route_not_found", "Proxy admin route was not found.", requestIDOf(r))
		default:
			proxy.ServeHTTP(w, r)
		}
	})
}
