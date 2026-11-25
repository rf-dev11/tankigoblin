/* Menu Dompet (kartu bertumpuk). Dimuat SETELAH script utama di index.html.
   Nama bank, saldo, tambah/edit tetap dari data Sheet (S.banks, bankForm).
   Urutan dan warna kartu disimpan di perangkat ini (localStorage). */
const WK=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const WS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
let WO=WK('wo',[]),WC=WK('wc',{}),WI=WK('wi',{}),WSEL='',WE=false;
const WP=[['#fdc22e','#0b2230'],['#5ce1d0','#0b2230'],['#a8d8f0','#0b2230'],['#f25c27','#fff'],['#0b7bb8','#fff'],['#c7f2e8','#0b2230'],['#f58ac0','#0b2230'],['#a58bf0','#0b2230'],['#c9ccd1','#0b2230'],['#1c2b36','#fff']];
const WD=[
['repeating-linear-gradient(45deg,#ffffff38 0 2px,#0000 2px 13px),repeating-linear-gradient(-45deg,#ffffff38 0 2px,#0000 2px 13px),linear-gradient(135deg,#eceef1,#a5abb4 50%,#d9dce1)','#0b2230','Perak batik'],
['linear-gradient(135deg,#34383f,#0c0e11)','#fff','Hitam'],
['linear-gradient(135deg,#f7e7ac,#c9a24a 52%,#f0d58a)','#0b2230','Emas'],
['linear-gradient(135deg,#1e3a8a,#0b7bb8)','#fff','Biru malam'],
['linear-gradient(135deg,#f25c27,#fdc22e)','#0b2230','Senja'],
['linear-gradient(135deg,#14b8a6,#a7f3d0)','#0b2230','Tosca'],
['linear-gradient(135deg,#7c3aed,#f58ac0)','#fff','Ungu pink']];
const WA=[...WP,...WD];
const WCL='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 8c2 2.5 2 5.5 0 8M12 5.5c3.5 3.8 3.5 9.2 0 13M16 3c5 5 5 13 0 18"/></svg>';
const wcol=b=>{const m=WI[b.id];if(m)return[`url('${m.u}') center/cover no-repeat`,m.f];const i=WC[b.id];return WA[i!=null&&WA[i]?i:Math.max(0,S.banks.findIndex(x=>x.id==b.id))%WP.length]};
const wlist=()=>[...S.banks].sort((a,b)=>{const x=WO.indexOf(a.id),y=WO.indexOf(b.id);return(x<0?999:x)-(y<0?999:y)});

