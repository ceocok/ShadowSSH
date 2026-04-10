FROM node:20-alpine AS builder

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


# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package.json files to ensure npm ci works correctly in monorepo
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install monorepo dependencies for build
RUN unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY npm_config_proxy npm_config_https_proxy npm_config_noproxy \
    && npm config delete proxy || true \
    && npm config delete https-proxy || true \
    && npm ci


COPY packages/frontend/src ./packages/frontend/src
COPY packages/frontend/index.html ./packages/frontend/
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY packages/frontend/vite.config.ts ./packages/frontend/
COPY packages/frontend/public ./packages/frontend/public/

RUN npm run build --workspace=@nexus-terminal/frontend


FROM nginx:stable-alpine


RUN rm -rf /usr/share/nginx/html/*


COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html


COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf


EXPOSE 80


CMD ["nginx", "-g", "daemon off;"]
