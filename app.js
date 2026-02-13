const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co', SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
let sb; try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) } catch (e) { console.error(e) }

let curPath = '/', notes = [], active = null, saveT = null, viewMode = 'grid', sortBy = 'name';
let locks = JSON.parse(localStorage.getItem('pv_locks') || '{}');
let trashN = JSON.parse(localStorage.getItem('pv_trn') || '[]');
let trashF = JSON.parse(localStorage.getItem('pv_trf') || '[]');
let theme = localStorage.getItem('pv_theme') || 'light';
let folders = JSON.parse(localStorage.getItem('pv_folds') || '["All","Personal","Work","Ideas"]');
let curFolder = 'All';

// INIT
window.onload = async () => {
  setTheme(theme);
  try { const { data: { session } } = await sb.auth.getSession(); done(); if (session) boot(session.user) } catch (e) { done() }
};
function done() { const l = document.getElementById('loader'); l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 400) }

// THEME
function setTheme(t) {
  theme = t; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('pv_theme', t);
  const i = document.getElementById('thIcon'), l = document.getElementById('thLabel');
  if (i) i.className = t === 'dark' ? 'ri-moon-line' : 'ri-sun-line';
  if (l) l.textContent = t === 'dark' ? 'Dark Mode' : 'Light Mode';
}
function toggleTheme() { setTheme(theme === 'dark' ? 'light' : 'dark') }

// AUTH
async function login() {
  const e = document.getElementById('email').value, p = document.getElementById('pass').value;
  const b = document.getElementById('lbtn'), er = document.getElementById('aerr');
  b.textContent = 'Signing in...'; er.textContent = '';
  try { const { data, error } = await sb.auth.signInWithPassword({ email: e, password: p }); if (error) throw error; boot(data.user) }
  catch (err) { er.textContent = err.message; b.textContent = 'Sign In' }
}
async function logout() { await sb.auth.signOut(); location.reload() }

function boot(u) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('uemail').textContent = u.email;
  document.getElementById('uav').textContent = u.email[0].toUpperCase();
  refreshDrive(); loadNotes(); updateBadge(); renderTabs();
}

