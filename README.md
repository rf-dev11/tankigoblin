# Celengan (tankigoblin)

Aplikasi catatan keuangan pribadi berbasis web (PWA), terkunci PIN.
Tampilan di-host di **GitHub Pages**, data disimpan di **Google Sheet** lewat **Google Apps Script (GAS)**.

```
HP / Browser (PWA di GitHub Pages)  --POST-->  Apps Script Web App (/exec)  -->  Google Sheet
```

## Isi repo

| File | Fungsi |
|---|---|
| `index.html` | Aplikasi utama (UI + logika) |
| `tema.css` | Gaya tampilan (kartu bertepi tebal) dan warna tema |
| `dompet.js` | Menu Dompet berbentuk kartu bertumpuk |
| `sw.js` | Service worker (cache agar bisa dibuka cepat/offline) |
| `manifest.json`, `icon-192.png`, `icon-512.png` | Agar bisa dipasang seperti aplikasi |

`Code.gs` (backend) berjalan di Apps Script, bukan di GitHub Pages. Simpan salinannya di komputer.

## Prasyarat

- Akun Google dan akun GitHub
- Git di komputer (atau pakai upload lewat web GitHub, lihat langkah 3)

## 1. Siapkan Google Sheet dan Apps Script

1. Buka [sheets.google.com](https://sheets.google.com), buat spreadsheet baru, misalnya bernama **Celengan**.
2. Menu **Extensions → Apps Script**.
3. Hapus kode bawaan, lalu tempel seluruh isi `Code.gs`.
4. Atur **PIN** di `Code.gs` (cari bagian PIN di atas file). Jangan commit `Code.gs` berisi PIN ke repo publik.
5. Pilih fungsi setup di `Code.gs` (jika ada), klik **Run**, lalu izinkan akses.
   Jika muncul "Google hasn't verified this app": **Advanced → Go to (nama project) → Allow**. Ini normal untuk script milik sendiri.
6. Jika `Code.gs` memakai trigger harian (transaksi otomatis dan riwayat nilai bersih), buat lewat ikon jam **Triggers → Add Trigger**, pilih fungsi hariannya, **Time-driven → Day timer**.
7. Klik **Deploy → New deployment**, ikon roda gigi → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Klik **Deploy**, lalu salin URL yang berakhiran **`/exec`**.

## 2. Sambungkan aplikasi ke Apps Script

Di `index.html`, ganti URL pada baris ini dengan URL `/exec` milikmu:

```js
const API='https://script.google.com/macros/s/XXXXXXXX/exec';
```

Pakai URL `/exec`, bukan `/dev`.

## 3. Push ke GitHub

**Lewat Git:**

```bash
git init
git add .
git commit -m "Celengan pertama"
git branch -M main
git remote add origin https://github.com/rf-dev11/tankigoblin.git
git push -u origin main
```

GitHub tidak menerima password akun saat push. Pakai Personal Access Token, `gh auth login`, atau GitHub Desktop.

**Tanpa Git:** buka repo di github.com, **Add file → Upload files**, seret semua file, lalu **Commit changes**.

## 4. Aktifkan GitHub Pages

1. Di repo: **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, folder `/ (root)`, klik **Save**.
4. Tunggu 1 sampai 2 menit. Alamatnya:

```
https://rf-dev11.github.io/tankigoblin/
```

## 5. Pasang menu Dompet

1. Pastikan `tema.css` dan `dompet.js` ada di repo, satu folder dengan `index.html`.
2. Di `index.html`, tambahkan satu baris sebelum `</body>`, setelah `</script>` terakhir:

```html
<script src="dompet.js"></script>
```

3. Di `sw.js`, naikkan versi/nama cache (misalnya `v1` menjadi `v2`) dan tambahkan `dompet.js` ke daftar file yang di-cache jika ada daftarnya.

Urutan dan warna kartu Dompet tersimpan di perangkat tempat kamu mengaturnya (localStorage), tidak ikut ke Sheet.

## 6. Pasang di HP

- **Android (Chrome):** menu ⋮ → **Install app** atau **Add to Home screen**.
- **iPhone (Safari):** tombol Share → **Add to Home Screen**.

Jika memakai subfolder Pages, pastikan `start_url` dan `scope` di `manifest.json` relatif (`./`) atau diawali `/tankigoblin/`.

## 7. Cara update

- **Ubah tampilan atau logika:** edit file, `git add . && git commit -m "update" && git push`, lalu naikkan versi cache di `sw.js`.
- **Ubah `Code.gs`:** tempel kode baru, lalu **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**. URL `/exec` tetap sama.

## Masalah umum

| Gejala | Penyebab dan solusi |
|---|---|
| "Gagal memuat data" | URL `API` salah, atau akses Web App bukan **Anyone**. Deploy ulang dan cek URL `/exec`. |
| "Code.gs … masih versi lama" | Deploy **New version** setelah menempel `Code.gs` terbaru. |
| Tampilan tidak berubah setelah push | Cache service worker. Naikkan versi cache di `sw.js`, lalu tutup dan buka lagi aplikasinya (atau hapus data situs). |
| Pages menampilkan 404 | Cek nama file `index.html` (huruf kecil) dan pengaturan Pages (`main`, root). Tunggu beberapa menit. |
| PIN selalu salah | Cek PIN di `Code.gs`. Setelah mengubahnya, deploy New version. |
| Menu Dompet tidak muncul | Tag `<script src="dompet.js">` belum ditambahkan, atau berada sebelum script utama. |

## Keamanan

- Aplikasi hanya dilindungi PIN. Pakai PIN yang tidak mudah ditebak.
- Repo publik menampilkan URL Web App. Jangan menaruh PIN atau data pribadi di repo.
- Salin spreadsheet secara berkala sebagai cadangan (**File → Make a copy**).
