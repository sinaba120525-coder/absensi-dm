/* ============================================================
   ABSENSI DM ALBAYAN — Aplikasi Guru (client)
   ============================================================ */
'use strict';

let S = null;               // { version, data }
let me = null;              // guru yang login {id, name}
let deferredPrompt = null;  // PWA install prompt
const ui = {
  view: 'absensi',
  classId: null,
  date: todayStr(),
  session: 1,
  rekapMode: 'bulan',       // bulan | semester
  rekapMonth: todayStr().slice(0, 7),
  rekapSemester: 0,
};

/* ---------------- util ---------------- */
function todayStr() { return new Date().toLocaleDateString('en-CA'); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtTime(ts) { try { return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function fmtDateID(d) { try { return new Date(d + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } }
function initials(n) { return n.replace(/^(ust\.|ustadz|ustzh\.?|ibu|pak|bu)\s*/i, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('Server error ' + r.status));
  return j;
}

/* ---------------- data load + live sync ---------------- */
async function fetchState(force) {
  const v = (!force && S) ? S.version : 0;
  const j = await api('state?v=' + v);
  if (j.unchanged) return false;
  S = j;
  if (!ui.classId && S.data.classes.length) ui.classId = S.data.classes[0].id;
  if (!S.data.classes.some(c => c.id === ui.classId)) ui.classId = (S.data.classes[0] || {}).id || null;
  return true;
}

function startLive() {
  setInterval(async () => {
    try { if (await fetchState(false)) render(); } catch (e) {}
  }, 5000);
  try {
    const es = new EventSource('/api/events');
    es.onmessage = async () => { try { if (await fetchState(false)) render(); } catch (e) {} };
  } catch (e) {}
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) { try { if (await fetchState(false)) render(); } catch (e) {} }
  });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

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

/* ---------------- LOGIN ---------------- */
function renderLogin() {
  const teachers = (S && S.data.teachers) || [];
  document.getElementById('app').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <img class="login-logo" src="/icon-512.png" alt="logo">
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
    ${deferredPrompt ? '<button class="btn ghost" style="margin-top:10px" id="instBtn">📲 Instal Aplikasi di HP</button>' : ''}
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
  const doLogin = async () => {
    try {
      const j = await api('login', { id: pickId, pin: document.getElementById('pin').value });
      me = j.teacher; localStorage.setItem('dm_me', JSON.stringify(me)); render();
    } catch (e) { toast('❌ ' + e.message); }
  };
  document.getElementById('pinGo').onclick = doLogin;
  document.getElementById('pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('toggleReg').onclick = () => {
    const r = document.getElementById('regbox');
    r.style.display = r.style.display === 'none' ? 'block' : 'none';
    document.getElementById('pinbox').style.display = 'none';
  };
  document.getElementById('regGo').onclick = async () => {
    try {
      const j = await api('register', { name: document.getElementById('regName').value, pin: document.getElementById('regPin').value });
      me = j.teacher; localStorage.setItem('dm_me', JSON.stringify(me)); toast('✅ Selamat datang, ' + me.name); render();
    } catch (e) { toast('❌ ' + e.message); }
  };
  const ib = document.getElementById('instBtn');
  if (ib) ib.onclick = () => deferredPrompt && deferredPrompt.prompt();
}

/* ---------------- ABSENSI ---------------- */
function attendanceMap() {
  const m = {};
  for (const a of S.data.attendance) m[`${a.date}|${a.classId}|${a.session}|${a.studentId}`] = a;
  return m;
}

function renderAbsensi() {
  const d = S.data;
  const cls = d.classes.find(c => c.id === ui.classId);
  const students = d.students.filter(s => s.classId === ui.classId).sort((a, b) => a.name.localeCompare(b.name));
  const am = attendanceMap();
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
  }).join('') || '<div class="empty">Belum ada murid di kelas ini.<br>Tambahkan lewat menu <b>Pengaturan</b>.</div>';

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
  document.querySelectorAll('.st-btn').forEach(b => b.onclick = async () => {
    const code = b.dataset.st;
    const a = attendanceMap()[`${ui.date}|${ui.classId}|${ui.session}|${b.dataset.sid}`];
    try {
      await api('attendance', { classId: ui.classId, date: ui.date, session: ui.session, studentId: b.dataset.sid, status: a && a.status === code ? null : code, teacherName: me.name });
      await fetchState(true); render();
    } catch (e) { toast('❌ ' + e.message); }
  });
  const all = document.getElementById('allH');
  if (all) all.onclick = async () => {
    const sids = S.data.students.filter(s => s.classId === ui.classId).map(s => s.id);
    if (!sids.length) return;
    try { await api('attendance/all-hadir', { classId: ui.classId, date: ui.date, session: ui.session, studentIds: sids, teacherName: me.name }); await fetchState(true); render(); toast('✅ Semua ditandai hadir'); }
    catch (e) { toast('❌ ' + e.message); }
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
  const totalSetor = Object.keys(setMap).length;

  const rows = students.map(st => {
    const att = attToday[st.id];
    const st2 = setMap[st.id];
    const badge = att ? `<span class="badge ${statBadge[att.status][0]}">${statBadge[att.status][1]}</span>` : '<span class="badge no">Belum absen</span>';
    return `<div class="stu" style="flex-wrap:wrap">
      <span class="avatar">${esc(initials(st.name))}</span>
      <div class="nm"><b>${esc(st.name)}</b><small>${badge.outerHTML ? '' : ''}absen terakhir: ${att ? esc(att.teacherName) + ' • ' + fmtTime(att.ts) : '-'}</small></div>
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
      <div class="chips"><span class="chip h">Sudah setoran: ${totalSetor}</span><span class="chip">Total murid: ${students.length}</span></div>
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
    document.getElementById('mSave').onclick = async () => {
      try {
        await api('setoran/add', { classId: ui.classId, date: ui.date, studentId: sid, teacherName: document.getElementById('mGuru').value, note: document.getElementById('mNote').value.trim() });
        await fetchState(true); render(); toast('✅ Setoran tersimpan');
      } catch (e) { toast('❌ ' + e.message); }
    };
  }
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    try { await api('setoran/delete', { id: b.dataset.del }); await fetchState(true); render(); } catch (e) { toast('❌ ' + e.message); }
  });
}

/* ---------------- REKAP ---------------- */
function computeRekapClient(classId, from, to) {
  const d = S.data;
  const att = d.attendance.filter(a => a.classId === classId && a.date >= from && a.date <= to);
  const set = d.setoran.filter(x => x.classId === classId && x.date >= from && x.date <= to);
  const days = new Set(att.map(a => a.date)).size;
  return {
    days,
    totalSetoran: set.length,
    rows: d.students.filter(s => s.classId === classId).map(st => {
      const mine = att.filter(a => a.studentId === st.id);
      const c = { H: 0, S: 0, I: 0, A: 0 };
      mine.forEach(a => { if (c[a.status] != null) c[a.status]++; });
      const total = mine.length;
      return { name: st.name, H: c.H, S: c.S, I: c.I, A: c.A, total, pct: total ? Math.round(c.H / total * 100) : 0, setoran: set.filter(x => x.studentId === st.id).length };
    }).sort((a, b) => b.pct - a.pct || b.setoran - a.setoran || a.name.localeCompare(b.name)),
  };
}

function renderRekap() {
  const d = S.data;
  const cls = d.classes.find(c => c.id === ui.classId);
  const sems = semesterList(6);
  if (ui.rekapSemester > sems.length - 1) ui.rekapSemester = 0;
  const range = ui.rekapMode === 'bulan' ? monthRange(ui.rekapMonth) : sems[ui.rekapSemester];
  const label = ui.rekapMode === 'bulan' ? 'Bulan ' + monthLabel(ui.rekapMonth) : sems[ui.rekapSemester].label;
  const { rows, days, totalSetoran } = computeRekapClient(ui.classId, range.from, range.to);
  const rajinHadir = [...rows].filter(r => r.H > 0).sort((a, b) => b.H - a.H || b.pct - a.pct).slice(0, 3);
  const rajinSetor = [...rows].filter(r => r.setoran > 0).sort((a, b) => b.setoran - a.setoran).slice(0, 3);
  const medal = ['🥇', '🥈', '🥉'];
  const qs = (type, format) => `/api/export?type=${type}&format=${format}&classId=${encodeURIComponent(ui.classId)}&from=${range.from}&to=${range.to}&label=${encodeURIComponent(label + ' ' + (cls ? cls.name : ''))}`;

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
        <a class="btn" href="${qs('rekap', 'xls')}">📊 Rekap (Excel)</a>
        <a class="btn gold" href="${qs('rekap', 'doc')}">📄 Rekap (Dokumen)</a>
        <a class="btn ghost" href="${qs('absensi', 'xls')}">📋 Detail Absensi</a>
        <a class="btn ghost" href="${qs('setoran', 'xls')}">🎙 Detail Setoran</a>
        <a class="btn ghost" href="${qs('rekap', 'csv')}">CSV Rekap</a>
        <a class="btn ghost" href="${qs('absensi', 'csv')}">CSV Absensi</a>
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
      ${deferredPrompt ? '<button class="btn" style="margin-top:10px" id="instBtn">📲 Instal Aplikasi di HP Ini</button>' : '<p class="note">💡 Untuk memasang seperti aplikasi: menu browser ⋮ → <b>“Instal aplikasi”</b> / <b>“Tambahkan ke layar utama”</b>.</p>'}
    </div>

    <div class="card">
      <h3>⏰ Jumlah Sesi Masuk Pelajaran per Hari</h3>
      <div class="field"><label>Banyaknya sesi (1–12)</label>
        <input type="number" id="setSessions" min="1" max="12" value="${d.settings.sessions}"></div>
      <div id="sesNames">
        ${d.settings.sessionNames.map((n, i) => `<div class="field"><label>Nama sesi ${i + 1}</label><input class="sesName" value="${esc(n)}" placeholder="Jam ke-${i + 1}"></div>`).join('')}
      </div>
      <button class="btn" id="saveSessions">💾 Simpan Pengaturan Sesi</button>
      <p class="note">Contoh: 6 sesi = murid diabsen 6 kali sehari (Jam ke-1 s/d ke-6). Nama sesi bebas diubah (mis. “Halaqah Pagi”).</p>
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
      <p class="note">Semua guru yang login memakai aplikasi ini melihat data absensi &amp; setoran yang sama secara langsung.</p>
    </div>

    <div class="card">
      <h3>🗂 Data</h3>
      <div class="dl-grid">
        <button class="btn ghost" id="backup">⬇️ Backup (JSON)</button>
        <button class="btn danger" id="reset">♻️ Reset Semua Data</button>
      </div>
    </div>
  </div>`;
}

function bindPengaturan() {
  document.getElementById('logout').onclick = () => { localStorage.removeItem('dm_me'); me = null; render(); };
  const ib = document.getElementById('instBtn');
  if (ib) ib.onclick = () => deferredPrompt && deferredPrompt.prompt();

  const ss = document.getElementById('setSessions');
  ss.oninput = () => {
    const n = Math.max(1, Math.min(12, Number(ss.value) || 1));
    const box = document.getElementById('sesNames');
    const cur = [...box.querySelectorAll('.sesName')].map(i => i.value);
    let html = '';
    for (let i = 0; i < n; i++) html += `<div class="field"><label>Nama sesi ${i + 1}</label><input class="sesName" value="${esc(cur[i] || '')}" placeholder="Jam ke-${i + 1}"></div>`;
    box.innerHTML = html;
  };
  document.getElementById('saveSessions').onclick = async () => {
    const names = [...document.querySelectorAll('.sesName')].map(i => i.value);
    try { await api('settings', { sessions: Number(ss.value) || 1, sessionNames: names }); await fetchState(true); render(); toast('✅ Pengaturan sesi disimpan'); }
    catch (e) { toast('❌ ' + e.message); }
  };

  document.getElementById('addClass').onclick = async () => {
    try { await api('class/add', { name: document.getElementById('newClass').value }); await fetchState(true); render(); } catch (e) { toast('❌ ' + e.message); }
  };
  document.querySelectorAll('[data-delclass]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus kelas ini beserta semua murid & data absensinya?')) return;
    try { await api('class/delete', { id: b.dataset.delclass }); await fetchState(true); render(); } catch (e) { toast('❌ ' + e.message); }
  });
  document.querySelectorAll('[data-addstubtn]').forEach(b => b.onclick = async () => {
    const inp = document.querySelector(`[data-addstu="${b.dataset.addstubtn}"]`);
    try { await api('student/add', { classId: b.dataset.addstubtn, name: inp.value }); await fetchState(true); render(); } catch (e) { toast('❌ ' + e.message); }
  });
  document.querySelectorAll('[data-delstu]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus murid ini beserta datanya?')) return;
    try { await api('student/delete', { id: b.dataset.delstu }); await fetchState(true); render(); } catch (e) { toast('❌ ' + e.message); }
  });
  document.getElementById('addTeacher').onclick = async () => {
    try { await api('teacher/add', { name: document.getElementById('newTeacher').value, pin: document.getElementById('newTeacherPin').value }); await fetchState(true); render(); toast('✅ Guru ditambahkan'); } catch (e) { toast('❌ ' + e.message); }
  };
  document.querySelectorAll('[data-delteacher]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus guru ini?')) return;
    try { await api('teacher/delete', { id: b.dataset.delteacher }); await fetchState(true); render(); } catch (e) { toast('❌ ' + e.message); }
  });
  document.getElementById('backup').onclick = () => {
    const blob = new Blob([JSON.stringify(S.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup-absensi-dm-albayan-' + todayStr() + '.json';
    a.click();
  };
  document.getElementById('reset').onclick = async () => {
    if (!confirm('Yakin? SEMUA data absensi, setoran, kelas, murid & guru akan dikembalikan ke awal.')) return;
    try { await api('reset', {}); await fetchState(true); render(); toast('♻️ Data direset'); } catch (e) { toast('❌ ' + e.message); }
  };
}

/* ---------------- SHELL / ROUTER ---------------- */
const NAV = [
  { id: 'absensi', label: 'Absensi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4M15 2v4M8.5 12l2.5 2.5 4.5-5"/></svg>' },
  { id: 'setoran', label: 'Setoran', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h13"/><path d="M9 7h6M9 11h4"/></svg>' },
  { id: 'rekap', label: 'Rekap', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/></svg>' },
  { id: 'pengaturan', label: 'Atur', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.24l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>' },
];

function render() {
  if (!S) return;
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
        <img src="/icon-512.png" alt="">
        <div><h1>Absensi ${esc(S.data.settings.schoolName)}</h1><div class="who">👤 ${esc(me.name)}</div></div>
        <div class="live-dot"><i></i>Live</div>
      </div>
    </div>
    ${page}
  </div>
  <nav class="nav">
    ${NAV.map(n => `<button class="${ui.view === n.id ? 'on' : ''}" data-nav="${n.id}">${n.icon}<span>${n.label}</span></button>`).join('')}
  </nav>`;

  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { ui.view = b.dataset.nav; render(); window.scrollTo(0, 0); });
  if (ui.view === 'absensi') bindAbsensi();
  else if (ui.view === 'setoran') bindSetoran();
  else if (ui.view === 'rekap') bindRekap();
  else if (ui.view === 'pengaturan') bindPengaturan();
}

/* ---------------- boot ---------------- */
(async function boot() {
  try { me = JSON.parse(localStorage.getItem('dm_me') || 'null'); } catch (e) { me = null; }
  await fetchState(true);
  render();
  startLive();
})();
