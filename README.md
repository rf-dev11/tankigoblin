# Celengan (tankigoblin)

Aplikasi catatan keuangan pribadi berbasis web (PWA) dengan **Login Google** dan penyimpanan otomatis di **Google Sheet milik masing-masing pengguna**.

```text
Browser / HP (PWA) --Google OAuth (drive.file)--> Google Drive & Sheets API --> Google Sheet di Drive User
```

## Isi Repo

| File | Fungsi |
|---|---|
| `index.html` | Aplikasi utama (UI, layar Login Google, layar PIN, & logika fitur) |
| `sheets-api.js` | Engine Google OAuth, auto-create Google Sheet 10 tab di Drive user, & adapter baca/tulis |
| `tema.css` | Gaya tampilan (Neobrutalism, Minimalis, Kaca) dan 10 tema warna |
| `dompet.js` | Menu Dompet berbentuk kartu bertumpuk + opsi Gaya tampilan |
| `sw.js` | Service worker (cache aset statis untuk PWA) |
| `manifest.json`, `icon-192.png`, `icon-512.png` | Konfigurasi PWA |

---

## Cara Setup (Untuk Developer / Penjual, 1x Saja)

User/pembeli tidak perlu membuat Sheet atau deploy Apps Script lagi. Anda cukup menyiapkan **Google Cloud OAuth Client ID** sekali saja:

### 1. Buat Project di Google Cloud Console
1. Buka [console.cloud.google.com](https://console.cloud.google.com/) dan buat project baru (mis. **Celengan**).
2. Menu **APIs & Services → Library**, aktifkan dua API ini:
   - **Google Drive API**
   - **Google Sheets API**
3. Menu **APIs & Services → OAuth consent screen**:
   - Pilih **External** → isi App name (`Celengan`), User support email, dan Developer contact.
   - Pada bagian **Scopes**, tambahkan:
     - `https://www.googleapis.com/auth/drive.file`
     - `openid`, `email`, `profile`
   - *(Saat masih mode Testing, tambahkan email akun Google Anda di **Test users** untuk uji coba. Sebelum dijual ke publik/lebih dari 100 user, ajukan verifikasi ke **Production**).*
4. Menu **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: masukkan URL tempat aplikasi di-host, misalnya:
     - `https://rf-dev11.github.io` (untuk GitHub Pages)
     - `http://localhost:8080` atau `http://127.0.0.1:8080` (untuk testing lokal)
   - Salin **Client ID** (`xxxx.apps.googleusercontent.com`).

### 2. Pasang Client ID ke Aplikasi
Buka `sheets-api.js` dan ganti baris berikut:

```js
const DEFAULT_CLIENT_ID = 'GANTI_DENGAN_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

*(Saat testing pertama kali, Anda juga bisa langsung menempelkan Client ID lewat form pengaturan developer di halaman login.)*

### 3. Deploy ke GitHub Pages / Hosting
Push perubahan ke GitHub (`main`), lalu aktifkan **Settings → Pages** seperti biasa.

---

## Alur untuk Pembeli / User
1. Buka aplikasi → klik **Masuk dengan Google** → pilih akun Gmail → klik **Izinkan**.
2. Aplikasi otomatis mengecek Drive user:
   - **User baru:** otomatis dibuatkan Spreadsheet **Celengan - Catatan Keuangan** berisi 10 tab (`Config`, `Dompet`, `Kategori`, `Transaksi`, `Anggaran`, `Aset`, `Utang`, `Rutin`, `Target`, `Riwayat`) + kategori awal, lalu diminta membuat PIN 4–8 angka.
   - **User lama (pindah HP/browser):** aplikasi langsung menemukan Spreadsheet miliknya di Drive dan meminta PIN.
3. User dapat mengubah PIN kapan saja lewat **Akun → Pengaturan → Ubah PIN**, dan membuka Sheet miliknya lewat **Akun → Pengaturan → Google Sheet saya**.

---

## Catatan Rilis ke Google Play Store (`.aab` / `.apk`)
- **Format Play Store:** Google Play mewajibkan format **`.aab` (Android App Bundle)** untuk upload aplikasi baru (`.apk` hanya untuk install manual/testing).
- **Penting soal Login Google:** Google memblokir OAuth Login di dalam WebView Android biasa (`disallowed_useragent`).
- **Solusi termudah:** Bungkus PWA ini menjadi **TWA (Trusted Web Activity)** menggunakan [PWABuilder](https://www.pwabuilder.com/) atau `bubblewrap` setelah di-host di domain HTTPS. TWA menjalankan aplikasi melalui Chrome Android sehingga **Login Google + Auto-Create Sheet** tetap bekerja normal tanpa error WebView.
