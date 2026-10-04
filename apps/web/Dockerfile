FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

RUN npm ci
RUN npm run build:packages
RUN npm run build --workspace=@platform/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/web/dist ./apps/web/dist

EXPOSE 3000
CMD ["node", "apps/web/dist/index.js"]
