# syntax=docker/dockerfile:1
# Go single-binary build. Runtime is alpine to preserve the chown-on-boot
# entrypoint UX for bind-mounted volumes; the process itself is the Go binary.

FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /app/exa-gate ./cmd/exa-gate

FROM alpine:3.20
RUN apk add --no-cache ca-certificates su-exec \
    && adduser -D -u 10001 appuser \
    && mkdir -p /data && chown appuser:appuser /data
COPY --from=build /app/exa-gate /app/exa-gate
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
# Default state lives in /data (appuser-writable) so a bare `docker run` boots
# without EXA_STATE_PATH; compose mounts ./data over it for persistence.
ENV EXA_STATE_PATH=/data/exa-proxy.sqlite
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8787/_proxy/ready || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/app/exa-gate"]
