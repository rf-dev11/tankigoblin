/**
 * CELENGAN - Backend Google Apps Script (Web App)
 *
 * Cara pasang singkat:
 * 1. Buat Google Sheet BARU -> Extensions -> Apps Script -> tempel seluruh file ini.
 * 2. Pilih fungsi "setup" -> Run (izinkan akses). Ini membuat semua sheet + trigger harian.
 * 3. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone -> salin URL /exec.
 * 4. Tempel URL itu ke baris "const API" di index.html.
 *
 * PIN disimpan di sheet "Config" (baris key = PIN, kolom value). Awalnya 1234, ubah langsung di sheet.
 * PIN harus berupa angka. Dicek di server pada setiap permintaan.
 */

const TZ = 'Asia/Jakarta';
const KEEP_MONTHS = 14; // transaksi yang dikirim ke aplikasi (saldo tetap dihitung dari semua)

const SHEETS = {
  Config:    ['key', 'value'],
  Dompet:    ['id', 'nama', 'tipe', 'rek', 'saldo', 'logo'],
  Kategori:  ['id', 'nama', 'tipe', 'ikon'],
  Transaksi: ['id', 'tanggal', 'tipe', 'bank', 'bank2', 'kategori', 'jumlah', 'catatan'],
  Anggaran:  ['id', 'kategori', 'jumlah'],
  Aset:      ['id', 'nama', 'nilai', 'grup', 'aktif'],
  Utang:     ['id', 'tipe', 'nama', 'jumlah', 'sisa', 'catatan'],
  Rutin:     ['id', 'nama', 'tipe', 'jumlah', 'hari', 'bank', 'kategori', 'aktif', 'terakhir']
};
// Kolom yang harus tetap teks (supaya tanggal/ID/nomor rekening tidak diubah Sheets)
const TEXT_COLS = {
  Config: ['value'], Dompet: ['id', 'rek'], Kategori: ['id'],
  Transaksi: ['id', 'tanggal', 'bank', 'bank2', 'kategori'],
  Anggaran: ['id', 'kategori'], Aset: ['id'], Utang: ['id'],
  Rutin: ['id', 'bank', 'kategori', 'terakhir']
};
const DEFAULT_CATS = [
  ['Makan & Minum', 'keluar', '🍔'], ['Transportasi', 'keluar', '🚌'], ['Belanja', 'keluar', '🛍️'],
  ['Tagihan', 'keluar', '🧾'], ['Hiburan', 'keluar', '🎬'], ['Keluarga', 'keluar', '👪'],
  ['Lainnya', 'keluar', '🏷️'], ['Gaji', 'masuk', '💼'], ['Bonus', 'masuk', '🎁'], ['Lainnya', 'masuk', '🏷️']
];

/* ====================== ENTRY POINTS ====================== */

function doGet() {
  return ContentService.createTextOutput('Celengan API OK');
}

function doPost(e) {
  let out;
  try {
    const d = JSON.parse(e.postData.contents);
    ensureInit_();
    const bad = auth_(d.pin);
    if (bad) {
      out = { err: bad, auth: 1 };
    } else {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        const r = handle_(d);
        runRutin_();
        out = Object.assign(state_(), { r: r === undefined ? null : r });
      } finally {
        lock.releaseLock();
      }
    }
  } catch (err) {
    out = { err: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Jalankan SEKALI dari editor: membuat sheet + trigger harian untuk transaksi rutin. */
function setup() {
  ensureInit_();
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'processRutin'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processRutin').timeBased().everyDays(1).atHour(1).inTimezone(TZ).create();
  Logger.log('Selesai. PIN awal: 1234 (ubah di sheet Config). Trigger harian untuk transaksi rutin sudah aktif.');
}

/** Dipanggil trigger harian (juga otomatis dicek setiap aplikasi dibuka). */
function processRutin() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { ensureInit_(); runRutin_(); } finally { lock.releaseLock(); }
}

/* ====================== AUTH ====================== */

function pin_() {
  const r = read_('Config').find(function (x) { return x.key === 'PIN'; });
  return r ? String(r.value).trim() : '';
}

function auth_(pin) {
  const cache = CacheService.getScriptCache();
  if (cache.get('lock')) return 'Terlalu banyak percobaan. Coba lagi 5 menit lagi.';
  const real = pin_();
  if (!real) return 'PIN belum diatur di sheet Config.';
  if (String(pin === undefined || pin === null ? '' : pin).trim() === real) {
    cache.remove('fails');
    return null;
  }
  const f = Number(cache.get('fails') || 0) + 1;
  if (f >= 5) { cache.put('lock', '1', 300); cache.remove('fails'); }
  else cache.put('fails', String(f), 600);
  Utilities.sleep(800);
  return 'PIN salah';
}

/* ====================== SHEET HELPERS ====================== */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  let s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    const h = SHEETS[name];
    (TEXT_COLS[name] || []).forEach(function (c) {
      s.getRange(1, h.indexOf(c) + 1, s.getMaxRows(), 1).setNumberFormat('@');
    });
    s.getRange(1, 1, 1, h.length).setValues([h]);
    s.setFrozenRows(1);
  }
  return s;
}

