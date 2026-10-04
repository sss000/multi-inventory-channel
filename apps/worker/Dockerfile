FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN npm ci
RUN npm run build:packages
RUN npm run build --workspace=@platform/worker

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

CMD ["node", "apps/worker/dist/index.js"]