function wSel(id){
WSEL=WSEL==id?'':id;
document.querySelectorAll('.wi').forEach(e=>e.classList.toggle('sel',!!WSEL&&e.dataset.id==WSEL));
if(WSEL)setTimeout(()=>{const x=document.querySelector('.wi.sel .wax');if(x)x.scrollIntoView({behavior:'smooth',block:'center'})},280);
}
function wMove(id,d){const l=wlist().map(b=>b.id),i=l.indexOf(id),j=i+d;if(j<0||j>=l.length)return;[l[i],l[j]]=[l[j],l[i]];WO=l;WS('wo',WO);draw()}
function wSet(id,i){delete WI[id];WS('wi',WI);if(i==null)delete WC[id];else WC[id]=i;WS('wc',WC);closeM();draw()}
function wImg(id,inp){
const f=inp.files[0];if(!f)return;
const im=new Image();
im.onload=()=>{
const W=640,H=404,c=document.createElement('canvas');c.width=W;c.height=H;
const x=c.getContext('2d'),r=Math.max(W/im.width,H/im.height),w=im.width*r,h=im.height*r;
x.drawImage(im,(W-w)/2,(H-h)/2,w,h);URL.revokeObjectURL(im.src);
const d=x.getImageData(0,0,W,H).data;let s=0,n=0;
for(let i=0;i<d.length;i+=388){s+=.299*d[i]+.587*d[i+1]+.114*d[i+2];n++}
const o=WI[id];WI[id]={u:c.toDataURL('image/jpeg',.75),f:s/n>150?'#0b2230':'#fff'};
try{localStorage.setItem('wi',JSON.stringify(WI))}
catch(e){if(o)WI[id]=o;else delete WI[id];alert('Penyimpanan perangkat penuh. Hapus gambar kartu lain atau pakai gambar lebih kecil.');return}
closeM();draw();
};
im.onerror=()=>alert('Gambar tidak bisa dibaca');
im.src=URL.createObjectURL(f);
}
function wCol(id){
const sq=(a,i)=>`<button class="sw2" style="background:${a[0]}" onclick="wSet('${id}',${i})" aria-label="${a[2]||'Warna polos'}">${!WI[id]&&WC[id]==i?`<span style="color:${a[1]}">✓</span>`:''}</button>`;
modal('Tampilan kartu',`<label class="sv" style="display:block;text-align:center">📷 ${WI[id]?'Ganti':'Pilih'} gambar kartu<input type="file" accept="image/*" hidden onchange="wImg('${id}',this)"></label>
<p class="mt" style="font-size:12px;margin:8px 0 0">Gambar hanya disimpan di perangkat ini. Nama dan saldo tetap tampil di atas kartu.</p>
<p class="lb">Desain</p><div class="cg">${WD.map((a,i)=>sq(a,i+WP.length)).join('')}</div>
<p class="lb">Warna polos</p><div class="cg">${WP.map((a,i)=>sq(a,i)).join('')}</div>
<button class="sv" onclick="wSet('${id}',null)">Pakai tampilan bawaan</button>`);
}
function wDet(id){
const b=S.banks.find(x=>x.id==id);if(!b)return;
const t=S.trx.filter(x=>x.bank==id||x.bank2==id).sort((a,c)=>(c.tanggal+(c.jam||'')).localeCompare(a.tanggal+(a.jam||''))).slice(0,5);
modal(esc(b.nama),`<div class="fr"><span>Saldo</span><b>${rp(b.saldo)}</b></div><div class="fr"><span>Jenis</span><b>${esc(b.tipe||'Bank')}</b></div>${b.rek?`<div class="fr"><span>No. rekening</span><b>${esc(b.rek)}</b></div>`:''}
<p class="lb">Transaksi terakhir</p><div class="grp">${t.map(row).join('')||'<p class="mt" style="padding:12px;margin:0">Belum ada transaksi.</p>'}</div>`);
}
const wcard=b=>{
const [c,f]=wcol(b),s=b.id==WSEL,im=!!WI[b.id],tp=b.tipe||'Bank';
return `<div class="wi ${s?'sel':''}" data-id="${b.id}"><div class="wc ${im?'wimg':''}" style="background:${c};color:${f}" onclick="wSel('${b.id}')">
<div class="wt"><span class="wn">${mi(b)}${esc(b.nama)}</span><b class="wb">${hide?'Rp •••':rp(b.saldo)}</b></div>
<div class="wch">${tp=='Bank'?'<i class="chip2"></i>':''}${WCL}</div>
<div class="wno">${b.rek?'•••• •••• •••• '+esc(String(b.rek).slice(-4)):'&nbsp;'}</div>
<div class="wbt"><span class="wnm">${esc(b.nama)}</span><small>${esc(tp)}</small></div></div>
<div class="wax"><div class="wa"><button onclick="wDet('${b.id}')">ⓘ Detail</button><button onclick="wCol('${b.id}')">🎨 Tampilan</button><button onclick="bankForm('${b.id}')">✎ Edit</button></div></div></div>`;
};
V.wallet=()=>{
const l=wlist();
return `<h1>Dompet</h1><div class="hero"><small>Saldo dompet</small><div class="big">${hide?'Rp •••••':rp(bTot())}<button class="eye" onclick="hide=!hide;draw()" aria-label="Tampilkan atau sembunyikan saldo">${hide?'🙈':'👁'}</button></div><small>${l.length} dompet</small></div>
<div class="rw wh"><b>Kartu</b><span><button class="rb ${WE?'on':''}" onclick="WE=!WE;draw()" aria-label="Atur urutan">⇅</button><button class="rb" onclick="bankForm()" aria-label="Tambah dompet">+</button></span></div>`+
(!l.length?'<div class="card empty"><b>Belum ada dompet</b><p class="mt">Tekan + untuk menambah bank, e-wallet, atau tunai.</p></div>'
:WE?l.map((b,i)=>{const [c,f]=wcol(b);return `<div class="wr" style="background:${c};color:${f}"><span class="wn">${mi(b)}${esc(b.nama)}</span><span class="wa2"><button onclick="wMove('${b.id}',-1)" ${i?'':'disabled'}>▲</button><button onclick="wMove('${b.id}',1)" ${i<l.length-1?'':'disabled'}>▼</button></span></div>`}).join('')+'<button class="sv" onclick="WE=false;draw()">Selesai</button>'
:`<div class="wal">${l.map(wcard).join('')}</div><p class="mt" style="font-size:12px;margin:16px 4px 0">Ketuk kartu untuk detail, warna, dan edit. Tombol ⇅ untuk mengatur urutan (paling atas = pertama).</p>`);
};

/* pasang ke aplikasi */
TEMA.laut=['Laut','#0b7bb8'];
try{if(!localStorage.getItem('tema2')){localStorage.setItem('tema2','1');setTema('laut',1)}}catch(e){}
NAV[3][1]='👤';NAV.splice(3,0,['wallet','💳','Dompet']);
$('#nv').innerHTML=NAV.map(([k,i,l])=>`<button data-k="${k}" onclick="go('${k}')"><span>${i}</span>${l}</button>`).join('');
const _draw=draw;
draw=function(d){_draw(d);if(tab=='wallet')$('#fab').classList.add('h')};

/* gaya tampilan: neo (bawaan), flat, kaca. Gaya css ada di tema.css */
const GAYA={neo:['Neobrutalism','🟨','Border tebal dan bayangan keras'],flat:['Minimalis','⬜','Bersih, tipis, tanpa bayangan tebal'],kaca:['Kaca','🔮','Transparan dan buram (glassmorphism)']};
let gaya=WK('gaya','neo');if(!GAYA[gaya])gaya='neo';
document.documentElement.dataset.gaya=gaya;
function setGaya(k){if(!GAYA[k])k='neo';gaya=k;document.documentElement.dataset.gaya=k;WS('gaya',k);draw()}
V.gaya=()=>`<div class="grp">${Object.entries(GAYA).map(([k,[n,i,d]])=>`<div class="row2" onclick="setGaya('${k}')"><div class="ic" style="background:#fdc22e55">${i}</div><div class="g"><b>${n}</b><small class="mt" style="display:block">${d}</small></div><b>${k==gaya?'✓':''}</b></div>`).join('')}</div><p class="mt" style="font-size:12px;margin:10px 4px 0">Gaya dan Tema warna bisa digabung. Disimpan di perangkat ini.</p>`;
const _set=V.set;
V.set=function(){
if(pg=='gaya')return `<div class="nb"><button class="bk" onclick="back()">‹ Pengaturan</button></div><h1>Gaya tampilan</h1>`+V.gaya();
return _set().replace('</div><p class="gl">Keamanan</p>',`<div class="row2" onclick="push('gaya')"><div class="ic" style="background:#fdc22e55">🖼️</div><span class="g">Gaya tampilan</span><span class="mt">${GAYA[gaya][0]}</span><span class="chev">›</span></div></div><p class="gl">Keamanan</p>`);
};
