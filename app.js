/* ============================================================
   ABSENSI DM ALBAYAN — Aplikasi Guru (Firebase Realtime DB)
   ============================================================ */
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyAkI7P-TZ53tVNSro1F664rspTXY6-fcjU",
  authDomain: "absensi-dm.firebaseapp.com",
  databaseURL: "https://absensi-dm-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "absensi-dm",
  storageBucket: "absensi-dm.firebasestorage.app",
  messagingSenderId: "216397348606",
  appId: "1:216397348606:web:b3d9b67cf95676dc836faf"
};

let S = null;               // { version, data }
let me = null;              // guru login
let deferredPrompt = null;
let R = null;               // firebase database ref
const ui = {
  view: 'absensi', classId: null, date: todayStr(), session: 1,
  rekapMode: 'bulan', rekapMonth: todayStr().slice(0, 7), rekapSemester: 0,
};

/* ---------------- util ---------------- */
function todayStr() { return new Date().toLocaleDateString('en-CA'); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtTime(ts) { try { return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function fmtDateID(d) { try { return new Date(d + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } }
function initials(n) { return String(n).replace(/^(ust\.|ustadz|ustzh\.?|ibu|pak|bu)\s*/i, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
function vals(obj) { return obj ? Object.values(obj) : []; }

/* ---------------- seed ---------------- */
function buildSeed() {
  const seed = {
    settings: { schoolName: 'DM Albayan', sessions: 6, adminPin: '12345', sessionNames: { s1: 'Jam ke-1', s2: 'Jam ke-2', s3: 'Jam ke-3', s4: 'Jam ke-4', s5: 'Jam ke-5', s6: 'Jam ke-6' } },
    teachers: { t1: { id: 't1', name: 'Ust. Ahmad', pin: '1234' } },
    classes: { c1: { id: 'c1', name: 'Kelas Tahfidz A' } },
    students: {}, attendance: {}, setoran: {},
  };
  ['Ahmad Fauzan', 'Bilal Ramadhan', 'Fadhil Hakim', 'Hanif Abdullah', 'Muhammad Rizki', 'Rafa Alfarizi', 'Zaid Alkhair', 'Naufal Zaki']
    .forEach((n, i) => { seed.students['s' + (i + 1)] = { id: 's' + (i + 1), classId: 'c1', name: n }; });
  return seed;
}
function normalize(v) {
  const sn = vals(v.settings && v.settings.sessionNames).length ? vals(v.settings.sessionNames) : [];
  return {
    settings: {
      schoolName: (v.settings && v.settings.schoolName) || 'DM Albayan',
      sessions: (v.settings && v.settings.sessions) || 6,
      adminPin: (v.settings && v.settings.adminPin) || '12345',
      sessionNames: sn.length ? sn : ['Jam ke-1', 'Jam ke-2', 'Jam ke-3', 'Jam ke-4', 'Jam ke-5', 'Jam ke-6'],
    },
    teachers: vals(v.teachers), classes: vals(v.classes), students: vals(v.students),
    attendance: vals(v.attendance), setoran: vals(v.setoran),
  };
}

/* ---------------- firebase ---------------- */
function initFirebase() {
  const setMsg = t => { const el = document.getElementById('loadmsg'); if (el) el.textContent = t; };
  if (typeof firebase === 'undefined') {
    setMsg('Gagal memuat pustaka. Periksa internet, lalu ketuk tombol di bawah.');
    showReload(); return;
  }
  window.onerror = m => setMsg('Error: ' + m);
  setTimeout(() => { const el = document.getElementById('loadmsg'); if (el && el.textContent.includes('Menghubungkan')) { setMsg('Koneksi lambat. Ketuk tombol di bawah untuk muat ulang.'); showReload(); } }, 12000);
  firebase.initializeApp(firebaseConfig);
  R = firebase.database().ref('data');
  R.on('value', snap => {
    let v = snap.val();
    if (!v) { R.set(buildSeed()); return; }
    S = { version: (S ? S.version + 1 : 1), data: normalize(v) };
    if (!ui.classId && S.data.classes.length) ui.classId = S.data.classes[0].id;
    if (!S.data.classes.some(c => c.id === ui.classId)) ui.classId = (S.data.classes[0] || {}).id || null;
    render();
  }, err => { setMsg('Koneksi database: ' + err.message); showReload(); });
}
function showReload() {
  if (document.getElementById('reloadBtn')) return;
  const card = document.querySelector('.login-card');
  if (!card) return;
  const b = document.createElement('button');
  b.id = 'reloadBtn'; b.className = 'btn'; b.style.marginTop = '12px';
  b.textContent = '🔄 Muat Ulang';
  b.onclick = () => location.reload();
  card.appendChild(b);
}
const w = (path, value) => R.child(path).set(value);
const wdel = path => R.child(path).remove();

/* ---------------- semester helpers ---------------- */
function semesterList(n) {
  const list = []; const now = new Date();
  let year = now.getFullYear(); let odd = now.getMonth() >= 6;
  for (let i = 0; i < n; i++) {
    if (odd) { list.push({ label: `Semester Ganjil ${year}/${year + 1}`, from: `${year}-07-01`, to: `${year}-12-31` }); odd = false; }
    else { list.push({ label: `Semester Genap ${year}/${year + 1}`, from: `${year + 1}-01-01`, to: `${year + 1}-06-30` }); year--; odd = true; }
  }
  return list;
}
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/* ---------------- ekspor (client) ---------------- */
function tableHTML(title, subtitle, headers, rows) {
  let h = `<table border="1" cellspacing="0" cellpadding="6">
    <tr><th colspan="${headers.length}" style="background:#0b6e4f;color:#fff;font-size:14pt">${esc(title)}</th></tr>
    <tr><th colspan="${headers.length}" style="background:#e8f5e9;font-weight:normal">${esc(subtitle)}</th></tr>
    <tr>${headers.map(x => `<th style="background:#c8e6c9">${esc(x)}</th>`).join('')}</tr>`;
  for (const r of rows) h += `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${h}</body></html>`;
}
function csvText(rows) {
  return '\uFEFF' + rows.map(r => r.map(c => {
    const s = String(c == null ? '' : c).replace(/"/g, '""');
    return /[;"\n]/.test(s) ? `"${s}"` : s;
  }).join(';')).join('\r\n');
}
function downloadFile(filename, mime, content) {
  if (window.AndroidBridge && window.AndroidBridge.saveFile) {
    const b64 = btoa(unescape(encodeURIComponent(content)));
    const r = window.AndroidBridge.saveFile(filename, mime, b64);
    toast(r === 'ok' ? '💾 Tersimpan di folder Download' : 'Gagal menyimpan file');
    return;
  }
  const a = document.createElement('a');
  a.href = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(content);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  toast('💾 Mengunduh ' + filename);
}
function computeRekap(classId, from, to) {
  const d = S.data;
  const att = d.attendance.filter(a => a.classId === classId && a.date >= from && a.date <= to);
  const set = d.setoran.filter(x => x.classId === classId && x.date >= from && x.date <= to);
  const days = new Set(att.map(a => a.date)).size;
  return {
    days, totalSetoran: set.length,
    rows: d.students.filter(s => s.classId === classId).map(st => {
      const mine = att.filter(a => a.studentId === st.id);
      const c = { H: 0, S: 0, I: 0, A: 0 };
      mine.forEach(a => { if (c[a.status] != null) c[a.status]++; });
      const total = mine.length;
      return { name: st.name, H: c.H, S: c.S, I: c.I, A: c.A, total, pct: total ? Math.round(c.H / total * 100) : 0, setoran: set.filter(x => x.studentId === st.id).length };
    }).sort((a, b) => b.pct - a.pct || b.setoran - a.setoran || a.name.localeCompare(b.name)),
  };
}
function doExport(type, format, range, label) {
  const d = S.data;
  const cls = d.classes.find(c => c.id === ui.classId);
  const className = cls ? cls.name : '-';
  const fname = (type + '_' + label + '_' + className).replace(/\s+/g, '_').replace(/[^\w\-.]/g, '');
  if (type === 'rekap') {
    const { rows } = computeRekap(ui.classId, range.from, range.to);
    const headers = ['No', 'Nama Santri', 'Hadir', 'Sakit', 'Izin', 'Alpa', '% Kehadiran', 'Jumlah Setoran'];
    const data = rows.map((r, i) => [i + 1, r.name, r.H, r.S, r.I, r.A, r.pct + '%', r.setoran]);
    if (format === 'csv') return downloadFile(fname + '.csv', 'text/csv', csvText([headers, ...data]));
    return downloadFile(fname + (format === 'doc' ? '.doc' : '.xls'), format === 'doc' ? 'application/msword' : 'application/vnd.ms-excel',
      tableHTML(`Rekap Kehadiran & Setoran — ${className}`, `${label} • ${d.settings.schoolName}`, headers, data));
  }
  if (type === 'absensi') {
    const headers = ['Tanggal', 'Sesi', 'Nama Santri', 'Kelas', 'Status', 'Diabsen Oleh', 'Waktu'];
    const stN = {}, stC = {};
    d.students.forEach(s => { stN[s.id] = s.name; stC[s.id] = (d.classes.find(c => c.id === s.classId) || {}).name || ''; });
    const stat = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
    const rows = d.attendance.filter(a => a.classId === ui.classId && a.date >= range.from && a.date <= range.to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.session - b.session)
      .map(a => [a.date, d.settings.sessionNames[a.session - 1] || ('Jam ke-' + a.session), stN[a.studentId] || '?', stC[a.studentId], stat[a.status] || a.status, a.teacherName, fmtTime(a.ts)]);
    if (format === 'csv') return downloadFile(fname + '.csv', 'text/csv', csvText([headers, ...rows]));
    return downloadFile(fname + '.xls', 'application/vnd.ms-excel', tableHTML('Detail Absensi — ' + d.settings.schoolName, label, headers, rows));
  }
  if (type === 'setoran') {
    const headers = ['Tanggal', 'Nama Santri', 'Kelas', 'Setoran Ke Guru', 'Catatan Hafalan', 'Waktu'];
    const stN = {}, stC = {};
    d.students.forEach(s => { stN[s.id] = s.name; stC[s.id] = (d.classes.find(c => c.id === s.classId) || {}).name || ''; });
    const rows = d.setoran.filter(x => x.classId === ui.classId && x.date >= range.from && x.date <= range.to)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(x => [x.date, stN[x.studentId] || '?', stC[x.studentId], x.teacherName, x.note || '-', fmtTime(x.ts)]);
    if (format === 'csv') return downloadFile(fname + '.csv', 'text/csv', csvText([headers, ...rows]));
    return downloadFile(fname + '.xls', 'application/vnd.ms-excel', tableHTML('Detail Setoran Hafalan — ' + d.settings.schoolName, label, headers, rows));
  }
}

/* ---------------- LOGIN ---------------- */
function renderLogin() {
  const teachers = (S && S.data.teachers) || [];
  document.getElementById('app').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <img class="login-logo" src="icon-512.png" alt="logo">
    <div class="login-title">Absensi DM Albayan</div>
    <div class="login-sub">Masuk sebagai guru untuk mengabsen &amp; mencatat setoran hafalan</div>
    <div class="teacher-list" id="tlist">
      ${teachers.map(t => `<button class="teacher-item" data-id="${t.id}"><span class="avatar">${esc(initials(t.name))}</span>${esc(t.name)}</button>`).join('') || '<div class="empty">Belum ada guru terdaftar</div>'}
    </div>
    <div id="pinbox" style="display:none">
      <div class="field"><label>Masukkan PIN <b id="pinname"></b></label>
      <div class="pin-row"><input id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" style="flex:1;padding:11px 12px;border:1.5px solid #dbe5df;border-radius:10px">
      <button class="btn small" style="width:auto" id="pinGo">Masuk</button></div></div>
    </div>
    <button class="link-btn" id="toggleReg">＋ Daftar sebagai guru baru</button>
    <div id="regbox" style="display:none">
      <div class="field"><label>Nama Guru</label><input id="regName" placeholder="cth: Ust. Fulan"></div>
      <div class="field"><label>PIN (min. 4 angka)</label><input id="regPin" type="password" inputmode="numeric" maxlength="8" placeholder="••••"></div>
      <button class="btn" id="regGo">Daftar &amp; Masuk</button>
    </div>
    <div class="hint">💡 Demo awal: <b>Ust. Ahmad</b> — PIN <b>1234</b></div>
  </div></div>`;

  let pickId = null;
  document.querySelectorAll('#tlist .teacher-item').forEach(b => b.onclick = () => {
    pickId = b.dataset.id;
    document.getElementById('pinbox').style.display = 'block';
    document.getElementById('regbox').style.display = 'none';
    document.getElementById('pinname').textContent = b.textContent.trim();
    document.getElementById('pin').value = '';
    document.getElementById('pin').focus();
  });
  const doLogin = () => {
    const t = teachers.find(x => x.id === pickId);
    if (!t || t.pin !== document.getElementById('pin').value.trim()) return toast('❌ PIN salah');
    me = { id: t.id, name: t.name };
    localStorage.setItem('dm_me', JSON.stringify(me));
    render();
  };
  document.getElementById('pinGo').onclick = doLogin;
  document.getElementById('pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('toggleReg').onclick = () => {
    const r = document.getElementById('regbox');
    r.style.display = r.style.display === 'none' ? 'block' : 'none';
    document.getElementById('pinbox').style.display = 'none';
  };
  document.getElementById('regGo').onclick = () => {
    const name = document.getElementById('regName').value.trim();
    const pin = document.getElementById('regPin').value.trim();
    if (!name || pin.length < 4) return toast('❌ Nama wajib & PIN minimal 4 angka');
    if (teachers.some(t => t.name.toLowerCase() === name.toLowerCase())) return toast('❌ Nama sudah terdaftar, silakan login');
    const id = uid();
    w('teachers/' + id, { id, name, pin });
    me = { id, name }; localStorage.setItem('dm_me', JSON.stringify(me));
    toast('✅ Selamat datang, ' + name);
  };
}

/* ---------------- ABSENSI ---------------- */
function attMap() {
  const m = {};
  for (const a of S.data.attendance) m[`${a.date}|${a.classId}|${a.session}|${a.studentId}`] = a;
  return m;
}
function renderAbsensi() {
  const d = S.data;
  const cls = d.classes.find(c => c.id === ui.classId);
  const students = d.students.filter(s => s.classId === ui.classId).sort((a, b) => a.name.localeCompare(b.name));
  const am = attMap();
  const counts = { H: 0, S: 0, I: 0, A: 0 };
  students.forEach(st => { const a = am[`${ui.date}|${ui.classId}|${ui.session}|${st.id}`]; if (a) counts[a.status]++; });
  const belum = students.length - (counts.H + counts.S + counts.I + counts.A);

  const rows = students.map(st => {
    const a = am[`${ui.date}|${ui.classId}|${ui.session}|${st.id}`];
    const btn = (code, label) => `<button class="st-btn ${code} ${a && a.status === code ? 'on' : ''}" data-sid="${st.id}" data-st="${code}">${label}</button>`;
    return `<div class="stu">
      <span class="avatar">${esc(initials(st.name))}</span>
      <div class="nm"><b>${esc(st.name)}</b>${a ? `<small>diabsen ${esc(a.teacherName)} • ${fmtTime(a.ts)}</small>` : '<small>belum diabsen</small>'}</div>
      <div class="st-btns">${btn('H', 'H')}${btn('S', 'S')}${btn('I', 'I')}${btn('A', 'A')}</div>
    </div>`;
  }).join('') || '<div class="empty">Belum ada murid di kelas ini.<br>Tambahkan lewat menu <b>Atur</b>.</div>';

  return `
  <div class="page">
    <div class="card">
      <div class="row2">
        <div class="field"><label>Kelas</label>
          <select id="fClass">${d.classes.map(c => `<option value="${c.id}" ${c.id === ui.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Tanggal</label><input type="date" id="fDate" value="${ui.date}"></div>
      </div>
      <label style="font-size:12px;font-weight:700;color:var(--muted)">Sesi Pelajaran (${d.settings.sessions} sesi/hari)</label>
      <div class="pills" style="margin-top:5px">
        ${d.settings.sessionNames.map((n, i) => `<button class="pill ${i + 1 === ui.session ? 'active' : ''}" data-ses="${i + 1}">${esc(n)}</button>`).join('')}
      </div>
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <h3 style="margin:0">Daftar Murid — ${esc(cls ? cls.name : '-')}</h3>
        <button class="btn small ghost" id="allH">✓ Semua Hadir</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">${fmtDateID(ui.date)}</div>
      ${rows}
      <div class="chips">
        <span class="chip h">Hadir: ${counts.H}</span><span class="chip s">Sakit: ${counts.S}</span>
        <span class="chip i">Izin: ${counts.I}</span><span class="chip a">Alpa: ${counts.A}</span>
        <span class="chip">Belum: ${belum}</span>
      </div>
    </div>
    <p class="note" style="text-align:center">H = Hadir • S = Sakit • I = Izin • A = Alpa.<br>Status langsung terlihat oleh semua guru.</p>
  </div>`;
}
function bindAbsensi() {
  const fc = document.getElementById('fClass');
  if (fc) fc.onchange = () => { ui.classId = fc.value; render(); };
  const fd = document.getElementById('fDate');
  if (fd) fd.onchange = () => { ui.date = fd.value || todayStr(); render(); };
  document.querySelectorAll('.pill[data-ses]').forEach(p => p.onclick = () => { ui.session = Number(p.dataset.ses); render(); });
  document.querySelectorAll('.st-btn').forEach(b => b.onclick = () => {
    const code = b.dataset.st;
    const key = `${ui.date}_${ui.classId}_${ui.session}_${b.dataset.sid}`;
    const a = attMap()[`${ui.date}|${ui.classId}|${ui.session}|${b.dataset.sid}`];
    if (a && a.status === code) wdel('attendance/' + key);
    else w('attendance/' + key, { id: key, classId: ui.classId, date: ui.date, session: ui.session, studentId: b.dataset.sid, status: code, teacherName: me.name, ts: Date.now() });
  });
  const all = document.getElementById('allH');
  if (all) all.onclick = () => {
    const sids = S.data.students.filter(s => s.classId === ui.classId).map(s => s.id);
    if (!sids.length) return;
    const up = {};
    sids.forEach(sid => {
      const key = `${ui.date}_${ui.classId}_${ui.session}_${sid}`;
      up['attendance/' + key] = { id: key, classId: ui.classId, date: ui.date, session: ui.session, studentId: sid, status: 'H', teacherName: me.name, ts: Date.now() };
    });
    R.update(up); toast('✅ Semua ditandai hadir');
  };
}

/* ---------------- SETORAN ---------------- */
function renderSetoran() {
  const d = S.data;
  const cls = d.classes.find(c => c.id === ui.classId);
  const students = d.students.filter(s => s.classId === ui.classId).sort((a, b) => a.name.localeCompare(b.name));
  const attToday = {};
  for (const a of d.attendance) if (a.classId === ui.classId && a.date === ui.date) {
    const cur = attToday[a.studentId];
    if (!cur || (a.session > cur.session)) attToday[a.studentId] = a;
  }
  const setMap = {};
  for (const x of d.setoran) if (x.classId === ui.classId && x.date === ui.date) setMap[x.studentId] = x;
  const statBadge = { H: ['h', 'Hadir'], S: ['s', 'Sakit'], I: ['i', 'Izin'], A: ['a', 'Alpa'] };

  const rows = students.map(st => {
    const att = attToday[st.id];
    const st2 = setMap[st.id];
    const badge = att ? `<span class="badge ${statBadge[att.status][0]}">${statBadge[att.status][1]}</span>` : '<span class="badge no">Belum absen</span>';
    return `<div class="stu" style="flex-wrap:wrap">
      <span class="avatar">${esc(initials(st.name))}</span>
      <div class="nm"><b>${esc(st.name)}</b><small>absen terakhir: ${att ? esc(att.teacherName) + ' • ' + fmtTime(att.ts) : '-'}</small></div>
      ${badge}
      ${st2
        ? `<div class="setor-done" style="flex-basis:100%">✅ Sudah setoran → <b>${esc(st2.teacherName)}</b>${st2.note ? ' — ' + esc(st2.note) : ''}<button class="x" data-del="${st2.id}">✕</button></div>`
        : `<button class="btn small ${att && att.status === 'H' ? '' : 'ghost'}" style="width:auto" data-setor="${st.id}">🎙 Setor</button>`}
    </div>`;
  }).join('') || '<div class="empty">Belum ada murid.</div>';

  return `
  <div class="page">
    <div class="card">
      <div class="row2">
        <div class="field"><label>Kelas</label>
          <select id="fClass">${d.classes.map(c => `<option value="${c.id}" ${c.id === ui.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Tanggal</label><input type="date" id="fDate" value="${ui.date}"></div>
      </div>
    </div>
    <div class="card">
      <h3>Setoran Hafalan — ${esc(cls ? cls.name : '-')} (${fmtDateID(ui.date)})</h3>
      ${rows}
      <div class="chips"><span class="chip h">Sudah setoran: ${Object.keys(setMap).length}</span><span class="chip">Total murid: ${students.length}</span></div>
    </div>
    <p class="note" style="text-align:center">Tandai murid yang sudah maju setoran dan pilih guru yang disetori.<br>Semua guru dapat melihatnya secara langsung.</p>
  </div>
  <div class="modal-bg" id="modalBg" style="display:none"><div class="modal">
    <h3 id="modalTitle">Setoran Hafalan</h3>
    <div class="field"><label>Setor ke Guru</label>
      <select id="mGuru">${d.teachers.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Catatan Hafalan (opsional)</label>
      <input id="mNote" placeholder="cth: An-Naba ayat 1–20"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="mCancel">Batal</button>
      <button class="btn" id="mSave">💾 Simpan</button>
    </div>
  </div></div>`;
}
function bindSetoran() {
  const fc = document.getElementById('fClass');
  if (fc) fc.onchange = () => { ui.classId = fc.value; render(); };
  const fd = document.getElementById('fDate');
  if (fd) fd.onchange = () => { ui.date = fd.value || todayStr(); render(); };
  let sid = null;
  document.querySelectorAll('[data-setor]').forEach(b => b.onclick = () => {
    sid = b.dataset.setor;
    const st = S.data.students.find(x => x.id === sid);
    document.getElementById('modalTitle').textContent = 'Setoran — ' + (st ? st.name : '');
    document.getElementById('mNote').value = '';
    document.getElementById('modalBg').style.display = 'flex';
  });
  const bg = document.getElementById('modalBg');
  if (bg) {
    document.getElementById('mCancel').onclick = () => bg.style.display = 'none';
    bg.onclick = e => { if (e.target === bg) bg.style.display = 'none'; };
    document.getElementById('mSave').onclick = () => {
      const key = `${ui.date}_${sid}`;
      w('setoran/' + key, { id: key, classId: ui.classId, date: ui.date, studentId: sid, teacherName: document.getElementById('mGuru').value, note: document.getElementById('mNote').value.trim(), ts: Date.now() });
      toast('✅ Setoran tersimpan');
    };
  }
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => wdel('setoran/' + b.dataset.del));
}

/* ---------------- REKAP ---------------- */
function renderRekap() {
  const d = S.data;
  const cls = d.classes.find(c => c.id === ui.classId);
  const sems = semesterList(6);
  if (ui.rekapSemester > sems.length - 1) ui.rekapSemester = 0;
  const range = ui.rekapMode === 'bulan' ? monthRange(ui.rekapMonth) : sems[ui.rekapSemester];
  const label = ui.rekapMode === 'bulan' ? 'Bulan ' + monthLabel(ui.rekapMonth) : sems[ui.rekapSemester].label;
  const { rows, days, totalSetoran } = computeRekap(ui.classId, range.from, range.to);
  const rajinHadir = [...rows].filter(r => r.H > 0).sort((a, b) => b.H - a.H || b.pct - a.pct).slice(0, 3);
  const rajinSetor = [...rows].filter(r => r.setoran > 0).sort((a, b) => b.setoran - a.setoran).slice(0, 3);
  const medal = ['🥇', '', '🥉'];

  return `
  <div class="page">
    <div class="card">
      <div class="field"><label>Kelas</label>
        <select id="fClass">${d.classes.map(c => `<option value="${c.id}" ${c.id === ui.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="seg">
        <button class="${ui.rekapMode === 'bulan' ? 'on' : ''}" data-mode="bulan">📅 Bulanan</button>
        <button class="${ui.rekapMode === 'semester' ? 'on' : ''}" data-mode="semester">🎓 Semester</button>
      </div>
      ${ui.rekapMode === 'bulan'
        ? `<div class="field"><label>Pilih Bulan</label><input type="month" id="fMonth" value="${ui.rekapMonth}"></div>`
        : `<div class="field"><label>Pilih Semester</label><select id="fSem">${sems.map((s, i) => `<option value="${i}" ${i === ui.rekapSemester ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>`}
    </div>

    <div class="rank-cards">
      <div class="rank-card"><h4>🏆 Paling Rajin Hadir</h4>
        ${rajinHadir.length ? rajinHadir.map((r, i) => `<div style="font-size:13px;padding:2px 0">${medal[i]} <b>${esc(r.name)}</b> <small style="display:inline">(${r.H}x hadir)</small></div>`).join('') : '<small>Belum ada data</small>'}</div>
      <div class="rank-card"><h4>🏆 Paling Rajin Setoran</h4>
        ${rajinSetor.length ? rajinSetor.map((r, i) => `<div style="font-size:13px;padding:2px 0">${medal[i]} <b>${esc(r.name)}</b> <small style="display:inline">(${r.setoran}x setor)</small></div>`).join('') : '<small>Belum ada data</small>'}</div>
    </div>

    <div class="card">
      <h3>Rekap ${esc(label)}</h3>
      <div class="summary-line"><span>Hari aktif mengabsen</span><b>${days} hari</b></div>
      <div class="summary-line"><span>Total setoran hafalan</span><b>${totalSetoran} kali</b></div>
      <div style="overflow-x:auto;margin-top:8px">
      ${rows.length ? `<table class="rekap">
        <tr><th>#</th><th>Nama</th><th>H</th><th>S</th><th>I</th><th>A</th><th>%</th><th>Setor</th></tr>
        ${rows.map((r, i) => `<tr class="${i < 3 && (r.H + r.setoran) > 0 ? 'top' : ''}"><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${r.H}</td><td>${r.S}</td><td>${r.I}</td><td>${r.A}</td><td><b>${r.pct}%</b></td><td>${r.setoran}</td></tr>`).join('')}
      </table>` : '<div class="empty">Belum ada murid di kelas ini.</div>'}
      </div>
    </div>

    <div class="card">
      <h3>⬇️ Download Dokumen</h3>
      <div class="dl-grid">
        <button class="btn" data-exp="rekap|xls">📊 Rekap (Excel)</button>
        <button class="btn gold" data-exp="rekap|doc">📄 Rekap (Dokumen)</button>
        <button class="btn ghost" data-exp="absensi|xls">📋 Detail Absensi</button>
        <button class="btn ghost" data-exp="setoran|xls">🎙 Detail Setoran</button>
        <button class="btn ghost" data-exp="rekap|csv">CSV Rekap</button>
        <button class="btn ghost" data-exp="absensi|csv">CSV Absensi</button>
      </div>
      <p class="note">File Excel (.xls) &amp; dokumen (.doc) bisa dibuka di HP/laptop. Periode: ${range.from} s/d ${range.to}.</p>
    </div>
  </div>`;
}
function bindRekap() {
  const fc = document.getElementById('fClass');
  if (fc) fc.onchange = () => { ui.classId = fc.value; render(); };
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { ui.rekapMode = b.dataset.mode; render(); });
  const fm = document.getElementById('fMonth');
  if (fm) fm.onchange = () => { ui.rekapMonth = fm.value || todayStr().slice(0, 7); render(); };
  const fs = document.getElementById('fSem');
  if (fs) fs.onchange = () => { ui.rekapSemester = Number(fs.value); render(); };
  document.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
    const [type, format] = b.dataset.exp.split('|');
    const sems = semesterList(6);
    const range = ui.rekapMode === 'bulan' ? monthRange(ui.rekapMonth) : sems[ui.rekapSemester];
    const label = ui.rekapMode === 'bulan' ? monthLabel(ui.rekapMonth) : sems[ui.rekapSemester].label;
    doExport(type, format, range, label);
  });
}

/* ---------------- PENGATURAN ---------------- */
function renderPengaturan() {
  const d = S.data;
  return `
  <div class="page">
    <div class="card">
      <h3>👤 Guru</h3>
      <div class="item-row"><span class="avatar">${esc(initials(me.name))}</span>
        <span class="grow">${esc(me.name)}</span>
        <button class="btn small ghost" id="logout">Keluar</button></div>
      <p class="note">💡 Untuk memasang seperti aplikasi di HP: menu browser ⋮ → <b>“Instal aplikasi”</b> / <b>“Tambahkan ke layar utama”</b>.</p>
    </div>

    <div class="card">
      <h3>⏰ Jumlah Sesi Masuk Pelajaran per Hari</h3>
      <div class="field"><label>Banyaknya sesi (1–12)</label>
        <input type="number" id="setSessions" min="1" max="12" value="${d.settings.sessions}"></div>
      <div id="sesNames">
        ${d.settings.sessionNames.map((n, i) => `<div class="field"><label>Nama sesi ${i + 1}</label><input class="sesName" value="${esc(n)}" placeholder="Jam ke-${i + 1}"></div>`).join('')}
      </div>
      <button class="btn" id="saveSessions">💾 Simpan Pengaturan Sesi</button>
      <p class="note">Contoh: 6 sesi = murid diabsen 6 kali sehari. Nama sesi bebas diubah (mis. “Halaqah Pagi”).</p>
    </div>

    <div class="card">
      <h3>🏫 Kelas &amp; Murid</h3>
      ${d.classes.map(c => {
        const studs = d.students.filter(s => s.classId === c.id);
        return `<div style="margin-bottom:12px">
          <div class="item-row"><span class="grow" style="font-weight:800">${esc(c.name)} <small style="color:var(--muted);font-weight:400">(${studs.length} murid)</small></span>
            <button class="icon-btn" data-delclass="${c.id}" title="Hapus kelas">🗑</button></div>
          ${studs.map(s => `<div class="item-row" style="padding-left:10px"><span class="grow" style="font-weight:500">${esc(s.name)}</span><button class="icon-btn" data-delstu="${s.id}">✕</button></div>`).join('')}
          <div class="add-row"><input data-addstu="${c.id}" placeholder="Nama murid baru…"><button class="btn small" data-addstubtn="${c.id}">＋</button></div>
        </div>`;
      }).join('') || '<div class="empty">Belum ada kelas</div>'}
      <div class="add-row"><input id="newClass" placeholder="Nama kelas baru…"><button class="btn small" id="addClass">＋ Kelas</button></div>
    </div>

    <div class="card">
      <h3>👥 Daftar Guru</h3>
      ${d.teachers.map(t => `<div class="item-row"><span class="avatar">${esc(initials(t.name))}</span><span class="grow">${esc(t.name)}</span>${d.teachers.length > 1 ? `<button class="icon-btn" data-delteacher="${t.id}">✕</button>` : ''}</div>`).join('')}
      <div class="add-row"><input id="newTeacher" placeholder="Nama guru baru…"><input id="newTeacherPin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" style="max-width:90px"><button class="btn small" id="addTeacher">＋</button></div>
      <p class="note">Semua guru yang membuka aplikasi ini melihat data absensi &amp; setoran yang sama secara langsung.</p>
    </div>

    <div class="card">
      <h3>🗂 Data</h3>
      <button class="btn ghost" id="backup">⬇️ Backup (JSON)</button>
      <button class="btn danger" style="margin-top:9px" id="reset">♻️ Reset Semua Data</button>
    </div>

    <div class="card">
      <h3>🔐 Keamanan Admin</h3>
      <div class="field"><label>Ganti PIN Admin</label><input id="newAdminPin" type="password" inputmode="numeric" placeholder="PIN baru (min. 4 angka)"></div>
      <button class="btn" id="saveAdminPin">💾 Simpan PIN Admin</button>
      <button class="btn ghost" style="margin-top:9px" id="adminLogout">🚪 Keluar Mode Admin</button>
      <p class="note">PIN admin diminta saat membuka APK Admin. Beritahu hanya kepada pengelola.</p>
    </div>
  </div>`;
}
function bindPengaturan() {
  document.getElementById('logout').onclick = () => { localStorage.removeItem('dm_me'); me = null; render(); };

  const ss = document.getElementById('setSessions');
  ss.oninput = () => {
    const n = Math.max(1, Math.min(12, Number(ss.value) || 1));
    const box = document.getElementById('sesNames');
    const cur = [...box.querySelectorAll('.sesName')].map(i => i.value);
    let html = '';
    for (let i = 0; i < n; i++) html += `<div class="field"><label>Nama sesi ${i + 1}</label><input class="sesName" value="${esc(cur[i] || '')}" placeholder="Jam ke-${i + 1}"></div>`;
    box.innerHTML = html;
  };
  document.getElementById('saveSessions').onclick = () => {
    const names = [...document.querySelectorAll('.sesName')].map(i => i.value.trim() || ('Jam ke-' + (i + 1)));
    const sn = {}; names.forEach((n, i) => sn['s' + (i + 1)] = n);
    w('settings', { schoolName: S.data.settings.schoolName, sessions: Math.max(1, Math.min(12, Number(ss.value) || 1)), sessionNames: sn });
    toast('✅ Pengaturan sesi disimpan');
  };

  document.getElementById('addClass').onclick = () => {
    const name = document.getElementById('newClass').value.trim();
    if (!name) return toast('❌ Nama kelas wajib diisi');
    const id = uid();
    w('classes/' + id, { id, name });
  };
  document.querySelectorAll('[data-delclass]').forEach(b => b.onclick = async () => {
    if (!await askConfirm('Hapus kelas ini beserta semua murid & data absensinya?')) return;
    const cid = b.dataset.delclass;
    const up = { ['classes/' + cid]: null };
    S.data.students.filter(s => s.classId === cid).forEach(s => { up['students/' + s.id] = null; });
    S.data.attendance.filter(a => a.classId === cid).forEach(a => { up['attendance/' + a.id] = null; });
    S.data.setoran.filter(x => x.classId === cid).forEach(x => { up['setoran/' + x.id] = null; });
    R.update(up);
  });
  document.querySelectorAll('[data-addstubtn]').forEach(b => b.onclick = () => {
    const inp = document.querySelector(`[data-addstu="${b.dataset.addstubtn}"]`);
    const name = inp.value.trim();
    if (!name) return toast('❌ Nama murid wajib diisi');
    const id = uid();
    w('students/' + id, { id, classId: b.dataset.addstubtn, name });
  });
  document.querySelectorAll('[data-delstu]').forEach(b => b.onclick = async () => {
    if (!await askConfirm('Hapus murid ini beserta datanya?')) return;
    const sid = b.dataset.delstu;
    const up = { ['students/' + sid]: null };
    S.data.attendance.filter(a => a.studentId === sid).forEach(a => { up['attendance/' + a.id] = null; });
    S.data.setoran.filter(x => x.studentId === sid).forEach(x => { up['setoran/' + x.id] = null; });
    R.update(up);
  });
  document.getElementById('addTeacher').onclick = () => {
    const name = document.getElementById('newTeacher').value.trim();
    const pin = document.getElementById('newTeacherPin').value.trim();
    if (!name || pin.length < 4) return toast('❌ Nama wajib & PIN minimal 4 angka');
    const id = uid();
    w('teachers/' + id, { id, name, pin });
    toast('✅ Guru ditambahkan');
  };
  document.querySelectorAll('[data-delteacher]').forEach(b => b.onclick = async () => {
    if (!await askConfirm('Hapus guru ini?')) return;
    wdel('teachers/' + b.dataset.delteacher);
  });
  document.getElementById('backup').onclick = () => {
    downloadFile('backup-absensi-dm-albayan-' + todayStr() + '.json', 'application/json', JSON.stringify(S.data, null, 2));
  };
  document.getElementById('reset').onclick = async () => {
    if (!await askConfirm('Yakin? SEMUA data absensi, setoran, kelas, murid & guru akan dikembalikan ke awal.')) return;
    R.set(buildSeed());
    toast('♻️ Data direset');
  };
  document.getElementById('saveAdminPin').onclick = () => {
    const p = document.getElementById('newAdminPin').value.trim();
    if (p.length < 4) return toast('❌ PIN minimal 4 angka');
    w('settings', { schoolName: S.data.settings.schoolName, sessions: S.data.settings.sessions, adminPin: p, sessionNames: S.data.settings.sessionNames });
    toast('✅ PIN admin disimpan');
  };
  document.getElementById('adminLogout').onclick = () => {
    localStorage.removeItem('dm_admin_ok');
    render();
  };
}

/* ---------------- SHELL / ROUTER ---------------- */
const NAV = [
  { id: 'absensi', label: 'Absensi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4M15 2v4M8.5 12l2.5 2.5 4.5-5"/></svg>' },
  { id: 'setoran', label: 'Setoran', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h13"/><path d="M9 7h6M9 11h4"/></svg>' },
  { id: 'rekap', label: 'Rekap', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/></svg>' },
  { id: 'pengaturan', label: 'Atur', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 7.07-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>' },
];
function renderAdminGate() {
  document.getElementById('app').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <div class="logo" style="font-size:44px;text-align:center">🔐</div>
    <div class="login-title">Mode Admin</div>
    <div class="login-sub">Khusus pengelola — masukkan PIN admin</div>
    <div class="field"><label>PIN Admin</label><input id="gPin" type="password" inputmode="numeric" placeholder="•••••"></div>
    <button class="btn" id="gGo">Masuk sebagai Admin</button>
  </div></div>`;
  const go = () => {
    if (document.getElementById('gPin').value.trim() === S.data.settings.adminPin) {
      localStorage.setItem('dm_admin_ok', '1'); render();
    } else toast('❌ PIN admin salah');
  };
  document.getElementById('gGo').onclick = go;
  document.getElementById('gPin').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

function render() {
  if (!S) return;
  if (ADMIN_MODE && !localStorage.getItem('dm_admin_ok')) return renderAdminGate();
  if (!me) return renderLogin();
  let page = '';
  if (ui.view === 'absensi') page = renderAbsensi();
  else if (ui.view === 'setoran') page = renderSetoran();
  else if (ui.view === 'rekap') page = renderRekap();
  else if (ui.view === 'pengaturan') page = renderPengaturan();

  document.getElementById('app').innerHTML = `
  <div class="shell">
    <div class="topbar">
      <div class="topbar-row">
        <img src="icon-512.png" alt="">
        <div><h1>Absensi ${esc(S.data.settings.schoolName)}</h1><div class="who">👤 ${esc(me.name)}</div></div>
        <div class="live-dot"><i></i>Live</div>
      </div>
    </div>
    ${page}
  </div>
  <nav class="nav">
    ${(ADMIN_MODE ? NAV : NAV.filter(n => n.id !== 'pengaturan')).map(n => `<button class="${ui.view === n.id ? 'on' : ''}" data-nav="${n.id}">${n.icon}<span>${n.label}</span></button>`).join('')}
  </nav>`;

  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { ui.view = b.dataset.nav; render(); window.scrollTo(0, 0); });
  if (ui.view === 'absensi') bindAbsensi();
  else if (ui.view === 'setoran') bindSetoran();
  else if (ui.view === 'rekap') bindRekap();
  else if (ui.view === 'pengaturan') bindPengaturan();
}

/* ---------------- boot ---------------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
(function boot() {
  try { me = JSON.parse(localStorage.getItem('dm_me') || 'null'); } catch (e) { me = null; }
  document.getElementById('app').innerHTML = '<div class="login-wrap"><div class="login-card"><div class="logo" style="font-size:40px;text-align:center">🕌</div><div class="login-sub" id="loadmsg" style="text-align:center">Menghubungkan ke server…</div></div></div>';
  initFirebase();
})();
