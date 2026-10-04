FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY packages/ ./packages/
COPY apps/admin/ ./apps/admin/

RUN npm ci
RUN npm run build:packages
RUN npm run build --workspace=@platform/admin

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/admin/ ./apps/admin/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/admin/dist ./apps/admin/dist

EXPOSE 3001
CMD ["node", "apps/admin/dist/index.js"]