function ensureInit_() {
  const cache = CacheService.getScriptCache();
  if (!cache.get('init')) {
    Object.keys(SHEETS).forEach(sheet_);
    const cfg = sheet_('Config');
    if (!read_('Config').some(function (r) { return r.key === 'PIN'; })) {
      cfg.getRange(cfg.getLastRow() + 1, 1, 1, 2).setValues([['PIN', '1234']]);
    }
    cache.put('init', '1', 21600);
  }
  const P = PropertiesService.getScriptProperties();
  if (!P.getProperty('seeded')) {
    if (sheet_('Kategori').getLastRow() < 2) {
      DEFAULT_CATS.forEach(function (c) { put_('Kategori', { id: newId_(), nama: c[0], tipe: c[1], ikon: c[2] }); });
    }
    P.setProperty('seeded', '1');
  }
}

function read_(name) {
  const v = sheet_(name).getDataRange().getValues();
  const h = v[0], out = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === '') continue;
    const o = {};
    for (let j = 0; j < h.length; j++) {
      let x = v[i][j];
      if (x instanceof Date) x = Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
      if (h[j] === 'aktif') x = !(x === 0 || x === '0' || x === false || String(x).toUpperCase() === 'FALSE');
      o[h[j]] = x;
    }
    out.push(o);
  }
  return out;
}

function find_(name, id) {
  if (id === undefined || id === null || id === '') return null;
  const all = read_(name);
  for (let i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i];
  return null;
}

function put_(name, o) {
  const s = sheet_(name), v = s.getDataRange().getValues(), h = v[0];
  const row = h.map(function (k) {
    const x = o[k];
    if (x === undefined || x === null) return '';
    if (typeof x === 'boolean') return x ? 1 : 0;
    return x;
  });
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(o.id)) { s.getRange(i + 1, 1, 1, h.length).setValues([row]); return; }
  }
  s.appendRow(row);
}

function delWhere_(name, pred) {
  const s = sheet_(name), v = s.getDataRange().getValues(), h = v[0];
  for (let i = v.length - 1; i >= 1; i--) {
    const o = {};
    for (let j = 0; j < h.length; j++) o[h[j]] = v[i][j];
    if (pred(o)) s.deleteRow(i + 1);
  }
}

function del_(name, id) { delWhere_(name, function (o) { return String(o.id) === String(id); }); }

function newId_() { return 'i' + Utilities.getUuid().replace(/-/g, '').slice(0, 9); }

function num_(x) {
  const n = Number(x);
  if (!isFinite(n)) throw new Error('Angka tidak valid');
  return n;
}

function pad_(n) { return (n < 10 ? '0' : '') + n; }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function state_() {
  const cut = Utilities.formatDate(new Date(Date.now() - KEEP_MONTHS * 30 * 864e5), TZ, 'yyyy-MM-dd');
  return {
    banks: read_('Dompet'),
    cats: read_('Kategori'),
    trx: read_('Transaksi').filter(function (t) { return String(t.tanggal) >= cut; }),
    ang: read_('Anggaran'),
    aset: read_('Aset'),
    utang: read_('Utang'),
    rutin: read_('Rutin')
  };
}

/* ====================== ACTIONS ====================== */

