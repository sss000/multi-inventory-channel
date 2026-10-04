FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npm ci
RUN npm run build:packages
RUN npm run build --workspace=@platform/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
