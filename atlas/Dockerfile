# --- Build stage -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Prune dev dependencies for the runtime image
RUN pnpm prune --prod

# --- Runtime stage ---------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    ATLAS_DB_PATH=/data/atlas.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

VOLUME ["/data"]

ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["--help"]
