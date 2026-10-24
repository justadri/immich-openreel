# syntax=docker/dockerfile:1
#
# immich-openreel: the OpenReel editor as static files behind nginx, with /immich-api proxied to your
# Immich server (same origin, so no CORS and Immich's own login/session cookie just works).
#
#   docker build -t immich-openreel .
#   docker run -p 8080:80 -e IMMICH_URL=http://immich-server:2283 immich-openreel

# ---------------------------------------------------------------- build
# Always runs on the build machine's own architecture: the output is plain JS/wasm, so multi-arch
# images need no emulation here.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
ARG PNPM_VERSION=11.7.0
ENV CI=true \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /src
# Packaging files are left out so editing them doesn't invalidate the (slow) install and build layers.
COPY --exclude=Dockerfile --exclude=docker --exclude=README.md --exclude=NOTICE.md . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
# build:wasm (AssemblyScript) then the web app
RUN pnpm build

# ---------------------------------------------------------------- runtime
FROM nginx:1.27-alpine

# Where the proxy sends /immich-api. No trailing slash, no /api (both are tolerated and stripped).
ENV IMMICH_URL=http://immich-server:2283

COPY docker/15-immich-url.sh /docker-entrypoint.d/15-immich-url.sh
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/cross-origin-isolation.conf /etc/nginx/snippets/cross-origin-isolation.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html

# Run by the nginx entrypoint (only executable scripts are) before it renders the config template.
RUN chmod 755 /docker-entrypoint.d/15-immich-url.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
