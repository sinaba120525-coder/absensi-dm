/* ============================================================
   ABSENSI DM ALBAYAN — Server (Node.js, tanpa dependensi)
   Data tersimpan di data.json (otomatis dibuat + di-seed)
   Jalankan:  node server.js
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data.json');

let version = 1;
let db = null;
const sseClients = new Set();

/* ------------------------- DATA ------------------------- */
function seed() {
  return {
    settings: {
      schoolName: 'DM Albayan',
      sessions: 6,
      sessionNames: ['Jam ke-1', 'Jam ke-2', 'Jam ke-3', 'Jam ke-4', 'Jam ke-5', 'Jam ke-6'],
    },
    teachers: [{ id: 't1', name: 'Ust. Ahmad', pin: '1234' }],
    classes: [{ id: 'c1', name: 'Kelas Tahfidz A' }],
    students: [
      { id: 's1', classId: 'c1', name: 'Ahmad Fauzan' },
      { id: 's2', classId: 'c1', name: 'Bilal Ramadhan' },
      { id: 's3', classId: 'c1', name: 'Fadhil Hakim' },
      { id: 's4', classId: 'c1', name: 'Hanif Abdullah' },
      { id: 's5', classId: 'c1', name: 'Muhammad Rizki' },
      { id: 's6', classId: 'c1', name: 'Rafa Alfarizi' },
      { id: 's7', classId: 'c1', name: 'Zaid Alkhair' },
      { id: 's8', classId: 'c1', name: 'Naufal Zaki' },
    ],
    attendance: [], // {id,date,classId,session,studentId,status:H|S|I|A,teacherName,ts}
    setoran: [],    // {id,date,classId,studentId,teacherName,note,ts}
  };
}
function load() {
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { db = seed(); save(); }
}
function save() {
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}
function bump() {
  version++;
  save();
  const msg = `data: ${JSON.stringify({ version })}\n\n`;
  for (const res of sseClients) { try { res.write(msg); } catch (e) {} }
}
const uid = () => crypto.randomBytes(6).toString('hex');

/* ------------------------- HELPERS ------------------------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function serveStatic(req, res, pathname) {
  let p = pathname === '/' ? '/index.html' : pathname;
  p = path.normalize(p).replace(/^(\.\.[\/\\])+/, '');
  const candidates = [path.join(__dirname, 'public', p), path.join(__dirname, p)];
  const tryIdx = (i) => {
    if (i >= candidates.length) { res.writeHead(404); return res.end('404'); }
    const file = candidates[i];
    fs.readFile(file, (err, buf) => {
      if (err) return tryIdx(i + 1);
      const ext = path.extname(file).toLowerCase();
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': (types[ext] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  };
  tryIdx(0);
}

/* ------------------------- REKAP / EXPORT ------------------------- */
function computeRekap(classId, from, to) {
  const students = db.students.filter(s => s.classId === classId);
  const att = db.attendance.filter(a => a.classId === classId && a.date >= from && a.date <= to);
  const set = db.setoran.filter(x => x.classId === classId && x.date >= from && x.date <= to);
  const rows = students.map(st => {
    const mine = att.filter(a => a.studentId === st.id);
    const c = { H: 0, S: 0, I: 0, A: 0 };
    mine.forEach(a => { if (c[a.status] != null) c[a.status]++; });
    const total = mine.length;
    const setoran = set.filter(x => x.studentId === st.id).length;
    const pct = total ? Math.round((c.H / total) * 100) : 0;
    return { name: st.name, H: c.H, S: c.S, I: c.I, A: c.A, total, pct, setoran };
  });
  return rows;
}