// NAVIGATION
function go(v) {
  document.querySelectorAll('.s-item[data-v]').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.s-item[data-v="${v}"]`); if (nav) nav.classList.add('active');
  ['drive', 'notes', 'trash'].forEach(id => {
    const el = document.getElementById('view-' + id);
    if (el) { el.classList.add('hidden'); el.style.display = '' }
  });
  const view = document.getElementById('view-' + v);
  if (view) { view.classList.remove('hidden'); if (v !== 'notes') view.style.display = 'flex' }
  if (v === 'notes') { if (!active && notes.length) selectNote(notes[0].id) }
  if (v === 'trash') renderTrash();
}

// ===== DRIVE =====
async function refreshDrive() {
  const p = curPath === '/' ? '' : curPath;
  const { data } = await sb.storage.from('files').list(p);
  const c = document.getElementById('dgrid'), cr = document.getElementById('dpath');
  c.innerHTML = ''; cr.textContent = curPath === '/' ? 'Home' : curPath;

  if (curPath !== '/') {
    const back = mk('div', 'fcard' + (viewMode === 'list' ? ' row' : ''));
    back.innerHTML = `<i class="ri-arrow-up-line icon" style="color:var(--text3)"></i><span class="name">← Back</span>`;
    back.onclick = () => openPath('..'); c.appendChild(back);
  }
  if (data) {
    let list = data.filter(f => f.name !== '.keep');
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'date') list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sortBy === 'size') list.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
    list.forEach(f => {
      const dir = !f.metadata, icon = dir ? 'ri-folder-3-fill' : ficon(f.name), color = dir ? 'var(--primary)' : 'var(--text3)';
      const el = mk('div', 'fcard' + (viewMode === 'list' ? ' row' : ''));
      if (viewMode === 'list') {
        el.innerHTML = `<i class="${icon} icon" style="color:${color}"></i><span class="name">${f.name}</span><span class="meta">${f.metadata ? fsize(f.metadata.size) : ''}</span>`;
      } else {
        el.innerHTML = `<i class="${icon} icon" style="color:${color}"></i><span class="name">${f.name}</span>`;
      }
      el.onclick = () => dir ? openPath(f.name) : preview(f.name);
      el.oncontextmenu = e => showCtx(e, 'file', f.name);
      c.appendChild(el);
    });
    if (!list.length && curPath === '/') { c.innerHTML = '<div class="empty"><i class="ri-cloud-line"></i><p>Your drive is empty<br>Upload files or create a folder to get started</p></div>' }
  }
  c.className = viewMode === 'list' ? 'list' : 'grid';
}

function ficon(n) {
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n)) return 'ri-image-fill';
  if (/\.pdf$/i.test(n)) return 'ri-file-pdf-2-fill';
  if (/\.(zip|rar|7z)$/i.test(n)) return 'ri-file-zip-fill';
  if (/\.(doc|docx|txt)$/i.test(n)) return 'ri-file-text-fill';
  if (/\.(mp4|mov|avi)$/i.test(n)) return 'ri-video-fill';
  if (/\.(mp3|wav|ogg)$/i.test(n)) return 'ri-music-2-fill';
  if (/\.(xls|xlsx|csv)$/i.test(n)) return 'ri-file-excel-2-fill';
  if (/\.(ppt|pptx)$/i.test(n)) return 'ri-file-ppt-2-fill';
  return 'ri-file-3-fill';
}
function fsize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(1) + 'KB'; return (b / 1048576).toFixed(1) + 'MB' }
function openPath(f) {
  if (f === '..') { const p = curPath.split('/'); p.pop(); curPath = !p.length || (p.length === 1 && !p[0]) ? '/' : p.join('/') }
  else curPath = curPath === '/' ? f : `${curPath}/${f}`;
  refreshDrive();
}
async function createFolder() {
  const n = prompt('New folder name:');
  if (!n) return;
  const fp = curPath === '/' ? `${n}/.keep` : `${curPath}/${n}/.keep`;
  await sb.storage.from('files').upload(fp, new Blob(['']));
  refreshDrive(); toast('Folder created', 'success');
}
async function uploadFiles(files) {
  if (!files.length) return; toast(`Uploading ${files.length} file(s)...`);
  for (const f of files) { await sb.storage.from('files').upload(curPath === '/' ? f.name : `${curPath}/${f.name}`, f) }
  refreshDrive(); toast('Upload complete', 'success');
}
async function renameFile(name) {
  const nn = prompt('Rename:', name); if (!nn || nn === name) return;
  const old = curPath === '/' ? name : `${curPath}/${name}`, nw = curPath === '/' ? nn : `${curPath}/${nn}`;
  const { data } = await sb.storage.from('files').download(old);
  if (data) { await sb.storage.from('files').upload(nw, data); await sb.storage.from('files').remove([old]); refreshDrive(); toast('Renamed', 'success') }
}
async function deleteFile(name) {
  const path = curPath === '/' ? name : `${curPath}/${name}`;
  trashF.push({ name, path, at: Date.now() }); localStorage.setItem('pv_trf', JSON.stringify(trashF));
  await sb.storage.from('files').remove([path]); refreshDrive(); updateBadge(); toast('Moved to trash', 'warning');
}
async function preview(name) {
  const path = curPath === '/' ? name : `${curPath}/${name}`;
  const { data } = await sb.storage.from('files').createSignedUrl(path, 3600);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
}
function setView(m, btn) { viewMode = m; document.querySelectorAll('.vbtns button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); refreshDrive() }
function handleDragOver(e) { e.preventDefault(); document.body.classList.add('dragging') }
function handleDragLeave(e) { e.preventDefault(); document.body.classList.remove('dragging') }
function handleDrop(e) { e.preventDefault(); document.body.classList.remove('dragging'); if (!document.getElementById('view-drive').classList.contains('hidden')) uploadFiles(e.dataTransfer.files) }

// ===== NOTE FOLDERS =====
function renderTabs() {
  const c = document.getElementById('ftabs'); if (!c) return; c.innerHTML = '';
  folders.forEach(f => {
    const el = mk('div', 'ftab' + (f === curFolder ? ' active' : ''));
    el.textContent = f; el.onclick = () => { curFolder = f; renderTabs(); renderList() }; c.appendChild(el);
  });
  const add = mk('div', 'ftab add'); add.textContent = '+ Add';
  add.onclick = () => { const n = prompt('New folder:'); if (n && !folders.includes(n)) { folders.push(n); localStorage.setItem('pv_folds', JSON.stringify(folders)); renderTabs(); toast('Folder added', 'success') } };
  c.appendChild(add);
}

// ===== NOTES =====
async function loadNotes() {
  let { data, error } = await sb.from('notes').select('*').order('created_at', { ascending: false });
  if (error) { let r = await sb.from('notes').select('*'); data = r.data }
  notes = data || []; renderList();
}

function renderList() {
  const c = document.getElementById('nlist'); c.innerHTML = '';
  let list = notes;
  if (curFolder !== 'All') list = notes.filter(n => getFolder(n.id) === curFolder);
  if (!list.length) { c.innerHTML = '<div class="empty" style="height:30%;padding:20px"><i class="ri-file-text-line"></i><p>No notes in this folder</p></div>'; return }
  list.forEach(n => {
    const lk = locks[n.id], fl = getFolder(n.id);
    const el = mk('div', 'n-item' + (active?.id === n.id ? ' active' : ''));
    el.innerHTML = `<div class="title"><span>${lk ? '🔒 ' : ''}${n.title || 'Untitled'}</span>${n.is_pinned ? '<i class="ri-pushpin-2-fill" style="color:var(--primary);font-size:.7rem"></i>' : ''}</div>
      <div class="preview">${lk ? '••••••••' : (n.content?.substring(0, 60) || 'Empty note')}</div>
      <div class="info"><span>${timeAgo(n.created_at)}</span>${fl && fl !== 'All' ? `<span class="tag">${fl}</span>` : ''}</div>`;
    el.onclick = () => selectNote(n.id);
    el.oncontextmenu = e => showCtx(e, 'note', n.id);
    c.appendChild(el);
  });
}

function getFolder(id) { return localStorage.getItem('pv_nf_' + id) || '' }
function filterNotes(q) {
  const f = notes.filter(n => (n.title + ' ' + n.content).toLowerCase().includes(q.toLowerCase()));
  const c = document.getElementById('nlist'); c.innerHTML = '';
  f.forEach(n => {
    const el = mk('div', 'n-item' + (active?.id === n.id ? ' active' : ''));
    el.innerHTML = `<div class="title"><span>${n.title || 'Untitled'}</span></div><div class="preview">${n.content?.substring(0, 60) || 'Empty'}</div>`;
    el.onclick = () => selectNote(n.id); c.appendChild(el);
  });
  if (!f.length) c.innerHTML = '<div class="empty" style="height:20%"><p>No results</p></div>';
}

function selectNote(id) {
  active = notes.find(n => n.id === id); renderList();
  document.getElementById('no-note').classList.add('hidden');
  document.getElementById('editor-ui').classList.remove('hidden');
  document.getElementById('editor-ui').style.display = 'flex';
  if (locks[id]) { document.getElementById('lockwall').classList.remove('hidden'); document.getElementById('lockpw').value = ''; return }
  document.getElementById('lockwall').classList.add('hidden');
  document.getElementById('ntitle').value = active.title || '';
  document.getElementById('nbody').value = active.content || '';
  updateStats(); updateLockBtn();
}

async function createNote() {
  const { data } = await sb.from('notes').insert([{ title: '', content: '' }]).select();
  if (data) {
    if (curFolder !== 'All') localStorage.setItem('pv_nf_' + data[0].id, curFolder);
    notes.unshift(data[0]); selectNote(data[0].id); loadNotes(); toast('Note created', 'success');
  }
}

function handleInput(ta) {
  if (ta.value.endsWith('aistart')) { ta.value = ta.value.slice(0, -7); runAI(ta.value); return }
  triggerSave();
}
function triggerSave() {
  document.getElementById('ss').innerHTML = '<span style="animation:pulse 1s infinite;color:var(--warning)">Saving...</span>';
  if (saveT) clearTimeout(saveT); saveT = setTimeout(save, 800); updateStats();
}
async function save() {
  if (!active) return;
  const t = document.getElementById('ntitle').value, c = document.getElementById('nbody').value;
  await sb.from('notes').update({ title: t, content: c }).eq('id', active.id);
  document.getElementById('ss').innerHTML = '<span class="save-dot"></span>Saved';
  active.title = t; active.content = c; loadNotes();
}
function updateStats() {
  const t = document.getElementById('nbody').value;
  const w = t.trim() ? t.trim().split(/\s+/).length : 0;
  document.getElementById('wc').textContent = `${w} words · ${t.length} chars`;
}

function moveNote(id) {
  const f = prompt('Move to folder:\nAvailable: ' + folders.join(', '));
  if (f && folders.includes(f)) { localStorage.setItem('pv_nf_' + id, f); renderList(); toast(`Moved to ${f}`, 'success') }
  else if (f) { toast('Folder not found', 'warning') }
}

// LOCK
function toggleLock() {
  if (!active) return;
  if (locks[active.id]) { delete locks[active.id]; toast('Unlocked', 'success') }
  else { const p = prompt('Set password:'); if (p) { locks[active.id] = p; toast('Locked', 'success') } }
  localStorage.setItem('pv_locks', JSON.stringify(locks)); updateLockBtn(); loadNotes();
}
function updateLockBtn() {
  const b = document.getElementById('lockbtn');
  if (active && locks[active.id]) { b.style.color = 'var(--primary)'; b.innerHTML = '<i class="ri-lock-fill"></i>' }
  else { b.style.color = ''; b.innerHTML = '<i class="ri-lock-unlock-line"></i>' }
}
function unlockNote() {
  if (document.getElementById('lockpw').value === locks[active.id]) {
    document.getElementById('lockwall').classList.add('hidden');
    document.getElementById('ntitle').value = active.title; document.getElementById('nbody').value = active.content; updateStats();
  } else toast('Wrong password', 'error');
}
function insertMD(ch) { const ta = document.getElementById('nbody'), s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.substring(0, s) + ch + ta.value.substring(s, e) + ch + ta.value.substring(e); triggerSave() }
function toggleFocus() { const ns = document.querySelector('.note-sidebar'), sb = document.getElementById('sidebar'); const h = ns.style.display !== 'none'; ns.style.display = h ? 'none' : 'flex'; sb.style.display = h ? 'none' : 'flex' }

// AI
async function runAI(text) {
  if (!text.trim()) { toast('Write something first', 'warning'); return }
  toast('AI refining... ✨'); document.getElementById('ss').innerHTML = '<span style="color:var(--primary)">AI Working...</span>';
  await new Promise(r => setTimeout(r, 1000));
  document.getElementById('nbody').value = humanize(text); triggerSave(); toast('Text refined', 'success');
}
function humanize(t) {
  t = t.replace(/ {2,}/g, ' ').replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'],
  [/\bvery happy\b/gi, 'thrilled'], [/\bvery sad\b/gi, 'devastated'], [/\bvery important\b/gi, 'crucial'],
  [/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\ba lot of\b/gi, 'many'],
  [/\bi think\b/gi, 'I believe'], [/\bkind of\b/gi, 'somewhat'], [/\bget rid of\b/gi, 'eliminate'],
  [/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely']]
    .forEach(([p, v]) => { t = t.replace(p, v) }); return t;
}
function openGrammar() { const t = document.getElementById('nbody')?.value || ''; if (!t.trim()) { toast('Open a note first', 'warning'); return } toast('Checking...'); setTimeout(() => { let i = 0; if (/\s{2,}/.test(t)) i++; if (/(^|[.!?]\s+)[a-z]/.test(t)) i++; if (/\b(teh|recieve|seperate|definately)\b/i.test(t)) i++; toast(i ? `${i} issue(s) found` : 'Looks great!', i ? 'warning' : 'success') }, 1000) }

// TRASH
function updateBadge() { const b = document.getElementById('tcnt'); const c = trashN.length + trashF.length; b.textContent = c; c ? b.classList.remove('hidden') : b.classList.add('hidden') }
async function deleteNote(id) {
  const n = notes.find(x => x.id === id); if (n) trashN.push({ ...n, at: Date.now() });
  localStorage.setItem('pv_trn', JSON.stringify(trashN));
  await sb.from('notes').delete().eq('id', id);
  if (active?.id === id) { active = null; document.getElementById('editor-ui').classList.add('hidden'); document.getElementById('no-note').classList.remove('hidden') }
  loadNotes(); updateBadge(); toast('Note trashed', 'warning');
}
function renderTrash() {
  const c = document.getElementById('tlist'); c.innerHTML = '';
  if (!trashN.length && !trashF.length) { c.innerHTML = '<div class="empty"><i class="ri-delete-bin-5-line"></i><p>Trash is empty</p></div>'; return }
  trashN.forEach((n, i) => { c.innerHTML += `<div class="t-item"><i class="ri-file-text-line t-icon"></i><span class="t-name">${n.title || 'Untitled'}</span><span class="t-date">${new Date(n.at).toLocaleDateString()}</span><button onclick="restoreN(${i})" title="Restore"><i class="ri-arrow-go-back-line"></i></button><button class="del" onclick="permN(${i})" title="Delete forever"><i class="ri-delete-bin-line"></i></button></div>` });
  trashF.forEach((f, i) => { c.innerHTML += `<div class="t-item"><i class="ri-file-3-line t-icon"></i><span class="t-name">${f.name}</span><span class="t-date">${new Date(f.at).toLocaleDateString()}</span><button class="del" onclick="permF(${i})" title="Delete forever"><i class="ri-delete-bin-line"></i></button></div>` });
}
async function restoreN(i) { const n = trashN.splice(i, 1)[0]; localStorage.setItem('pv_trn', JSON.stringify(trashN)); await sb.from('notes').insert([{ title: n.title, content: n.content }]); loadNotes(); renderTrash(); updateBadge(); toast('Restored', 'success') }
function permN(i) { trashN.splice(i, 1); localStorage.setItem('pv_trn', JSON.stringify(trashN)); renderTrash(); updateBadge(); toast('Permanently deleted', 'error') }
function permF(i) { trashF.splice(i, 1); localStorage.setItem('pv_trf', JSON.stringify(trashF)); renderTrash(); updateBadge(); toast('Permanently deleted', 'error') }
function emptyTrash() { if (!confirm('Empty all trash permanently?')) return; trashN = []; trashF = []; localStorage.setItem('pv_trn', '[]'); localStorage.setItem('pv_trf', '[]'); renderTrash(); updateBadge(); toast('Trash emptied', 'success') }

// PIN
async function togglePin(id) { const n = notes.find(x => x.id === id); if (!n) return; await sb.from('notes').update({ is_pinned: !n.is_pinned }).eq('id', id); loadNotes(); toast(n.is_pinned ? 'Unpinned' : 'Pinned', 'success') }

// CTX MENU
function showCtx(e, type, id) {
  e.preventDefault(); const m = document.getElementById('ctx'); m.style.display = 'block'; m.style.left = Math.min(e.pageX, innerWidth - 190) + 'px'; m.style.top = Math.min(e.pageY, innerHeight - 120) + 'px'; m.classList.remove('hidden');
  if (type === 'note') {
    m.innerHTML = `<div class="c-item" onclick="togglePin('${id}')"><i class="ri-pushpin-line"></i>Pin / Unpin</div><div class="c-item" onclick="moveNote('${id}')"><i class="ri-folder-transfer-line"></i>Move to Folder</div><div class="c-item dng" onclick="deleteNote('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>`;
  } else {
    m.innerHTML = `<div class="c-item" onclick="renameFile('${id}')"><i class="ri-edit-line"></i>Rename</div><div class="c-item" onclick="preview('${id}')"><i class="ri-eye-line"></i>Preview</div><div class="c-item dng" onclick="deleteFile('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>`;
  }
  setTimeout(() => document.addEventListener('click', () => m.classList.add('hidden'), { once: true }), 10);
}

// UTILS
function mk(tag, cls) { const el = document.createElement(tag); el.className = cls; return el }
function timeAgo(d) { const s = Math.floor((Date.now() - new Date(d)) / 1e3); if (s < 60) return 'Just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago'; return new Date(d).toLocaleDateString() }
function toast(msg, type = 'info') {
  const el = document.getElementById('toast'), ic = document.getElementById('t-icon');
  document.getElementById('t-msg').textContent = msg;
  ic.className = { info: 'ri-information-line', success: 'ri-checkbox-circle-line', warning: 'ri-error-warning-line', error: 'ri-close-circle-line' }[type] || 'ri-information-line';
  ic.style.color = { info: 'var(--primary)', success: 'var(--success)', warning: 'var(--warning)', error: 'var(--danger)' }[type] || 'var(--primary)';
  el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3000);
}
