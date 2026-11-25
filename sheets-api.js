/**
 * CELENGAN - Google Drive & Sheets API Adapter (Client-Side SaaS Engine)
 * Menggantikan Code.gs agar setiap user bisa login dengan Google
 * dan otomatis dibuatkan Google Sheet di Drive miliknya sendiri.
 *
 * Scope aman: https://www.googleapis.com/auth/drive.file
 * (Hanya mengakses file Spreadsheet yang dibuat oleh aplikasi ini.)
 */
(function (global) {
  'use strict';

  // Ganti dengan OAuth 2.0 Client ID (Web application) dari Google Cloud Console Anda.
  const DEFAULT_CLIENT_ID = '998367672026-41821kqb669flr7g4kvqig10o461he4p.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
  const DRIVE_APP_KEY = 'celenganApp';
  const DRIVE_APP_VAL = 'v1';
  const SHEET_TITLE = 'Celengan - Catatan Keuangan';
  const KEEP_MONTHS = 14;

  const SHEETS = {
    Config:    ['key', 'value'],
    Dompet:    ['id', 'nama', 'tipe', 'rek', 'saldo', 'logo'],
    Kategori:  ['id', 'nama', 'tipe', 'ikon'],
    Transaksi: ['id', 'tanggal', 'tipe', 'bank', 'bank2', 'kategori', 'jumlah', 'catatan', 'jam', 'biaya'],
    Anggaran:  ['id', 'kategori', 'jumlah'],
    Aset:      ['id', 'nama', 'nilai', 'grup', 'aktif'],
    Utang:     ['id', 'tipe', 'nama', 'jumlah', 'sisa', 'catatan', 'tempo'],
    Rutin:     ['id', 'nama', 'tipe', 'jumlah', 'hari', 'bank', 'kategori', 'aktif', 'terakhir', 'bank2'],
    Target:    ['id', 'nama', 'jumlah', 'sumber', 'tenggat'],
    Riwayat:   ['id', 'nilai']
  };

  const TEXT_COLS = {
    Config: ['value'],
    Dompet: ['id', 'rek'],
    Kategori: ['id'],
    Transaksi: ['id', 'tanggal', 'bank', 'bank2', 'kategori', 'jam'],
    Anggaran: ['id', 'kategori'],
    Aset: ['id'],
    Utang: ['id', 'tempo'],
    Target: ['id', 'sumber', 'tenggat'],
    Riwayat: ['id'],
    Rutin: ['id', 'bank', 'kategori', 'terakhir', 'bank2']
  };

  const DEFAULT_CATS = [
    ['Makan & Minum', 'keluar', '🍔'],
    ['Transportasi', 'keluar', '🚌'],
    ['Belanja', 'keluar', '🛍️'],
    ['Tagihan', 'keluar', '🧾'],
    ['Hiburan', 'keluar', '🎬'],
    ['Keluarga', 'keluar', '👪'],
    ['Lainnya', 'keluar', '🏷️'],
    ['Gaji', 'masuk', '💼'],
    ['Bonus', 'masuk', '🎁'],
    ['Lainnya', 'masuk', '🏷️']
  ];

  /* ====================== STORAGE & AUTH STATE ====================== */

  const LS = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let _token = '';
  let _tokenExp = 0;
  let _user = LS.get('celengan_user', null); // { email, name, picture, sheetId }
  let _tables = null;   // { SheetName: [ { ...rowObj, _row: 2 }, ... ] }
  let _sheetIds = {};   // { SheetName: numericSheetId }
  let _loaded = false;
  let _mutex = Promise.resolve();

  // Muat token sesi sementara jika belum expired
  try {
    const st = JSON.parse(sessionStorage.getItem('celengan_gtok') || 'null');
    if (st && st.token && st.exp > Date.now() + 30000) {
      _token = st.token;
      _tokenExp = st.exp;
    }
  } catch (e) {}

  function saveToken(tok, expiresInSec) {
    _token = tok || '';
    _tokenExp = tok ? Date.now() + Math.max(60, (Number(expiresInSec) || 3600) - 60) * 1000 : 0;
    try {
      if (_token) sessionStorage.setItem('celengan_gtok', JSON.stringify({ token: _token, exp: _tokenExp }));
      else sessionStorage.removeItem('celengan_gtok');
    } catch (e) {}
  }

  function getClientId() {
    const saved = LS.get('celengan_client_id', '');
    return (saved || DEFAULT_CLIENT_ID).trim();
  }

  function setClientId(id) {
    const clean = String(id || '').trim();
    if (clean) LS.set('celengan_client_id', clean);
    else LS.del('celengan_client_id');
  }

  function isClientConfigured() {
    const cid = getClientId();
    return !!cid && !cid.startsWith('GANTI_DENGAN_');
  }

  function hasToken() {
    return !!_token && Date.now() < _tokenExp;
  }

  function waitGis(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (global.google && global.google.accounts && global.google.accounts.oauth2) return resolve();
      const start = Date.now();
      const t = setInterval(() => {
        if (global.google && global.google.accounts && global.google.accounts.oauth2) {
          clearInterval(t);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          reject(new Error('Google Identity Services gagal dimuat. Periksa koneksi internet Anda.'));
        }
      }, 100);
    });
  }

  async function requestToken(promptMode = '') {
    if (!isClientConfigured()) {
      throw new Error('Google Client ID belum diatur.');
    }
    await waitGis();
    return new Promise((resolve, reject) => {
      let settled = false;
      const client = global.google.accounts.oauth2.initTokenClient({
        client_id: getClientId(),
        scope: SCOPES,
        hint: _user && _user.email ? _user.email : undefined,
        callback: (resp) => {
          if (settled) return;
          settled = true;
          if (resp.error) {
            const err = new Error(resp.error_description || resp.error || 'Login Google dibatalkan');
            err.oauth = true;
            return reject(err);
          }
          saveToken(resp.access_token, resp.expires_in);
          resolve(_token);
        },
        error_callback: (err) => {
          if (settled) return;
          settled = true;
          const e = new Error((err && (err.message || err.type)) || 'Popup login Google diblokir atau ditutup');
          e.oauth = true;
          reject(e);
        }
      });
      client.requestAccessToken({ prompt: promptMode });
    });
  }

  async function ensureToken(interactive = true) {
    if (hasToken()) return _token;
    if (!interactive) throw Object.assign(new Error('Sesi Google habis, silakan masuk ulang.'), { auth: true, oauth: true });
    return requestToken(_user ? '' : 'select_account');
  }

  /* ====================== HTTP HELPERS ====================== */

  async function gfetch(url, opts = {}, retryAuth = true) {
    const tok = await ensureToken(true);
    const headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts = Object.assign({}, opts, { body: JSON.stringify(opts.body) });
    }
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401 && retryAuth) {
      saveToken('', 0);
      await requestToken('');
      return gfetch(url, opts, false);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
    if (!res.ok) {
      const msg = (json && json.error && json.error.message) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      if (res.status === 401 || res.status === 403) err.oauth = true;
      throw err;
    }
    return json;
  }

  /* ====================== DRIVE & SHEET PROVISIONING ====================== */

  async function fetchUserInfo() {
    return gfetch('https://www.googleapis.com/oauth2/v3/userinfo');
  }

  async function findExistingSheet(cachedId) {
    if (cachedId) {
      try {
        const meta = await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cachedId)}?fields=id,name,trashed`);
        if (meta && meta.id && !meta.trashed) return meta.id;
      } catch (e) {
        // File tidak ditemukan atau terhapus; cari ulang lewat query appProperties
      }
    }
    const q = `appProperties has { key='${DRIVE_APP_KEY}' and value='${DRIVE_APP_VAL}' } and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const list = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=modifiedTime desc&pageSize=5&spaces=drive`);
    return list && list.files && list.files.length ? list.files[0].id : '';
  }

  function colLetter(n) {
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  async function createSpreadsheetForUser(initialPin = '1234', onProgress) {
    if (onProgress) onProgress('Membuat Google Sheet di Drive Anda…');

    // 1. Buat file Spreadsheet kosong di Drive dengan tag appProperties agar unik & terlacak lintas perangkat
    const created = await gfetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      body: {
        name: SHEET_TITLE,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        appProperties: { [DRIVE_APP_KEY]: DRIVE_APP_VAL }
      }
    });
    const spreadsheetId = created.id;

    try {
      // 2. Ambil sheetId bawaan ("Sheet1") untuk dihapus setelah 10 tab dibuat
      const meta0 = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`);
      const defaultSheetId = meta0.sheets[0].properties.sheetId;

      const sheetNames = Object.keys(SHEETS);
      const reqs = [];

      // Tambahkan 10 tab Celengan
      sheetNames.forEach((name, idx) => {
        reqs.push({
          addSheet: {
            properties: {
              sheetId: 100 + idx,
              title: name,
              index: idx,
              gridProperties: { rowCount: 1000, columnCount: Math.max(10, SHEETS[name].length), frozenRowCount: 1 }
            }
          }
        });
      });
      // Hapus tab default
      reqs.push({ deleteSheet: { sheetId: defaultSheetId } });

      // Format kolom teks agar tanggal, jam, ID, & no. rekening tidak diubah otomatis oleh Sheets
      sheetNames.forEach((name, idx) => {
        const cols = SHEETS[name];
        (TEXT_COLS[name] || []).forEach((colName) => {
          const ci = cols.indexOf(colName);
          if (ci >= 0) {
            reqs.push({
              repeatCell: {
                range: {
                  sheetId: 100 + idx,
                  startRowIndex: 0,
                  endRowIndex: 1000,
                  startColumnIndex: ci,
                  endColumnIndex: ci + 1
                },
                cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
                fields: 'userEnteredFormat.numberFormat'
              }
            });
          }
        });
      });

      if (onProgress) onProgress('Menyiapkan struktur tabel & kategori…');

      await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: { title: SHEET_TITLE, timeZone: 'Asia/Jakarta' },
                fields: 'title,timeZone'
              }
            },
            ...reqs
          ]
        }
      });

      // 3. Isi header tiap tab, PIN awal di Config, dan 10 kategori bawaan
      const catRows = DEFAULT_CATS.map((c) => [newId_(), c[0], c[1], c[2]]);
      const dataValues = sheetNames.map((name) => {
        const rows = [SHEETS[name]];
        if (name === 'Config') rows.push(['PIN', String(initialPin || '1234')]);
        if (name === 'Kategori') rows.push(...catRows);
        return {
          range: `${name}!A1:${colLetter(SHEETS[name].length)}${rows.length}`,
          values: rows
        };
      });

      await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        body: { valueInputOption: 'RAW', data: dataValues }
      });

      return spreadsheetId;
    } catch (err) {
      // Hapus file setengah jadi jika gagal saat inisialisasi
      try {
        await gfetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`, {
          method: 'PATCH',
          body: { trashed: true }
        });
      } catch (_) {}
      throw err;
    }
  }

  /* ====================== SHEET READ / WRITE ENGINE ====================== */

  function pad_(n) { return (n < 10 ? '0' : '') + n; }
  function today_() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
  }
  function nowT_() {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).slice(0, 5);
  }
  function newId_() {
    const arr = new Uint8Array(5);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(arr);
    else for (let i = 0; i < 5; i++) arr[i] = Math.floor(Math.random() * 256);
    return 'i' + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 9);
  }
  function num_(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) throw new Error('Angka tidak valid');
    return n;
  }

  function parseTable(name, values) {
    const expected = SHEETS[name];
    if (!values || !values.length) return [];
    const header = values[0].map((x) => String(x || '').trim());
    const idCol = Math.max(0, header.indexOf('id'));
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i] || [];
      if (row[idCol] === undefined || row[idCol] === null || String(row[idCol]) === '') continue;
      const obj = { _row: i + 1 };
      for (let j = 0; j < header.length; j++) {
        const k = header[j];
        if (!k) continue;
        let val = row[j] !== undefined ? row[j] : '';
        if (k === 'aktif') {
          val = !(val === 0 || val === '0' || val === false || String(val).toUpperCase() === 'FALSE');
        }
        obj[k] = val;
      }
      // Pastikan kolom yang mungkin belum ada tetap terdefinisi
      expected.forEach((k) => { if (!(k in obj)) obj[k] = k === 'aktif' ? true : ''; });
      out.push(obj);
    }
    return out;
  }

  async function loadAllTables(force = false) {
    if (_loaded && _tables && !force) return;
    if (!_user || !_user.sheetId) throw Object.assign(new Error('Belum masuk dengan Google.'), { auth: true });

    const id = _user.sheetId;
    const meta = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId,title))`);
    const existing = {};
    _sheetIds = {};
    (meta.sheets || []).forEach((s) => {
      existing[s.properties.title] = s.properties.sheetId;
      _sheetIds[s.properties.title] = s.properties.sheetId;
    });

    // Jika ada tab yang belum ada (mis. user menghapus tab secara tidak sengaja), buat ulang
    const missing = Object.keys(SHEETS).filter((name) => !(name in existing));
    if (missing.length) {
      const addReqs = missing.map((name) => ({
        addSheet: {
          properties: {
            title: name,
            gridProperties: { rowCount: 1000, columnCount: Math.max(10, SHEETS[name].length), frozenRowCount: 1 }
          }
        }
      }));
      if (missing.length === Object.keys(SHEETS).length && existing.Sheet1 !== undefined) {
        addReqs.push({ deleteSheet: { sheetId: existing.Sheet1 } });
      }
      const resAdd = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
        method: 'POST',
        body: { requests: addReqs }
      });
      (resAdd.replies || []).forEach((rep, idx) => {
        if (rep.addSheet && missing[idx]) _sheetIds[missing[idx]] = rep.addSheet.properties.sheetId;
      });
      await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
        method: 'POST',
        body: {
          valueInputOption: 'RAW',
          data: missing.map((name) => ({ range: `${name}!A1:${colLetter(SHEETS[name].length)}1`, values: [SHEETS[name]] }))
        }
      });
    }

    const ranges = Object.keys(SHEETS).map((name) => 'ranges=' + encodeURIComponent(`${name}!A1:${colLetter(SHEETS[name].length)}`)).join('&');
    const batch = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);

    _tables = {};
    const names = Object.keys(SHEETS);
    const fixHeaders = [];
    (batch.valueRanges || []).forEach((vr, idx) => {
      const name = names[idx];
      const vals = vr.values || [];
      // Cek apakah ada kolom baru yang perlu ditambahkan ke header
      const curHeader = vals[0] ? vals[0].map(String) : [];
      const missingCols = SHEETS[name].filter((c) => curHeader.indexOf(c) < 0);
      if (missingCols.length) {
        const newHeader = curHeader.length ? curHeader.concat(missingCols) : SHEETS[name].slice();
        fixHeaders.push({ range: `${name}!A1:${colLetter(newHeader.length)}1`, values: [newHeader] });
      }
      _tables[name] = parseTable(name, vals);
    });

    if (fixHeaders.length) {
      await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
        method: 'POST',
        body: { valueInputOption: 'RAW', data: fixHeaders }
      });
    }

    // Pastikan Config PIN ada
    if (!_tables.Config.some((r) => r.key === 'PIN')) {
      await put_('Config', { key: 'PIN', value: '1234' });
    }
    // Pastikan Kategori default terisi jika kosong
    if (!_tables.Kategori.length) {
      const rows = DEFAULT_CATS.map((c) => ({ id: newId_(), nama: c[0], tipe: c[1], ikon: c[2] }));
      await appendMany_('Kategori', rows);
    }

    _loaded = true;
  }

  function read_(name) {
    return (_tables && _tables[name]) ? _tables[name] : [];
  }

  function find_(name, id) {
    if (id === undefined || id === null || id === '') return null;
    const all = read_(name);
    for (let i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function toRowArray(name, o) {
    return SHEETS[name].map((k) => {
      const x = o[k];
      if (x === undefined || x === null) return '';
      if (typeof x === 'boolean') return x ? 1 : 0;
      return x;
    });
  }

  async function appendMany_(name, objs) {
    if (!objs.length) return;
    const id = _user.sheetId;
    const cols = SHEETS[name];
    const values = objs.map((o) => toRowArray(name, o));
    const res = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(name + '!A1:' + colLetter(cols.length))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: { values }
    });
    const updatedRange = (res.updates && res.updates.updatedRange) || '';
    const m = updatedRange.match(/![A-Z]+(\d+):/);
    let startRow = m ? Number(m[1]) : ((_tables[name].length ? _tables[name][_tables[name].length - 1]._row : 1) + 1);
    objs.forEach((o, i) => {
      _tables[name].push(Object.assign({}, o, { _row: startRow + i }));
    });
  }

  async function put_(name, o) {
    const id = _user.sheetId;
    const cols = SHEETS[name];
    const idKey = cols.indexOf('id') >= 0 ? 'id' : cols[0]; // Config memakai 'key'
    const list = read_(name);
    const idx = list.findIndex((item) => String(item[idKey]) === String(o[idKey]));
    const rowArr = toRowArray(name, o);

    if (idx >= 0) {
      const rowNum = list[idx]._row;
      const range = `${name}!A${rowNum}:${colLetter(cols.length)}${rowNum}`;
      await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: { values: [rowArr] }
      });
      _tables[name][idx] = Object.assign({}, o, { _row: rowNum });
    } else {
      await appendMany_(name, [o]);
    }
  }

  async function delWhere_(name, pred) {
    const id = _user.sheetId;
    const list = read_(name);
    const toDel = list.filter(pred).sort((a, b) => b._row - a._row);
    if (!toDel.length) return;
    const sid = _sheetIds[name];
    if (sid !== undefined) {
      const reqs = toDel.map((item) => ({
        deleteDimension: {
          range: { sheetId: sid, dimension: 'ROWS', startIndex: item._row - 1, endIndex: item._row }
        }
      }));
      await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
        method: 'POST',
        body: { requests: reqs }
      });
      // Sinkronkan nomor baris _row di memori setelah penghapusan dari bawah ke atas
      const delSet = new Set(toDel.map((x) => x._row));
      _tables[name] = list.filter((x) => !delSet.has(x._row));
      toDel.forEach((d) => {
        _tables[name].forEach((x) => { if (x._row > d._row) x._row--; });
      });
    }
  }

  async function del_(name, id) {
    return delWhere_(name, (o) => String(o.id) === String(id));
  }

  /* ====================== AUTH PIN ====================== */

  function pin_() {
    const r = read_('Config').find((x) => x.key === 'PIN');
    return r ? String(r.value).trim() : '';
  }

  function auth_(pin) {
    const lockUntil = Number(LS.get('celengan_pin_lock', 0));
    if (lockUntil && Date.now() < lockUntil) {
      return 'Terlalu banyak percobaan. Coba lagi 5 menit lagi.';
    }
    const real = pin_();
    if (!real) return 'PIN belum diatur di sheet Config.';
    if (String(pin === undefined || pin === null ? '' : pin).trim() === real) {
      LS.del('celengan_pin_fails');
      LS.del('celengan_pin_lock');
      return null;
    }
    const fails = Number(LS.get('celengan_pin_fails', 0)) + 1;
    if (fails >= 5) {
      LS.set('celengan_pin_lock', Date.now() + 300000);
      LS.del('celengan_pin_fails');
    } else {
      LS.set('celengan_pin_fails', fails);
    }
    return 'PIN salah';
  }

  /* ====================== BUSINESS LOGIC (MIRROR Code.gs) ====================== */

  function cleanRow(o) {
    const c = Object.assign({}, o);
    delete c._row;
    return c;
  }

  function state_() {
    const cutDate = new Date(Date.now() - KEEP_MONTHS * 30 * 864e5);
    const cut = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(cutDate);
    return {
      banks: read_('Dompet').map(cleanRow),
      cats: read_('Kategori').map(cleanRow),
      trx: read_('Transaksi').filter((t) => String(t.tanggal) >= cut).map(cleanRow),
      ang: read_('Anggaran').map(cleanRow),
      aset: read_('Aset').map(cleanRow),
      utang: read_('Utang').map(cleanRow),
      rutin: read_('Rutin').map(cleanRow),
      target: read_('Target').map(cleanRow),
      riw: read_('Riwayat').slice(-400).map(cleanRow)
    };
  }

  function isA_(id) { return String(id).indexOf('a:') === 0; }

  async function adj_(id, delta) {
    const b = find_('Dompet', id);
    if (!b) return;
    b.saldo = Number(b.saldo) + delta;
    await put_('Dompet', b);
  }

  async function adjA_(id, delta) {
    const a = find_('Aset', String(id).slice(2));
    if (!a) return;
    a.nilai = Number(a.nilai) + delta;
    await put_('Aset', a);
  }

  async function applyTrx_(t, sign) {
    const j = Number(t.jumlah) * sign;
    if (t.tipe === 'masuk') await adj_(t.bank, j);
    else if (t.tipe === 'keluar') await adj_(t.bank, -j);
    else if (t.tipe === 'transfer') {
      const f = Number(t.biaya || 0) * sign;
      await adj_(t.bank, -j - f);
      if (isA_(t.bank2)) await adjA_(t.bank2, j);
      else await adj_(t.bank2, j);
    }
  }

  async function addTrx_(d) {
    const tipe = d.tipe;
    if (['masuk', 'keluar', 'transfer'].indexOf(tipe) < 0) throw new Error('Jenis transaksi tidak valid');
    const j = num_(d.jumlah);
    if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
    if (!find_('Dompet', d.bank)) throw new Error('Dompet tidak ditemukan');
    if (tipe === 'transfer') {
      if (isA_(d.bank2)) {
        if (!find_('Aset', String(d.bank2).slice(2))) throw new Error('Aset tujuan tidak ditemukan');
      } else {
        if (!find_('Dompet', d.bank2)) throw new Error('Dompet tujuan tidak ditemukan');
        if (String(d.bank) === String(d.bank2)) throw new Error('Dompet asal dan tujuan tidak boleh sama');
      }
    }
    const tgl = String(d.tanggal || today_());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw new Error('Format tanggal tidak valid');
    const jam = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.jam || '')) ? String(d.jam) : nowT_();
    const biaya = tipe === 'transfer' ? Math.max(0, num_(d.biaya || 0)) : 0;
    const id = (/^i[0-9a-f]{9}$/.test(String(d.id || '')) && !find_('Transaksi', d.id)) ? d.id : newId_();
    const t = {
      id,
      tanggal: tgl,
      tipe,
      bank: d.bank,
      bank2: tipe === 'transfer' ? d.bank2 : '',
      kategori: tipe === 'transfer' ? '' : (d.kategori || ''),
      jumlah: j,
      catatan: String(d.catatan || ''),
      jam,
      biaya
    };
    await put_('Transaksi', t);
    await applyTrx_(t, 1);
    return t.id;
  }

  async function editTrx_(d) {
    const t = find_('Transaksi', d.id);
    if (!t) throw new Error('Transaksi tidak ditemukan');
    if (t.kategori === 'adj') throw new Error('Penyesuaian saldo tidak bisa diedit, hapus saja');
    const snapshot = cleanRow(t);
    await applyTrx_(snapshot, -1);
    await del_('Transaksi', d.id);
    try {
      await addTrx_(d);
    } catch (e) {
      await put_('Transaksi', snapshot);
      await applyTrx_(snapshot, 1);
      throw e;
    }
    return d.id;
  }

  async function saveBank_(d) {
    const nama = String(d.nama || '').trim();
    if (!nama) throw new Error('Nama dompet wajib diisi');
    const ex = d.id ? find_('Dompet', d.id) : null;
    const o = Object.assign({ id: newId_(), tipe: 'Bank', rek: '', logo: '' }, ex ? cleanRow(ex) : {});
    o.nama = nama;
    o.tipe = String(d.tipe || o.tipe || 'Bank');
    o.rek = String(d.rek || '');
    const ns = num_(d.saldo);
    const diff = ex ? ns - Number(ex.saldo) : 0;
    o.saldo = ex ? Number(ex.saldo) : ns;
    if (d.logo !== undefined) {
      if (String(d.logo).length > 45000) throw new Error('Logo terlalu besar');
      o.logo = d.logo;
    }
    await put_('Dompet', o);
    if (diff !== 0) {
      await addTrx_({
        tipe: diff > 0 ? 'masuk' : 'keluar',
        bank: o.id,
        kategori: 'adj',
        jumlah: Math.abs(diff),
        catatan: 'Penyesuaian saldo'
      });
    }
    return o.id;
  }

  async function saveKat_(d) {
    const nama = String(d.nama || '').trim();
    if (!nama) throw new Error('Nama kategori wajib diisi');
    const ex = d.id ? find_('Kategori', d.id) : null;
    const tipe = ex ? ex.tipe : (d.tipe === 'masuk' ? 'masuk' : 'keluar');
    const o = { id: ex ? ex.id : newId_(), nama, tipe, ikon: String(d.ikon || '').trim() };
    const dup = read_('Kategori').some((c) => c.tipe === tipe && String(c.id) !== String(o.id) && String(c.nama).toLowerCase() === nama.toLowerCase());
    if (dup) throw new Error('Nama kategori sudah ada');
    await put_('Kategori', o);
    return o.id;
  }

  async function saveAng_(d) {
    const j = num_(d.jumlah);
    if (!(j > 0)) throw new Error('Batas harus lebih dari 0');
    if (!find_('Kategori', d.kategori)) throw new Error('Kategori tidak ditemukan');
    const ex = read_('Anggaran').find((a) => String(a.kategori) === String(d.kategori));
    await put_('Anggaran', { id: ex ? ex.id : newId_(), kategori: d.kategori, jumlah: j });
    return null;
  }

  async function saveAset_(d) {
    const nama = String(d.nama || '').trim();
    if (!nama) throw new Error('Nama aset wajib diisi');
    const ex = d.id ? find_('Aset', d.id) : null;
    const o = Object.assign({ id: newId_(), aktif: true }, ex ? cleanRow(ex) : {});
    o.nama = nama;
    o.nilai = num_(d.nilai);
    o.grup = String(d.grup || 'Lainnya').trim() || 'Lainnya';
    if (d.aktif !== undefined) o.aktif = !!d.aktif;
    await put_('Aset', o);
    return o.id;
  }

  async function saveUtang_(d) {
    const nama = String(d.nama || '').trim();
    const j = num_(d.jumlah);
    if (!nama || !(j > 0)) throw new Error('Isi nama dan jumlah');
    await put_('Utang', {
      id: newId_(),
      tipe: d.tipe === 'beri' ? 'beri' : 'pinjam',
      nama,
      jumlah: j,
      sisa: j,
      catatan: String(d.catatan || ''),
      tempo: String(d.tempo || '')
    });
    return null;
  }

  function initLast_(hari) {
    const t = today_(), y = +t.slice(0, 4), m = +t.slice(5, 7), dNow = +t.slice(8);
    const dim = new Date(y, m, 0).getDate();
    const day = Math.min(hari, dim);
    if (dNow > day) return y + '-' + pad_(m);
    return m === 1 ? (y - 1) + '-12' : y + '-' + pad_(m - 1);
  }

  async function saveRutin_(d) {
    const nama = String(d.nama || '').trim();
    if (!nama) throw new Error('Nama wajib diisi');
    if (['masuk', 'keluar', 'transfer'].indexOf(d.tipe) < 0) throw new Error('Jenis tidak valid');
    const j = num_(d.jumlah);
    if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
    const hari = Math.round(num_(d.hari));
    if (hari < 1 || hari > 31) throw new Error('Tanggal harus 1 sampai 31');
    if (!find_('Dompet', d.bank)) throw new Error('Dompet tidak ditemukan');
    const ex = d.id ? find_('Rutin', d.id) : null;
    const aktif = d.aktif === undefined ? true : !!d.aktif;
    const o = {
      id: ex ? ex.id : newId_(),
      nama,
      tipe: d.tipe,
      jumlah: j,
      hari,
      bank: d.bank,
      bank2: d.tipe === 'transfer' ? String(d.bank2 || '') : '',
      kategori: d.tipe === 'transfer' ? '' : (d.kategori || ''),
      aktif,
      terakhir: ex ? String(ex.terakhir || '') : initLast_(hari)
    };
    if (ex && !ex.aktif && aktif) o.terakhir = initLast_(hari);
    await put_('Rutin', o);
    return o.id;
  }

  async function runRutin_() {
    const t = today_(), y = +t.slice(0, 4), m = +t.slice(5, 7) - 1, dNow = +t.slice(8);
    const rutins = read_('Rutin').map(cleanRow);
    for (const r of rutins) {
      if (!r.aktif) continue;
      if (!find_('Dompet', r.bank)) continue;
      let last = String(r.terakhir || '');
      let cy, cm;
      if (last) {
        cy = +last.slice(0, 4);
        cm = +last.slice(5, 7);
        if (cm > 11) { cm = 0; cy++; }
      } else {
        cy = y; cm = m;
      }
      let n = 0, changed = false;
      while ((cy < y || (cy === y && cm <= m)) && n < 24) {
        const dim = new Date(cy, cm + 1, 0).getDate();
        const day = Math.min(Number(r.hari) || 1, dim);
        if (cy === y && cm === m && dNow < day) break;
        try {
          await addTrx_({
            tipe: r.tipe,
            bank: r.bank,
            bank2: r.bank2,
            kategori: r.kategori,
            jumlah: r.jumlah,
            tanggal: cy + '-' + pad_(cm + 1) + '-' + pad_(day),
            catatan: 'Otomatis: ' + r.nama,
            jam: '00:00'
          });
        } catch (e) { break; }
        last = cy + '-' + pad_(cm + 1);
        changed = true;
        cm++;
        if (cm > 11) { cm = 0; cy++; }
        n++;
      }
      if (changed) {
        r.terakhir = last;
        await put_('Rutin', r);
      }
    }
  }

  async function saveTarget_(d) {
    const nama = String(d.nama || '').trim();
    const j = num_(d.jumlah);
    if (!nama || !(j > 0)) throw new Error('Isi nama dan jumlah target');
    const s = String(d.sumber || '');
    if (isA_(s) ? !find_('Aset', s.slice(2)) : !find_('Dompet', s)) throw new Error('Sumber dana tidak ditemukan');
    const ex = d.id ? find_('Target', d.id) : null;
    await put_('Target', {
      id: ex ? ex.id : newId_(),
      nama,
      jumlah: j,
      sumber: s,
      tenggat: String(d.tenggat || '')
    });
    return null;
  }

  async function snap_() {
    const sum = (l, f) => l.reduce((a, x) => a + Number(f(x)), 0);
    const U = read_('Utang');
    const nb = sum(read_('Dompet'), (b) => b.saldo)
      + sum(read_('Aset').filter((a) => a.aktif), (a) => a.nilai)
      + sum(U.filter((u) => u.tipe === 'beri'), (u) => u.sisa)
      - sum(U.filter((u) => u.tipe === 'pinjam'), (u) => u.sisa);
    const id = today_();
    const ex = find_('Riwayat', id);
    if (!ex || Number(ex.nilai) !== nb) {
      await put_('Riwayat', { id, nilai: nb });
    }
  }

  async function handle_(d) {
    switch (d.a) {
      case 'getAll':
      case 'login':
        return null;
      case 'setPin': {
        const np = String(d.newPin || '').trim();
        if (!/^\d{4,8}$/.test(np)) throw new Error('PIN harus 4 sampai 8 digit angka');
        await put_('Config', { key: 'PIN', value: np });
        return true;
      }
      case 'addTrx':
        return addTrx_(d);
      case 'delTrx': {
        const t = find_('Transaksi', d.id);
        if (t) {
          const snapT = cleanRow(t);
          await applyTrx_(snapT, -1);
          await del_('Transaksi', d.id);
        }
        return null;
      }
      case 'saveBank':
        return saveBank_(d);
      case 'delBank': {
        await del_('Dompet', d.id);
        const affected = read_('Rutin').filter((r) => String(r.bank) === String(d.id)).map(cleanRow);
        for (const r of affected) {
          r.aktif = false;
          await put_('Rutin', r);
        }
        return null;
      }
      case 'saveKat':
        return saveKat_(d);
      case 'delKat': {
        await del_('Kategori', d.id);
        await delWhere_('Anggaran', (o) => String(o.kategori) === String(d.id));
        const affected = read_('Rutin').filter((r) => String(r.kategori) === String(d.id)).map(cleanRow);
        for (const r of affected) {
          r.kategori = '';
          await put_('Rutin', r);
        }
        return null;
      }
      case 'saveAng':
        return saveAng_(d);
      case 'delAng':
        await del_('Anggaran', d.id);
        return null;
      case 'saveAset':
        return saveAset_(d);
      case 'toggleAset': {
        const a = find_('Aset', d.id);
        if (a) {
          const c = cleanRow(a);
          c.aktif = !!d.aktif;
          await put_('Aset', c);
        }
        return null;
      }
      case 'delAset':
        await del_('Aset', d.id);
        return null;
      case 'saveUtang':
        return saveUtang_(d);
      case 'bayarUtang': {
        const u = find_('Utang', d.id);
        const j = num_(d.jumlah);
        if (!u) throw new Error('Data utang tidak ditemukan');
        if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
        const c = cleanRow(u);
        c.sisa = Math.max(0, Number(c.sisa) - j);
        await put_('Utang', c);
        return null;
      }
      case 'delUtang':
        await del_('Utang', d.id);
        return null;
      case 'saveRutin':
        return saveRutin_(d);
      case 'toggleRutin': {
        const r = find_('Rutin', d.id);
        if (r) {
          const c = cleanRow(r);
          if (d.aktif && !c.aktif) c.terakhir = initLast_(Number(c.hari));
          c.aktif = !!d.aktif;
          await put_('Rutin', c);
        }
        return null;
      }
      case 'delRutin':
        await del_('Rutin', d.id);
        return null;
      case 'editTrx':
        return editTrx_(d);
      case 'saveTarget':
        return saveTarget_(d);
      case 'delTarget':
        await del_('Target', d.id);
        return null;
      default:
        throw new Error('Aksi tidak dikenal: ' + d.a);
    }
  }

  /* ====================== PUBLIC API ====================== */

  function serialized(fn) {
    const p = _mutex.then(fn, fn);
    _mutex = p.catch(() => {});
    return p;
  }

  const SheetsAPI = {
    getClientId,
    setClientId,
    isClientConfigured,
    hasUser: () => !!(_user && _user.email && _user.sheetId),
    getUser: () => _user,
    hasToken,
    getSheetUrl: () => (_user && _user.sheetId ? `https://docs.google.com/spreadsheets/d/${_user.sheetId}` : ''),

    async signIn(onProgress) {
      return serialized(async () => {
        if (onProgress) onProgress('Menghubungkan akun Google…');
        await requestToken('select_account');

        if (onProgress) onProgress('Membaca profil Google…');
        const info = await fetchUserInfo();
        const email = info.email || '';
        const prev = LS.get('celengan_user', null);
        const cachedSheet = (prev && prev.email === email ? prev.sheetId : '') || LS.get('celengan_sheet_' + email, '');

        if (onProgress) onProgress('Memeriksa Spreadsheet di Google Drive…');
        let sheetId = await findExistingSheet(cachedSheet);
        let isNew = false;

        if (!sheetId) {
          isNew = true;
          sheetId = await createSpreadsheetForUser('1234', onProgress);
        }

        _user = {
          email,
          name: info.name || email,
          picture: info.picture || '',
          sheetId
        };
        LS.set('celengan_user', _user);
        if (email) LS.set('celengan_sheet_' + email, sheetId);

        if (onProgress) onProgress('Memuat data keuangan…');
        await loadAllTables(true);

        if (isNew) {
          // Untuk user baru, langsung jalankan snapshot awal
          await snap_();
        }
        return { user: _user, isNew };
      });
    },

    async reconnect() {
      return serialized(async () => {
        await requestToken('');
        return true;
      });
    },

    signOut() {
      const tok = _token;
      saveToken('', 0);
      _user = null;
      _tables = null;
      _sheetIds = {};
      _loaded = false;
      LS.del('celengan_user');
      try { sessionStorage.removeItem('pin'); } catch (e) {}
      if (tok && global.google && global.google.accounts && global.google.accounts.oauth2 && global.google.accounts.oauth2.revoke) {
        try { global.google.accounts.oauth2.revoke(tok, () => {}); } catch (e) {}
      }
    },

    async call(a, d = {}, pin = '') {
      return serialized(async () => {
        await ensureToken(true);
        const forceRefresh = (a === 'login' || a === 'getAll');
        await loadAllTables(forceRefresh);

        const bad = auth_(pin);
        if (bad) {
          const err = new Error(bad);
          err.auth = true;
          throw err;
        }

        const r = await handle_(Object.assign({ a }, d));
        if (a !== 'setPin') {
          await runRutin_();
          await snap_();
        }
        return Object.assign(state_(), { r: r === undefined ? null : r });
      });
    }
  };

  global.SheetsAPI = SheetsAPI;
})(window);
