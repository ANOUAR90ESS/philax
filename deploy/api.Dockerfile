# syntax=docker/dockerfile:1
# Production image for the Philax API (modular monolith).
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @philax/api build
# Self-contained production dependency tree for the API package.
RUN pnpm --filter @philax/api deploy --prod --legacy /prod/api \
 && cp -r apps/api/dist /prod/api/dist \
 && mkdir -p /prod/api/database && cp -r database/migrations database/seeds /prod/api/database/

FROM node:22-alpine
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=4000 \
    MIGRATIONS_DIR=/app/database/migrations \
    SEEDS_DIR=/app/database/seeds
WORKDIR /app
COPY --from=build --chown=node:node /prod/api /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Run `node dist/ops.js migrate` (and `seed`) as a release step before starting.
CMD ["node", "dist/main.js"]
