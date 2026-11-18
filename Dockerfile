# syntax=docker/dockerfile:1

FROM ghcr.io/voidzero-dev/vite-plus:1.5.0 AS manifests
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=vp:vp apps/api/package.json apps/api/
COPY --chown=vp:vp apps/collab/package.json apps/collab/
COPY --chown=vp:vp apps/compiler/package.json apps/compiler/
COPY --chown=vp:vp apps/web/package.json apps/web/
COPY --chown=vp:vp packages/db/package.json packages/db/
COPY --chown=vp:vp packages/shared/package.json packages/shared/

FROM manifests AS build
RUN vp install --frozen-lockfile
COPY --chown=vp:vp . .
RUN vp run -r build
RUN cp "$(vp env exec node -p process.execPath)" /tmp/node

FROM manifests AS deps
ARG APP
RUN vp install --frozen-lockfile --prod --filter "${APP}..."

FROM debian:trixie-slim AS node
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends libatomic1 \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --user-group --no-create-home backslash \
  && mkdir -p /data/blobs /data/compiles /data/compile-cache \
  && chown -R backslash:backslash /data
COPY --from=build /tmp/node /usr/local/bin/node
ENV NODE_ENV=production

FROM node AS service
ARG APP
COPY --from=deps /app /app
COPY --from=build /app/packages/db/src /app/packages/db/src
COPY --from=build /app/packages/db/drizzle /app/packages/db/drizzle
COPY --from=build /app/packages/shared/src /app/packages/shared/src
COPY --from=build /app/apps/${APP}/dist /app/apps/${APP}/dist
WORKDIR /app/apps/${APP}
USER backslash
CMD ["node", "dist/index.mjs"]

FROM node AS compiler
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap latexmk \
    texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-science \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app /app
COPY --from=build /app/packages/shared/src /app/packages/shared/src
COPY --from=build /app/apps/compiler/dist /app/apps/compiler/dist
WORKDIR /app/apps/compiler
USER backslash
CMD ["node", "dist/index.mjs"]

FROM caddy:2-alpine AS web
RUN addgroup -S caddy && adduser -S -H -G caddy caddy && chown caddy:caddy /data /config
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
USER caddy
