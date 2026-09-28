# Deployment LYDEV Pay (VPS + Docker + Caddy)

Runbook rilis production untuk `https://pay.lydev.id`. Ditulis dari deploy nyata
(commit → push → pull di VPS → rebuild container) supaya langkahnya tidak perlu ditebak lagi.

> **Penting — repo ini public.** Jangan menulis host/IP VPS, path SSH key, atau isi `.env`
> ke file ini. Nilai aslinya disimpan di `deploy/vps-access.local.md` (di-ignore git,
> lihat `.gitignore` → `deploy/*.local.md`). File itu hanya ada di laptop.

---

## 0. Ringkas alur

```text
laptop : git commit  ->  git push origin main
VPS    : git pull origin main
         docker compose -f docker-compose.prod.yml build app
         docker compose -f docker-compose.prod.yml up -d
verifikasi: curl -fsS https://pay.lydev.id/api/health
```

Deploy normal hanya menyentuh tahap ini. Migrasi database hanya bila ada migration baru (bagian 4).

---

## 1. Topologi production

```text
Internet -> Cloudflare (proxy ON) -> VPS :443
                                     |
                                     v
                    Caddy bersama milik VPS (network Docker = CADDY_NETWORK)
                                     |  reverse_proxy lydev-pay-app:3000
                                     v
                    lydev-pay-app  (Nitro/Node, listen :3000, TIDAK di-publish ke host)
                                     |
                                     v
                    lydev-pay-postgres-1  (PostgreSQL 17, network internal, tanpa port ke host)
```

Poin penting:

- **Caddy dipakai bersama** banyak situs di VPS. LYDEV Pay **tidak** memakai port 80/443 dan
  **tidak** menyalakan Caddy sendiri. Aplikasi hanya mendengarkan `:3000` di dalam Docker.
- Network Caddy: nilai `CADDY_NETWORK` di `.env` (cek dengan `docker network ls`; nilai
  konkretnya ada di `deploy/vps-access.local.md`). Service `app` join network itu dengan alias
  `lydev-pay-app`, itulah alamat yang di-proxy Caddy.
- Lokasi di VPS:
  - Repo: `/opt/lydev-pay`
  - Env production: `/opt/lydev-pay/.env` (tidak masuk git)
  - Compose: `/opt/lydev-pay/docker-compose.prod.yml`
  - Caddyfile Caddy bersama: lihat `deploy/vps-access.local.md` (jangan edit Caddyfile lewat repo ini)
- Container LYDEV Pay:
  - `lydev-pay-app` (image `lydev-pay-app`)
  - `lydev-pay-postgres-1` (image `postgres:17-alpine`)

---

## 2. Prasyarat

- Akses SSH **root** ke VPS (host + path key ada di `deploy/vps-access.local.md`).
- Remote git laptop sudah terautentikasi ke GitHub (`origin` = repo ini).
- Di VPS sudah tersedia Docker + plugin `docker compose`, dan Caddy sudah berjalan.

Masuk ke VPS:

```bash
ssh -i <PATH_SSH_KEY> root@<VPS_HOST>
```

Cek cepat kondisi sekarang:

```bash
cd /opt/lydev-pay
git log --oneline -1
docker compose -f docker-compose.prod.yml ps
```

---

## 3. Deploy perubahan kode (alur normal)

### 3.1 Di laptop — validasi + publish

```bash
npm run typecheck
npm test
npm run build

git add -A
git commit -m "fix(scope): ..."      # pesan konvensional, lihat riwayat
git push origin main
```

Gunakan repo GitHub sebagai sumber kebenaran: VPS selalu `git pull`, bukan dikirim
manual lewat scp/tar. Ini menjaga hasil deploy = commit yang ada di GitHub.

### 3.2 Di VPS — pull + rebuild

```bash
cd /opt/lydev-pay
git pull origin main

docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d
```

Catatan:

- Build **wajib dijalankan di dalam Docker di VPS** (perintah di atas). Jangan menyalin folder
  `.output` hasil build Windows/macOS: `argon2` adalah native module dan arsitekturnya beda.
- `up -d` akan me-recreate container `app` karena image-nya berubah. Downtime hanya hitungan detik.
- Kalau ragu, rebuild service lain juga bisa: `... build` tanpa argumen (tapi `app` cukup untuk deploy kode).

---

## 4. Migrasi database (hanya bila ada migration baru)

Dijalankan **hanya jika** ada perubahan pada `prisma/schema.prisma` + file migration baru.

```bash
cd /opt/lydev-pay
git pull origin main

# jalankan prisma migrate deploy lewat profile "tools"
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate

docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d
```

- `migrate` menjalankan `npx prisma migrate deploy`.
- **Jangan** memakai `prisma db push` di production.
- Perubahan kode/UI tanpa migration: lewati bagian ini.

---

## 5. Verifikasi setelah deploy