function handle_(d) {
  switch (d.a) {
    case 'getAll': case 'login': return null;
    case 'addTrx': return addTrx_(d);
    case 'delTrx': {
      const t = find_('Transaksi', d.id);
      if (t) { applyTrx_(t, -1); del_('Transaksi', d.id); }
      return null;
    }
    case 'saveBank': return saveBank_(d);
    case 'delBank':
      del_('Dompet', d.id);
      read_('Rutin').filter(function (r) { return String(r.bank) === String(d.id); })
        .forEach(function (r) { r.aktif = false; put_('Rutin', r); });
      return null;
    case 'saveKat': return saveKat_(d);
    case 'delKat':
      del_('Kategori', d.id);
      delWhere_('Anggaran', function (o) { return String(o.kategori) === String(d.id); });
      read_('Rutin').filter(function (r) { return String(r.kategori) === String(d.id); })
        .forEach(function (r) { r.kategori = ''; put_('Rutin', r); });
      return null;
    case 'saveAng': return saveAng_(d);
    case 'delAng': del_('Anggaran', d.id); return null;
    case 'saveAset': return saveAset_(d);
    case 'toggleAset': {
      const a = find_('Aset', d.id);
      if (a) { a.aktif = !!d.aktif; put_('Aset', a); }
      return null;
    }
    case 'delAset': del_('Aset', d.id); return null;
    case 'saveUtang': return saveUtang_(d);
    case 'bayarUtang': {
      const u = find_('Utang', d.id), j = num_(d.jumlah);
      if (!u) throw new Error('Data utang tidak ditemukan');
      if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
      u.sisa = Math.max(0, Number(u.sisa) - j);
      put_('Utang', u);
      return null;
    }
    case 'delUtang': del_('Utang', d.id); return null;
    case 'saveRutin': return saveRutin_(d);
    case 'toggleRutin': {
      const r = find_('Rutin', d.id);
      if (r) {
        if (d.aktif && !r.aktif) r.terakhir = initLast_(Number(r.hari));
        r.aktif = !!d.aktif;
        put_('Rutin', r);
      }
      return null;
    }
    case 'delRutin': del_('Rutin', d.id); return null;
    default: throw new Error('Aksi tidak dikenal: ' + d.a);
  }
}

function adj_(id, delta) {
  const b = find_('Dompet', id);
  if (!b) return;
  b.saldo = Number(b.saldo) + delta;
  put_('Dompet', b);
}

function applyTrx_(t, sign) {
  const j = Number(t.jumlah) * sign;
  if (t.tipe === 'masuk') adj_(t.bank, j);
  else if (t.tipe === 'keluar') adj_(t.bank, -j);
  else if (t.tipe === 'transfer') { adj_(t.bank, -j); adj_(t.bank2, j); }
}

function addTrx_(d) {
  const tipe = d.tipe;
  if (['masuk', 'keluar', 'transfer'].indexOf(tipe) < 0) throw new Error('Jenis transaksi tidak valid');
  const j = num_(d.jumlah);
  if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
  if (!find_('Dompet', d.bank)) throw new Error('Dompet tidak ditemukan');
  if (tipe === 'transfer') {
    if (!find_('Dompet', d.bank2)) throw new Error('Dompet tujuan tidak ditemukan');
    if (String(d.bank) === String(d.bank2)) throw new Error('Dompet asal dan tujuan tidak boleh sama');
  }
  const tgl = String(d.tanggal || today_());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw new Error('Format tanggal tidak valid');
  const t = {
    id: newId_(), tanggal: tgl, tipe: tipe, bank: d.bank,
    bank2: tipe === 'transfer' ? d.bank2 : '',
    kategori: tipe === 'transfer' ? '' : (d.kategori || ''),
    jumlah: j, catatan: String(d.catatan || '')
  };
  put_('Transaksi', t);
  applyTrx_(t, 1);
  return t.id;
}

function saveBank_(d) {
  const nama = String(d.nama || '').trim();
  if (!nama) throw new Error('Nama dompet wajib diisi');
  const ex = d.id ? find_('Dompet', d.id) : null;
  const o = Object.assign({ id: newId_(), tipe: 'Bank', rek: '', logo: '' }, ex || {});
  o.nama = nama;
  o.tipe = String(d.tipe || o.tipe || 'Bank');
  o.rek = String(d.rek || '');
  o.saldo = num_(d.saldo);
  if (d.logo !== undefined) {
    if (String(d.logo).length > 45000) throw new Error('Logo terlalu besar');
    o.logo = d.logo;
  }
  put_('Dompet', o);
  return o.id;
}

function saveKat_(d) {
  const nama = String(d.nama || '').trim();
  if (!nama) throw new Error('Nama kategori wajib diisi');
  const ex = d.id ? find_('Kategori', d.id) : null;
  const tipe = ex ? ex.tipe : (d.tipe === 'masuk' ? 'masuk' : 'keluar');
  const o = { id: ex ? ex.id : newId_(), nama: nama, tipe: tipe, ikon: String(d.ikon || '').trim() };
  const dup = read_('Kategori').some(function (c) {
    return c.tipe === tipe && String(c.id) !== String(o.id) && String(c.nama).toLowerCase() === nama.toLowerCase();
  });
  if (dup) throw new Error('Nama kategori sudah ada');
  put_('Kategori', o);
  return o.id;
}

