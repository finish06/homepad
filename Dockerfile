# --- build ---
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

# --- runtime ---
FROM nginx:1.27-alpine
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Fail the build if the webmanifest MIME fix (#18/#69) is missing from the conf
# that actually landed in the image, and reject an invalid config outright. On
# staging a stale `COPY nginx.conf` cache layer shipped the pre-fix conf despite
# fresh dist, so /manifest.webmanifest served application/octet-stream and PWA
# install stayed blocked. This guard turns that silent regression into a hard
# build failure; `nginx -t` additionally catches any config syntax error.
RUN grep -q 'application/manifest+json' /etc/nginx/conf.d/default.conf \
    && nginx -t
EXPOSE 80
