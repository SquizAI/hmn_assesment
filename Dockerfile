FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/data ./src/data
COPY --from=builder /app/src/lib/types.ts ./src/lib/types.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/assessments ./assessments

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npx", "tsx", "server/index.ts"]
