# --- build ---
FROM node:20-alpine AS build
WORKDIR /src
# Lockfile-exact install only. The old `|| npm install` fallback silently
# re-resolved dependencies when the lockfile was missing/stale — a supply-chain
# hole (unpinned versions in a prod image) and a repeatability hole. If npm ci
# fails, the build SHOULD fail.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# #157: the build context has no .git, so vite.config.ts's `git rev-parse` always
# fell back to 'dev' and prod footers showed "homepad vN (dev)". CI knows the
# commit sha and passes it as --build-arg GIT_SHA=<short-sha>; promote it to an
# ENV so `vite build` reads process.env.GIT_SHA and bakes the real 7-char sha
# into __GIT_SHA__. Defaults to 'dev' for a context-only `docker build` with no arg.
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}
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
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
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
# version.json guard (release awareness): the built dist MUST contain the
# version probe the UI polls, and the conf MUST serve it no-store — otherwise
# deployed tabs can never learn a release shipped.
RUN grep -q 'types { }' /etc/nginx/conf.d/default.conf \
    && grep -q 'application/manifest+json' /etc/nginx/conf.d/default.conf \
    && grep -q 'location = /version.json' /etc/nginx/conf.d/default.conf \
    && test -s /usr/share/nginx/html/version.json \
    && nginx -t
EXPOSE 80