function tableHTML(title, subtitle, headers, rows) {
  let h = `<table border="1" cellspacing="0" cellpadding="6">
    <tr><th colspan="${headers.length}" style="background:#0b6e4f;color:#fff;font-size:14pt">${esc(title)}</th></tr>
    <tr><th colspan="${headers.length}" style="background:#e8f5e9;font-weight:normal">${esc(subtitle)}</th></tr>
    <tr>${headers.map(x => `<th style="background:#c8e6c9">${esc(x)}</th>`).join('')}</tr>`;
  for (const r of rows) h += `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
  h += '</table>';
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${h}</body></html>`;
}
function csv(rows) {
  return '\uFEFF' + rows.map(r => r.map(c => {
    const s = String(c == null ? '' : c).replace(/"/g, '""');
    return /[;"\n]/.test(s) ? `"${s}"` : s;
  }).join(';')).join('\r\n');
}
function handleExport(res, q) {
  const type = q.get('type');
  const format = q.get('format') || 'xls';
  const classId = q.get('classId');
  const from = q.get('from') || '0000-00-00';
  const to = q.get('to') || '9999-99-99';
  const label = q.get('label') || '';
  const cls = db.classes.find(c => c.id === classId);
  const className = cls ? cls.name : 'Semua Kelas';
  let filename = 'absensi-dm-albayan';
  let content = '', contentType = 'application/octet-stream';

  if (type === 'rekap') {
    const rows = computeRekap(classId, from, to);
    rows.sort((a, b) => b.pct - a.pct || b.setoran - a.setoran);
    const headers = ['No', 'Nama Santri', 'Hadir', 'Sakit', 'Izin', 'Alpa', '% Kehadiran', 'Jumlah Setoran'];
    const data = rows.map((r, i) => [i + 1, r.name, r.H, r.S, r.I, r.A, r.pct + '%', r.setoran]);
    filename = `Rekap_${className}_${label}`.replace(/\s+/g, '_');
    if (format === 'csv') { content = csv([headers, ...data]); contentType = 'text/csv; charset=utf-8'; }
    else content = tableHTML(`Rekap Kehadiran & Setoran — ${className}`, `${label} • ${db.settings.schoolName}`, headers, data);
  } else if (type === 'absensi') {
    const headers = ['Tanggal', 'Sesi', 'Nama Santri', 'Kelas', 'Status', 'Diabsen Oleh', 'Waktu'];
    const stName = {}; db.students.forEach(s => stName[s.id] = s.name);
    const stCls = {}; db.students.forEach(s => stCls[s.id] = (db.classes.find(c => c.id === s.classId) || {}).name || '');
    const stat = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
    const rows = db.attendance
      .filter(a => a.date >= from && a.date <= to && (!classId || a.classId === classId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.session - b.session)
      .map(a => [a.date, db.settings.sessionNames[a.session - 1] || ('Jam ke-' + a.session), stName[a.studentId] || '?', stCls[a.studentId], stat[a.status] || a.status, a.teacherName, new Date(a.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })]);
    filename = `Absensi_${label}`.replace(/\s+/g, '_');
    if (format === 'csv') { content = csv([headers, ...rows]); contentType = 'text/csv; charset=utf-8'; }
    else content = tableHTML(`Detail Absensi — ${db.settings.schoolName}`, label, headers, rows);
  } else if (type === 'setoran') {
    const headers = ['Tanggal', 'Nama Santri', 'Kelas', 'Setoran Ke Guru', 'Catatan Hafalan', 'Waktu'];
    const stName = {}; db.students.forEach(s => stName[s.id] = s.name);
    const stCls = {}; db.students.forEach(s => stCls[s.id] = (db.classes.find(c => c.id === s.classId) || {}).name || '');
    const rows = db.setoran
      .filter(x => x.date >= from && x.date <= to && (!classId || x.classId === classId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(x => [x.date, stName[x.studentId] || '?', stCls[x.studentId], x.teacherName, x.note || '-', new Date(x.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })]);
    filename = `Setoran_${label}`.replace(/\s+/g, '_');
    if (format === 'csv') { content = csv([headers, ...rows]); contentType = 'text/csv; charset=utf-8'; }
    else content = tableHTML(`Detail Setoran Hafalan — ${db.settings.schoolName}`, label, headers, rows);
  } else { res.writeHead(400); return res.end('400'); }

  if (format === 'csv') { filename += '.csv'; }
  else if (format === 'doc') { filename += '.doc'; contentType = 'application/msword; charset=utf-8'; }
  else { filename += '.xls'; contentType = 'application/vnd.ms-excel; charset=utf-8'; }
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
  res.end(content);
}

/* ------------------------- ROUTER ------------------------- */
async function handleAPI(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/state') {
    const v = parseInt(q_get(url, 'v') || '0', 10);
    if (v === version) return sendJSON(res, 200, { version, unchanged: true });
    return sendJSON(res, 200, { version, data: db });
  }
  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ version })}\n\n`);
    sseClients.add(res);
    const iv = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(iv); sseClients.delete(res); });
    return;
  }
  if (req.method === 'GET' && p === '/api/export') return handleExport(res, url.searchParams);

  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'method' });
  const b = await readBody(req);

  if (p === '/api/register') {
    const name = String(b.name || '').trim();
    const pin = String(b.pin || '').trim();
    if (!name || pin.length < 4) return sendJSON(res, 400, { error: 'Nama wajib diisi & PIN minimal 4 angka' });
    if (db.teachers.some(t => t.name.toLowerCase() === name.toLowerCase())) return sendJSON(res, 400, { error: 'Nama guru sudah terdaftar, silakan login' });
    const t = { id: uid(), name, pin };
    db.teachers.push(t); bump();
    return sendJSON(res, 200, { teacher: { id: t.id, name: t.name } });
  }
  if (p === '/api/login') {
    const t = db.teachers.find(x => x.id === b.id);
    if (!t || t.pin !== String(b.pin || '').trim()) return sendJSON(res, 400, { error: 'PIN salah' });
    return sendJSON(res, 200, { teacher: { id: t.id, name: t.name } });
  }
  if (p === '/api/attendance') {
    const { classId, date, session, studentId, status } = b;
    const idx = db.attendance.findIndex(a => a.classId === classId && a.date === date && a.session === session && a.studentId === studentId);
    if (!status) { if (idx >= 0) db.attendance.splice(idx, 1); }
    else {
      const rec = { id: uid(), classId, date, session: Number(session), studentId, status, teacherName: b.teacherName || '?', ts: Date.now() };
      if (idx >= 0) { rec.id = db.attendance[idx].id; db.attendance[idx] = rec; }
      else db.attendance.push(rec);
    }
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/attendance/all-hadir') {
    const { classId, date, session, studentIds, teacherName } = b;
    for (const sid of studentIds || []) {
      const idx = db.attendance.findIndex(a => a.classId === classId && a.date === date && a.session === session && a.studentId === sid);
      const rec = { id: uid(), classId, date, session: Number(session), studentId: sid, status: 'H', teacherName: teacherName || '?', ts: Date.now() };
      if (idx >= 0) { rec.id = db.attendance[idx].id; db.attendance[idx] = rec; }
      else db.attendance.push(rec);
    }
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/setoran/add') {
    const { classId, date, studentId, teacherName, note } = b;
    const idx = db.setoran.findIndex(x => x.date === date && x.studentId === studentId);
    const rec = { id: uid(), classId, date, studentId, teacherName: teacherName || '?', note: note || '', ts: Date.now() };
    if (idx >= 0) { rec.id = db.setoran[idx].id; db.setoran[idx] = rec; }
    else db.setoran.push(rec);
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/setoran/delete') {
    db.setoran = db.setoran.filter(x => x.id !== b.id);
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/class/add') {
    const name = String(b.name || '').trim();
    if (!name) return sendJSON(res, 400, { error: 'Nama kelas wajib' });
    db.classes.push({ id: uid(), name }); bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/class/delete') {
    db.classes = db.classes.filter(c => c.id !== b.id);
    const sids = db.students.filter(s => s.classId === b.id).map(s => s.id);
    db.students = db.students.filter(s => s.classId !== b.id);
    db.attendance = db.attendance.filter(a => a.classId !== b.id);
    db.setoran = db.setoran.filter(x => x.classId !== b.id && !sids.includes(x.studentId));
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/student/add') {
    const name = String(b.name || '').trim();
    if (!name || !b.classId) return sendJSON(res, 400, { error: 'Nama murid wajib' });
    db.students.push({ id: uid(), classId: b.classId, name }); bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/student/delete') {
    db.students = db.students.filter(s => s.id !== b.id);
    db.attendance = db.attendance.filter(a => a.studentId !== b.id);
    db.setoran = db.setoran.filter(x => x.studentId !== b.id);
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/teacher/add') {
    const name = String(b.name || '').trim(); const pin = String(b.pin || '').trim();
    if (!name || pin.length < 4) return sendJSON(res, 400, { error: 'Nama wajib & PIN minimal 4 angka' });
    db.teachers.push({ id: uid(), name, pin }); bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/teacher/delete') {
    if (db.teachers.length <= 1) return sendJSON(res, 400, { error: 'Minimal harus ada 1 guru' });
    db.teachers = db.teachers.filter(t => t.id !== b.id); bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/settings') {
    const n = Math.max(1, Math.min(12, Number(b.sessions) || 1));
    const names = [];
    for (let i = 0; i < n; i++) names.push(String((b.sessionNames && b.sessionNames[i]) || '').trim() || ('Jam ke-' + (i + 1)));
    db.settings.sessions = n;
    db.settings.sessionNames = names;
    db.attendance = db.attendance.filter(a => a.session <= n);
    bump(); return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/reset') { db = seed(); version++; save(); bump(); return sendJSON(res, 200, { ok: true }); }

  sendJSON(res, 404, { error: 'not found' });
}
function q_get(url, k) { return url.searchParams.get(k); }

/* ------------------------- SERVER ------------------------- */
load();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleAPI(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    sendJSON(res, 500, { error: String(e) });
  }
});
server.listen(PORT, HOST, () => console.log(`✅ Absensi ${db.settings.schoolName} berjalan di http://${HOST}:${PORT}`));
