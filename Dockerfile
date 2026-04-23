# syntax=docker/dockerfile:1.7

# ── Stage 1: build + gate ────────────────────────────────────────────────
# Install all deps (including dev), generate the Prisma client, lint, and
# run the DB-free unit suite (~71 tests, seconds). Failing the gate fails
# the build — no silently-shipping broken images to reviewers.
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ vips-dev openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY public ./public
COPY eslint.config.js tsconfig.json ./

# Build gate — fast feedback for hackathon reviewers
RUN npm run lint
RUN npm run test:unit

# Prune dev deps so the runtime stage copies a lean node_modules
RUN npm prune --omit=dev


# ── Stage 2: runtime ─────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl vips wget

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/uploads/thumbnails

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
