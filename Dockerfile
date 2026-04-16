FROM node:24-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM deps AS builder

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS prod

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
