FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
# tzdata + TZ: build juga bisa mengeksekusi kode yang menghitung tanggal (mis. generasi
# halaman statis), jadi builder pun dikunci ke WIB agar hasilnya konsisten.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tzdata && addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Zona waktu operasional aplikasi adalah WIB. Alpine butuh paket `tzdata` agar TZ benar-benar
# berlaku; tanpa ini container berjalan di UTC dan batas bulan pada laporan bergeser 7 jam.
# Ini lapisan pertahanan kedua — perhitungan periode di lib/format.ts sudah dikunci ke WIB
# secara eksplisit dan tidak bergantung pada nilai TZ ini.
ENV TZ=Asia/Jakarta
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node server.js"]