```bash
# container sehat?
docker ps --filter name=lydev-pay --format "{{.Names}} | {{.Status}}"

# log aplikasi (harus "Listening on: http://localhost:3000/")
docker logs --tail 30 lydev-pay-app

# health publik (lewat Cloudflare -> Caddy -> app)
curl -fsS -m 15 https://pay.lydev.id/api/health
# -> {"status":"ok","service":"lydev-pay"}
```

Pastikan juga commit yang jalan sudah benar:

```bash
cd /opt/lydev-pay && git log --oneline -1
```

Uji manual singkat di browser: buka `https://pay.lydev.id/login`, lanjut ke dashboard,
lalu satu halaman checkout `/pay/<orderId>`.

---

## 6. Rollback

Balikkan ke commit sebelumnya lalu rebuild:

```bash
cd /opt/lydev-pay
git log --oneline -10                 # cari commit target
git reset --hard <COMMIT_SEBELUMNYA>

docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d
```

Kalau rollback menyertakan migration yang sudah terlanjur jalan, siapkan migration balik
(revert) secara terpisah — `prisma migrate deploy` tidak otomatis membalik schema.

Catatan: `git reset --hard` di VPS aman karena repo di sana tidak dipakai untuk mengedit
(master editing tetap di laptop).

---

## 7. Konfigurasi Caddy (bila perlu ubah domain/blok)

Blok situs LYDEV Pay ditempelkan ke Caddyfile Caddy bersama, ditandai penanda:

```caddyfile
# >>> pay.lydev.id (dikelola manual) >>>
pay.lydev.id {
	encode zstd gzip
	reverse_proxy lydev-pay-app:3000 {
		# Cloudflare proxy ON: biarkan header CF-Connecting-IP dari Cloudflare
		# (set TRUSTED_PROXY_HEADER=cf-connecting-ip). Jangan pakai {remote_host}.
	}
	...
}
# <<< pay.lydev.id <<<
```

Caddyfile itu di-bind-mount ke `/etc/caddy/Caddyfile` di container Caddy bersama.
Setelah mengubah file, reload Caddy (jangan `restart`/nyalakan Caddy kedua):

```bash
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile
```

Backup dulu sebelum mengedit (mis. `Caddyfile.bak.<tanggal>`).

---

## 8. Operasional & pemecahan masalah

| Gejala | Cek |
| --- | --- |
| `502` dari Caddy | `docker ps` (app hidup?), `docker logs lydev-pay-app`, pastikan app join network `CADDY_NETWORK` |
| Container `unhealthy` | `docker logs lydev-pay-app`; healthcheck hit `/api/health` dari dalam container |
| App gagal start | env kurang/ salah di `/opt/lydev-pay/.env`; schema env menolak `APP_URL` non-https, `SUMOPOD_API_KEY` kosong, atau `SUMOPOD_WEBHOOK_SECRET` bukan `whsec_...` |
| Perubahan tidak muncul | pastikan `git log --oneline -1` di VPS = commit terbaru, dan `build app` benar-benar selesai lalu `up -d` |
| Halaman login di-rate-limit terus | `TRUSTED_PROXY_HEADER` tidak cocok dengan proxy; di belakang Cloudflare pakai `cf-connecting-ip`, jangan `x-real-ip` (nilainya IP edge Cloudflare sehingga semua klien satu bucket) |
| Disk penuh | `docker system df` lalu `docker image prune -f` (jangan hapus volume `lydev_pay_data`) |

Perintah berguna:

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker stats --no-stream
docker volume ls | grep lydev
```

---

## 9. Yang tidak boleh dilakukan

- Jangan menambahkan `ports:` pada service `postgres` — DB sengaja hanya di network `internal`.
- Jangan menyalakan Caddy kedua; pakai Caddy bersama yang sudah ada.
- Jangan menyalin `.output` lintas OS (native `argon2`).
- Jangan memakai `prisma db push` di production.
- Jangan commit `.env` atau `deploy/vps-access.local.md`.
- Jangan menjalankan `docker compose ... down -v` — `-v` menghapus volume data Postgres.

---

## 10. Deploy pertama kali (referensi, sudah pernah dilakukan)

1. Siapkan `.env` di `/opt/lydev-pay` dari `deploy/.env.prod.example` (wajib: `APP_URL=https://pay.lydev.id`,
   `NODE_ENV=production`, `TRUSTED_PROXY_HEADER=cf-connecting-ip`, `SUMOPOD_WEBHOOK_SECRET=whsec_...`).
2. Samakan `CADDY_NETWORK` dengan network Caddy (`docker network ls`; nilai konkret ada di `deploy/vps-access.local.md`).
3. Tambahkan blok `deploy/Caddyfile.pay.lydev.id` ke Caddyfile Caddy bersama, lalu reload Caddy.
4. Migrasi + nyalakan:

   ```bash
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
   docker compose -f docker-compose.prod.yml up -d
   ```

5. Set webhook Sumopod ke `https://pay.lydev.id/api/webhooks/sumopod`.
