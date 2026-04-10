FROM node:20 AS builder

WORKDIR /app

ENV npm_config_proxy= \
    npm_config_https_proxy= \
    npm_config_noproxy= \
    HTTP_PROXY= \
    HTTPS_PROXY= \
    ALL_PROXY= \
    NO_PROXY= \
    http_proxy= \
    https_proxy= \
    all_proxy= \
    no_proxy=

# Copy root package files including the lock file
COPY package.json package-lock.json ./

# Copy workspace package.json files to ensure npm ci works correctly in monorepo
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install monorepo dependencies for build
RUN unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY npm_config_proxy npm_config_https_proxy npm_config_noproxy \
    && npm config delete proxy || true \
    && npm config delete https-proxy || true \
    && npm ci

COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/

RUN npm run build --workspace=@nexus-terminal/backend

FROM node:20-alpine

ARG ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine

ENV NODE_ENV=production \
    npm_config_proxy= \
    npm_config_https_proxy= \
    npm_config_noproxy= \
    HTTP_PROXY= \
    HTTPS_PROXY= \
    ALL_PROXY= \
    NO_PROXY= \
    http_proxy= \
    https_proxy= \
    all_proxy= \
    no_proxy=

WORKDIR /app

RUN ALPINE_VERSION="$(cut -d. -f1,2 /etc/alpine-release)" \
    && printf '%s\n' \
      "${ALPINE_MIRROR}/v${ALPINE_VERSION}/main" \
      "${ALPINE_MIRROR}/v${ALPINE_VERSION}/community" \
      > /etc/apk/repositories

RUN apk add --no-cache libstdc++

COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/src/locales ./dist/locales
COPY packages/backend/package.json ./package.json
RUN unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY npm_config_proxy npm_config_https_proxy npm_config_noproxy \
    && npm config delete proxy || true \
    && npm config delete https-proxy || true \
    && npm install --omit=dev --no-package-lock --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /root/.npm /tmp/* /root/.cache

EXPOSE 3001

CMD ["node", "dist/index.js"]

