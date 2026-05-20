# Panduan Deploy WINS Timbangan ke Render.com

Aplikasi akan online 24/7 di URL seperti `https://wins-timbangan.onrender.com`, gratis.

## Persiapan (sekali saja)

### 1. Akun yang dibutuhkan
- [GitHub](https://github.com/signup) — untuk simpan kode (gratis)
- [Render](https://render.com/register) — untuk hosting (gratis, sign-up via GitHub paling cepat)

### 2. Install Git di Mac (jika belum)
```bash
git --version
```
Kalau muncul "command not found", install dengan:
```bash
brew install git
```

### 3. Setup identitas Git
```bash
git config --global user.name "Nama Anda"
git config --global user.email "email@anda.com"
```

## Langkah Deploy (5–10 menit)

### Tahap 1 — Upload kode ke GitHub

```bash
cd /Users/ariestotopayung/wins-timbangan

# Inisialisasi git
git init
git add .
git commit -m "Initial commit WINS Timbangan"

# Buat repository di github.com (klik tombol "New repository", beri nama "wins-timbangan", JANGAN centang "Initialize with README")
# Lalu copy URL repo, contoh: https://github.com/USERNAME/wins-timbangan.git

git remote add origin https://github.com/USERNAME/wins-timbangan.git
git branch -M main
git push -u origin main
```

GitHub mungkin minta autentikasi. Pakai **Personal Access Token** (Settings → Developer settings → Personal access tokens → Generate new token, beri permission `repo`).

### Tahap 2 — Deploy ke Render

1. Buka [dashboard.render.com](https://dashboard.render.com)
2. Klik **New +** → **Blueprint**
3. Connect ke GitHub, pilih repo `wins-timbangan`
4. Render akan otomatis baca `render.yaml` dan setup:
   - Web service (backend + frontend gabung)
   - Persistent disk 1 GB untuk database
   - Environment variables otomatis (termasuk JWT_SECRET auto-generate)
5. Klik **Apply** → tunggu **5–10 menit** untuk build pertama

### Tahap 3 — Akses aplikasi

Setelah build selesai, dapat URL: `https://wins-timbangan-XXXX.onrender.com`

**Login dengan akun default:**
- admin / admin123
- manajer / manajer123
- operator / operator123

**⚠️ PENTING: Segera ganti password admin lewat menu Pengguna!**

### Tahap 4 — Import data Excel (opsional)

Kalau Anda perlu import data yang sudah ada di laptop, ada 2 cara:

**Cara A — Lewat aplikasi (recommended):**
1. Login sebagai admin
2. Menu **Input Massal** → paste data dari Excel
3. Klik **Simpan Semua**

**Cara B — Lewat Render Shell (advanced):**
1. Buka dashboard Render → klik service → tab **Shell**
2. Upload file Excel via SCP atau Github
3. Jalankan: `cd backend && node db/import_excel.js /path/to/file.xlsx`

## Update Aplikasi Setelah Deploy

Kalau ada perubahan kode:

```bash
cd /Users/ariestotopayung/wins-timbangan
git add .
git commit -m "Update fitur xxx"
git push
```

Render otomatis re-deploy dalam 2–5 menit.

## Karakter Free Tier Render

✅ **Yang Anda dapat:**
- 750 jam/bulan (cukup 24/7 untuk 1 service)
- HTTPS otomatis (URL aman)
- Persistent disk 1 GB untuk database SQLite
- Custom domain (opsional, gratis)

⚠️ **Batasan:**
- Service "sleep" setelah **15 menit tidak ada traffic** → request pertama lambat (~30 detik wake up). Setelah itu cepat normal.
- Build time terbatas untuk plan free
- 100 GB bandwidth/bulan

💡 **Tips agar tidak sleep:**
- Pakai [UptimeRobot](https://uptimerobot.com) (gratis) untuk ping `/api/health` setiap 5 menit → service stay awake

## Custom Domain (opsional)

Mau pakai domain sendiri seperti `timbangan.winssawit.com`?

1. Beli domain di Niagahoster/Domainesia/Rumahweb (~Rp 100rb/tahun)
2. Di dashboard Render → service → **Settings** → **Custom Domain**
3. Tambah `timbangan.winssawit.com`
4. Set DNS CNAME di domain registrar mengarah ke Render URL
5. Render auto generate SSL/HTTPS

## Backup Database

**Wajib backup rutin!** Database SQLite di Render bisa hilang jika service dihapus.

**Cara backup:**
1. Buka **Render Shell**
2. Run: `cat /data/wins_timbangan.db | base64 > /tmp/backup.txt`
3. Copy isi `/tmp/backup.txt` ke local
4. Decode di Mac: `base64 -d < backup.txt > wins_timbangan.db`

Atau pakai service backup berkala (S3, Google Drive) — saya bisa bantu setup nanti.

## Troubleshooting

**Build gagal di Render:**
- Cek tab **Logs**, biasanya karena dependency error
- Pastikan `engines.node` di `package.json` versi 20+

**Lupa password admin:**
- Buka Render Shell
- Run: `node -e "const db=require('./backend/db/database'); const b=require('bcryptjs'); db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(b.hashSync('NewPass123',10),'admin'); console.log('Password reset!')"`

**Service offline / "Application failed to respond":**
- Cek logs di dashboard Render
- Restart service via tombol **Manual Deploy** → **Deploy latest commit**

## Estimasi Biaya

| Skenario | Render Plan | Biaya |
|---|---|---|
| Internal team kecil, ada sleep | **Free** | **Rp 0** |
| Produksi aktif tanpa sleep | Starter | $7/bulan (~Rp 110rb) |
| Traffic tinggi, banyak user | Standard | $25/bulan (~Rp 390rb) |

Untuk PT WINS Sawit (asumsi <50 user aktif), **Free tier sudah cukup**.

---

## Butuh Bantuan?

Kalau stuck di salah satu tahap, screenshot error dan tanya saya — saya bantu fix.
