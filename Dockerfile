# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM deps AS build
WORKDIR /app
# prisma.config.ts membaca DATABASE_URL bahkan saat generate; nilai ini tidak dipakai untuk koneksi.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Tidak ada Chrome di image ini; ekstraksi QR memakai payload QRIS dari HTML provider.
ENV QR_BROWSER_ENABLED=false
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
