ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package*.json ./
RUN apt-get update   && apt-get install -y --no-install-recommends python3 make g++   && npm ci   && apt-get purge -y --auto-remove python3 make g++   && rm -rf /var/lib/apt/lists/*

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# OpenAPI contract is required by scripts/copy-admin-ui.mjs during build
COPY docs/openapi.json ./docs/openapi.json
RUN npm run build
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 --create-home appuser && mkdir -p /data && chown appuser:appuser /data
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gosu \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
# Start as root so entrypoint can chown bind-mounted /data, then drop to appuser.
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/_proxy/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