function saveAng_(d) {
  const j = num_(d.jumlah);
  if (!(j > 0)) throw new Error('Batas harus lebih dari 0');
  if (!find_('Kategori', d.kategori)) throw new Error('Kategori tidak ditemukan');
  const ex = read_('Anggaran').filter(function (a) { return String(a.kategori) === String(d.kategori); })[0];
  put_('Anggaran', { id: ex ? ex.id : newId_(), kategori: d.kategori, jumlah: j });
  return null;
}

function saveAset_(d) {
  const nama = String(d.nama || '').trim();
  if (!nama) throw new Error('Nama aset wajib diisi');
  const ex = d.id ? find_('Aset', d.id) : null;
  const o = Object.assign({ id: newId_(), aktif: true }, ex || {});
  o.nama = nama;
  o.nilai = num_(d.nilai);
  o.grup = String(d.grup || 'Lainnya').trim() || 'Lainnya';
  if (d.aktif !== undefined) o.aktif = !!d.aktif;
  put_('Aset', o);
  return o.id;
}

function saveUtang_(d) {
  const nama = String(d.nama || '').trim(), j = num_(d.jumlah);
  if (!nama || !(j > 0)) throw new Error('Isi nama dan jumlah');
  put_('Utang', {
    id: newId_(), tipe: d.tipe === 'beri' ? 'beri' : 'pinjam', nama: nama,
    jumlah: j, sisa: j, catatan: String(d.catatan || '')
  });
  return null;
}

/* ====================== TRANSAKSI RUTIN ====================== */

/** Bulan terakhir yang dianggap "sudah jalan" untuk rutin baru/diaktifkan lagi. */
function initLast_(hari) {
  const t = today_(), y = +t.slice(0, 4), m = +t.slice(5, 7), dNow = +t.slice(8);
  const dim = new Date(y, m, 0).getDate();
  const day = Math.min(hari, dim);
  if (dNow > day) return y + '-' + pad_(m);          // tanggal bulan ini sudah lewat -> mulai bulan depan
  return m === 1 ? (y - 1) + '-12' : y + '-' + pad_(m - 1);
}

function saveRutin_(d) {
  const nama = String(d.nama || '').trim();
  if (!nama) throw new Error('Nama wajib diisi');
  if (d.tipe !== 'masuk' && d.tipe !== 'keluar') throw new Error('Jenis harus pemasukan atau pengeluaran');
  const j = num_(d.jumlah);
  if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
  const hari = Math.round(num_(d.hari));
  if (hari < 1 || hari > 31) throw new Error('Tanggal harus 1 sampai 31');
  if (!find_('Dompet', d.bank)) throw new Error('Dompet tidak ditemukan');
  const ex = d.id ? find_('Rutin', d.id) : null;
  const aktif = d.aktif === undefined ? true : !!d.aktif;
  const o = {
    id: ex ? ex.id : newId_(), nama: nama, tipe: d.tipe, jumlah: j, hari: hari,
    bank: d.bank, kategori: d.kategori || '', aktif: aktif,
    terakhir: ex ? String(ex.terakhir || '') : initLast_(hari)
  };
  if (ex && !ex.aktif && aktif) o.terakhir = initLast_(hari);
  put_('Rutin', o);
  return o.id;
}

/** Tambahkan transaksi rutin yang jatuh tempo (tanpa duplikat, mengejar bulan yang terlewat). */
function runRutin_() {
  const t = today_(), y = +t.slice(0, 4), m = +t.slice(5, 7) - 1, dNow = +t.slice(8);
  read_('Rutin').forEach(function (r) {
    if (!r.aktif) return;
    if (!find_('Dompet', r.bank)) return;
    let last = String(r.terakhir || '');
    let cy, cm;
    if (last) {
      cy = +last.slice(0, 4); cm = +last.slice(5, 7); // zero-based bulan berikutnya = nilai 1-based bulan terakhir
      if (cm > 11) { cm = 0; cy++; }
    } else { cy = y; cm = m; }
    let n = 0, changed = false;
    while ((cy < y || (cy === y && cm <= m)) && n < 24) {
      const dim = new Date(cy, cm + 1, 0).getDate();
      const day = Math.min(Number(r.hari) || 1, dim);
      if (cy === y && cm === m && dNow < day) break;
      try {
        addTrx_({
          tipe: r.tipe, bank: r.bank, kategori: r.kategori, jumlah: r.jumlah,
          tanggal: cy + '-' + pad_(cm + 1) + '-' + pad_(day), catatan: 'Otomatis: ' + r.nama
        });
      } catch (e) { break; }
      last = cy + '-' + pad_(cm + 1);
      changed = true;
      cm++; if (cm > 11) { cm = 0; cy++; }
      n++;
    }
    if (changed) { r.terakhir = last; put_('Rutin', r); }
  });
}
