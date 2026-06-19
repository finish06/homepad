# --- build ---
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

# --- runtime ---
FROM nginx:1.27-alpine
# Per-commit cache-bust for the runtime stage (#73). ci-shared passes
# --build-arg GIT_SHA=<commit sha>; a Docker ARG only invalidates the cache from
# its FIRST USE onward, so we reference it in a RUN *before* the COPYs below.
# Without this, the release build resolved this whole `FROM nginx` stage from a
# stale BuildKit/daemon cache: the corrected nginx.conf never re-COPYed and the
# `types { }` guard never re-ran, so staging kept reshipping the pre-fix conf
# under each new tag (manifest served application/octet-stream; Last-Modified
# frozen at 20:04:40 UTC across releases). Busting here forces both the dist
# COPY (advancing Last-Modified) and the nginx.conf COPY + guard to rebuild.
ARG GIT_SHA=dev
RUN echo "homepad build ${GIT_SHA}" > /etc/homepad-build-sha
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Fail the build if the webmanifest MIME fix (#18/#69/#71) is missing from the
# conf that actually landed in the image, and reject an invalid config outright.
# On staging a stale `COPY nginx.conf` cache layer shipped the pre-fix conf
# despite fresh dist, so /manifest.webmanifest served application/octet-stream
# and PWA install stayed blocked. The `types { }` block is the directive that
# actually clears nginx's inherited mime map — it is what fixes the MIME type.
# We must assert on it: the pre-fix PR #23 conf (823bbd9) already contains the
# string `application/manifest+json` (as a bare default_type, no `types { }`),
# so grepping only for that string lets the cached pre-fix layer pass the guard
# (#71). Requiring `types { }` makes the cached pre-fix conf fail the build,
# forcing Docker to re-COPY the real conf. `nginx -t` additionally catches any
# config syntax error.
RUN grep -q 'types { }' /etc/nginx/conf.d/default.conf \
    && grep -q 'application/manifest+json' /etc/nginx/conf.d/default.conf \
    && nginx -t
EXPOSE 80
