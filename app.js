const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co', SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
let sb; try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) } catch (e) { console.error(e) }

// State
let notes = [], active = null, saveTimer = null, curTab = 'notes';
let drivePath = '/', driveView = 'grid', driveSortBy = 'name', driveFiles = [];
let noteFolders = JSON.parse(localStorage.getItem('pv_nf') || '[]'); // [{name,open}]
let noteAssign = JSON.parse(localStorage.getItem('pv_na') || '{}'); // noteId -> folderName
let locks = JSON.parse(localStorage.getItem('pv_lk') || '{}');
let trashN = JSON.parse(localStorage.getItem('pv_tn') || '[]');
let trashF = JSON.parse(localStorage.getItem('pv_tf') || '[]');

// Init
window.onload = async () => {
  try { const { data: { session } } = await sb.auth.getSession(); killLoader(); if (session) boot(session.user) } catch (e) { killLoader() }
};
function killLoader() { const l = document.getElementById('loader'); l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 400) }

// Auth
async function login() {
  const e = document.getElementById('em').value.trim(), p = document.getElementById('pw').value;
  const btn = document.getElementById('lbtn'), err = document.getElementById('aerr');
  if (!e || !p) { err.textContent = 'Enter email and password'; return }
  btn.textContent = 'SIGNING IN...'; err.textContent = '';
  try { const { data, error } = await sb.auth.signInWithPassword({ email: e, password: p }); if (error) throw error; boot(data.user) }
  catch (ex) { err.textContent = ex.message; btn.textContent = 'SIGN IN' }
}
async function logout() { await sb.auth.signOut(); location.reload() }
function boot(u) {
  document.getElementById('auth').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('uemail').textContent = u.email;
  document.getElementById('uav').textContent = u.email[0].toUpperCase();
  loadNotes(); loadDriveSidebar(); updateBadge();
}

// ===== TAB SWITCHING =====
function switchTab(tab) {
  curTab = tab;
  document.getElementById('tab-notes').classList.toggle('on', tab === 'notes');
  document.getElementById('tab-files').classList.toggle('on', tab === 'files');
  document.getElementById('panel-notes').classList.toggle('hide', tab !== 'notes');
  document.getElementById('panel-files').classList.toggle('hide', tab !== 'files');
  // main area
  const views = ['editor-wrap', 'view-drive', 'view-trash'];
  views.forEach(v => document.getElementById(v).classList.add('hide'));
  if (tab === 'notes') { document.getElementById('editor-wrap').classList.remove('hide') }
  if (tab === 'files') { document.getElementById('view-drive').classList.remove('hide'); document.getElementById('view-drive').style.display = 'flex'; refreshDriveGrid() }
}

function showTrash() {
  ['editor-wrap', 'view-drive', 'view-trash'].forEach(v => { document.getElementById(v).classList.add('hide'); });
  document.getElementById('view-trash').classList.remove('hide'); document.getElementById('view-trash').style.display = 'flex';
  renderTrash();
}

// ===== NOTES =====
async function loadNotes() {
  let { data, error } = await sb.from('notes').select('*').order('created_at', { ascending: false });
  if (error) { let r = await sb.from('notes').select('*'); data = r.data }
  notes = data || []; renderSidebarNotes();
}

function renderSidebarNotes() {
  const c = document.getElementById('sidebar-notes'); c.innerHTML = '';
  // Render folders
  noteFolders.forEach((f, fi) => {
    const isOpen = f.open !== false;
    const folderNotes = notes.filter(n => noteAssign[n.id] === f.name);
    const head = mk('div', 'folder-head' + (isOpen ? ' open' : ''));
    head.innerHTML = `<i class="ri-folder-3-fill"></i><span>${f.name}</span><span class="arrow">▶</span>`;
    head.onclick = () => { noteFolders[fi].open = !isOpen; localStorage.setItem('pv_nf', JSON.stringify(noteFolders)); renderSidebarNotes() };
    head.oncontextmenu = e => showFolderCtx(e, f.name);
    c.appendChild(head);
    if (isOpen) {
      const wrap = mk('div', 'folder-notes');
      folderNotes.forEach(n => {
        const row = mk('div', 'note-row' + (active?.id === n.id ? ' on' : ''));
        row.innerHTML = `<i class="${locks[n.id] ? 'ri-lock-fill' : 'ri-file-text-line'}"></i><span>${n.title || 'Untitled'}</span>`;
        row.onclick = () => selectNote(n.id);
        row.oncontextmenu = e => showNoteCtx(e, n.id);
        wrap.appendChild(row);
      });
      if (!folderNotes.length) { const em = mk('div', 'note-row'); em.style.cssText = 'color:var(--tx3);font-style:italic;cursor:default;font-size:.72rem'; em.textContent = 'Empty folder'; wrap.appendChild(em) }
      c.appendChild(wrap);
    }
  });
  // Uncategorized
  const uncat = notes.filter(n => !noteAssign[n.id] || !noteFolders.find(f => f.name === noteAssign[n.id]));
  if (uncat.length || !noteFolders.length) {
    if (noteFolders.length) { const lab = mk('div', 'uncat-label'); lab.textContent = 'Uncategorized'; c.appendChild(lab) }
    uncat.forEach(n => {
      const row = mk('div', 'note-row' + (active?.id === n.id ? ' on' : ''));
      row.innerHTML = `<i class="${locks[n.id] ? 'ri-lock-fill' : 'ri-file-text-line'}"></i><span>${n.title || 'Untitled'}</span>`;
      row.onclick = () => selectNote(n.id);
      row.oncontextmenu = e => showNoteCtx(e, n.id);
      c.appendChild(row);
    });
  }
  if (!notes.length && !noteFolders.length) { c.innerHTML = '<div class="empty" style="height:30%"><i class="ri-file-text-line"></i><p>No notes yet</p></div>' }
}

function selectNote(id) {
  if (curTab !== 'notes') switchTab('notes');
  active = notes.find(n => n.id === id); renderSidebarNotes();
  document.getElementById('e-empty').classList.add('hide');
  document.getElementById('e-ui').classList.remove('hide');
  document.getElementById('e-ui').style.display = 'flex';
  if (locks[id]) { document.getElementById('lock-wall').classList.remove('hide'); document.getElementById('lockpw').value = ''; return }
  document.getElementById('lock-wall').classList.add('hide');
  document.getElementById('et').value = active.title || '';
  document.getElementById('eb').value = active.content || '';
  updateStats(); updateLockBtn();
}

async function createNote() {
  const { data } = await sb.from('notes').insert([{ title: '', content: '' }]).select();
  if (data) { notes.unshift(data[0]); selectNote(data[0].id); toast('Note created', 'success') }
}

function createNoteFolder() {
  showModal('New Folder', 'Folder name:', 'Create', name => {
    if (!name.trim()) return;
    if (noteFolders.find(f => f.name === name)) { toast('Already exists', 'amber'); return }
    noteFolders.push({ name, open: true });
    localStorage.setItem('pv_nf', JSON.stringify(noteFolders)); renderSidebarNotes(); toast('Folder created', 'success');
  });
}

function moveNoteToFolder(id) {
  const opts = noteFolders.map(f => f.name);
  if (!opts.length) { toast('Create a folder first', 'amber'); return }
  showModal('Move to Folder', 'Select folder:', 'Move', folder => {
    noteAssign[id] = folder; localStorage.setItem('pv_na', JSON.stringify(noteAssign)); renderSidebarNotes(); toast('Moved', 'success');
  }, 'select', opts);
}

function removeFromFolder(id) {
  delete noteAssign[id]; localStorage.setItem('pv_na', JSON.stringify(noteAssign)); renderSidebarNotes(); toast('Removed from folder', 'success');
}

function renameFolder(oldName) {
  showModal('Rename Folder', 'New name:', 'Rename', newName => {
    if (!newName.trim()) return;
    const f = noteFolders.find(x => x.name === oldName); if (f) f.name = newName;
    Object.keys(noteAssign).forEach(k => { if (noteAssign[k] === oldName) noteAssign[k] = newName });
    localStorage.setItem('pv_nf', JSON.stringify(noteFolders)); localStorage.setItem('pv_na', JSON.stringify(noteAssign));
    renderSidebarNotes(); toast('Renamed', 'success');
  }, undefined, undefined, oldName);
}

function deleteFolder(name) {
  noteFolders = noteFolders.filter(f => f.name !== name);
  Object.keys(noteAssign).forEach(k => { if (noteAssign[k] === name) delete noteAssign[k] });
  localStorage.setItem('pv_nf', JSON.stringify(noteFolders)); localStorage.setItem('pv_na', JSON.stringify(noteAssign));
  renderSidebarNotes(); toast('Folder deleted', 'success');
}

function handleInput(ta) { if (ta.value.endsWith('aistart')) { ta.value = ta.value.slice(0, -7); runAI(ta.value); return } triggerSave() }
function triggerSave() { document.getElementById('ss').innerHTML = '<span style="animation:pulse 1s infinite;color:var(--amber)">Saving...</span>'; if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(save, 800); updateStats() }
async function save() {
  if (!active) return; const t = document.getElementById('et').value, c = document.getElementById('eb').value;
  await sb.from('notes').update({ title: t, content: c }).eq('id', active.id);
  document.getElementById('ss').innerHTML = '<span class="dot"></span>Saved'; active.title = t; active.content = c; renderSidebarNotes();
}
function updateStats() { const t = document.getElementById('eb').value; const w = t.trim() ? t.trim().split(/\s+/).length : 0; document.getElementById('wc').textContent = `${w} words · ${t.length} chars` }

// Lock
function toggleLock() { if (!active) return; if (locks[active.id]) { delete locks[active.id]; toast('Unlocked', 'success') } else { showModal('Lock Note', 'Set password:', 'Lock', pw => { if (pw) { locks[active.id] = pw; toast('Locked', 'success'); localStorage.setItem('pv_lk', JSON.stringify(locks)); updateLockBtn(); renderSidebarNotes() } }) }; localStorage.setItem('pv_lk', JSON.stringify(locks)); updateLockBtn(); renderSidebarNotes() }
function updateLockBtn() { const b = document.getElementById('lockbtn'); if (active && locks[active.id]) { b.style.color = 'var(--ac)'; b.innerHTML = '<i class="ri-lock-fill"></i>' } else { b.style.color = ''; b.innerHTML = '<i class="ri-lock-unlock-line"></i>' } }
function unlockNote() { if (document.getElementById('lockpw').value === locks[active.id]) { document.getElementById('lock-wall').classList.add('hide'); document.getElementById('et').value = active.title; document.getElementById('eb').value = active.content; updateStats() } else toast('Wrong password', 'red') }
function insertMD(ch) { const ta = document.getElementById('eb'), s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.substring(0, s) + ch + ta.value.substring(s, e) + ch + ta.value.substring(e); triggerSave() }
function toggleFocus() { document.getElementById('side').classList.toggle('hide') }

// AI
async function runAI(text) { if (!text.trim()) { toast('Write something first', 'amber'); return } toast('AI refining... ✨'); document.getElementById('ss').innerHTML = '<span style="color:var(--ac)">AI Working...</span>'; await new Promise(r => setTimeout(r, 1000)); document.getElementById('eb').value = humanize(text); triggerSave(); toast('Text refined', 'success') }
function humanize(t) { t = t.replace(/ {2,}/g, ' ').replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());[[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\ba lot of\b/gi, 'many'], [/\bi think\b/gi, 'I believe'], [/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely']].forEach(([p, v]) => { t = t.replace(p, v) }); return t }
function openGrammar() { const t = document.getElementById('eb')?.value || ''; if (!t.trim()) { toast('Open a note first', 'amber'); return } toast('Checking...'); setTimeout(() => { let i = 0; if (/\s{2,}/.test(t)) i++; if (/(^|[.!?]\s+)[a-z]/.test(t)) i++; if (/\b(teh|recieve|seperate|definately)\b/i.test(t)) i++; toast(i ? `${i} issue(s) found — type aistart to fix` : 'Grammar looks great!', i ? 'amber' : 'success') }, 800) }

// ===== DRIVE =====
async function loadDriveSidebar() {
  const { data } = await sb.storage.from('files').list('');
  const c = document.getElementById('sidebar-files'); c.innerHTML = '';
  if (data) {
    data.filter(f => f.name !== '.keep').forEach(f => {
      const dir = !f.metadata;
      const row = mk('div', 'file-row');
      row.innerHTML = `<i class="${dir ? 'ri-folder-3-fill' : 'ri-file-3-line'}" style="color:${dir ? 'var(--ac)' : 'var(--tx3)'}"></i><span class="fname">${f.name}</span>${f.metadata ? `<span class="fsize">${fmtSize(f.metadata.size)}</span>` : ''}`;
      row.onclick = () => { if (dir) { drivePath = f.name; switchTab('files') } else { switchTab('files') } };
      row.oncontextmenu = e => showFileCtx(e, f.name);
      c.appendChild(row);
    });
  }
  if (!data?.filter(f => f.name !== '.keep').length) c.innerHTML = '<div class="empty" style="height:30%"><i class="ri-cloud-line"></i><p>No files yet</p></div>';
}
async function refreshDrive() { drivePath = '/'; refreshDriveGrid(); loadDriveSidebar() }
async function refreshDriveGrid() {
  const p = drivePath === '/' ? '' : drivePath;
  const { data } = await sb.storage.from('files').list(p);
  const c = document.getElementById('dgrid'); c.innerHTML = '';
  document.getElementById('dp').textContent = drivePath === '/' ? 'Home' : drivePath;
  if (drivePath !== '/') { const back = mk('div', 'card' + (driveView === 'list' ? ' row' : '')); back.innerHTML = `<i class="ri-arrow-up-line ci" style="color:var(--tx3)"></i><span class="cn">← Back</span>`; back.onclick = () => { const segs = drivePath.split('/'); segs.pop(); drivePath = segs.length ? segs.join('/') : '/'; refreshDriveGrid() }; c.appendChild(back) }
  if (data) {
    let list = data.filter(f => f.name !== '.keep');
    if (driveSortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (driveSortBy === 'date') list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (driveSortBy === 'size') list.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
    list.forEach(f => {
      const dir = !f.metadata, icon = dir ? 'ri-folder-3-fill' : ficon(f.name), color = dir ? 'var(--ac)' : 'var(--tx3)';
      const el = mk('div', 'card' + (driveView === 'list' ? ' row' : ''));
      el.innerHTML = driveView === 'list' ? `<i class="${icon} ci" style="color:${color}"></i><span class="cn">${f.name}</span><span class="cm">${f.metadata ? fmtSize(f.metadata.size) : ''}</span>` : `<i class="${icon} ci" style="color:${color}"></i><span class="cn">${f.name}</span>`;
      el.onclick = () => dir ? (() => { drivePath = drivePath === '/' ? f.name : `${drivePath}/${f.name}`; refreshDriveGrid() })() : previewFile(f.name);
      el.oncontextmenu = e => showFileCtx(e, f.name); c.appendChild(el);
    });
    if (!list.length && drivePath === '/') { c.innerHTML = '<div class="empty"><i class="ri-cloud-line"></i><p>Your drive is empty<br>Upload files to get started</p></div>' }
  }
  c.className = driveView === 'list' ? 'dl' : 'dg';
}
function ficon(n) { if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n)) return 'ri-image-fill'; if (/\.pdf$/i.test(n)) return 'ri-file-pdf-2-fill'; if (/\.(zip|rar|7z)$/i.test(n)) return 'ri-file-zip-fill'; if (/\.(doc|docx|txt)$/i.test(n)) return 'ri-file-text-fill'; if (/\.(mp4|mov)$/i.test(n)) return 'ri-video-fill'; if (/\.(mp3|wav)$/i.test(n)) return 'ri-music-2-fill'; return 'ri-file-3-fill' }
function fmtSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1e6) return (b / 1024).toFixed(1) + 'KB'; return (b / 1e6).toFixed(1) + 'MB' }
async function createDriveFolder() { showModal('New Folder', 'Folder name:', 'Create', async name => { if (!name.trim()) return; const fp = drivePath === '/' ? `${name}/.keep` : `${drivePath}/${name}/.keep`; await sb.storage.from('files').upload(fp, new Blob([''])); refreshDriveGrid(); loadDriveSidebar(); toast('Folder created', 'success') }) }
async function uploadFiles(files) { if (!files.length) return; toast(`Uploading ${files.length} file(s)...`); for (const f of files) { await sb.storage.from('files').upload(drivePath === '/' ? f.name : `${drivePath}/${f.name}`, f) } refreshDriveGrid(); loadDriveSidebar(); toast('Upload complete', 'success') }
async function renameFile(name) { showModal('Rename', 'New name:', 'Rename', async nn => { if (!nn || nn === name) return; const old = drivePath === '/' ? name : `${drivePath}/${name}`, nw = drivePath === '/' ? nn : `${drivePath}/${nn}`; const { data } = await sb.storage.from('files').download(old); if (data) { await sb.storage.from('files').upload(nw, data); await sb.storage.from('files').remove([old]); refreshDriveGrid(); loadDriveSidebar(); toast('Renamed', 'success') } }, undefined, undefined, name) }
async function deleteFile(name) { const path = drivePath === '/' ? name : `${drivePath}/${name}`; trashF.push({ name, path, at: Date.now() }); localStorage.setItem('pv_tf', JSON.stringify(trashF)); await sb.storage.from('files').remove([path]); refreshDriveGrid(); loadDriveSidebar(); updateBadge(); toast('Moved to trash', 'amber') }
async function previewFile(name) { const path = drivePath === '/' ? name : `${drivePath}/${name}`; const { data } = await sb.storage.from('files').createSignedUrl(path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }
function setDriveView(m) { driveView = m; refreshDriveGrid() }
function handleDragOver(e) { e.preventDefault(); document.body.classList.add('drag') }
function handleDragLeave(e) { e.preventDefault(); document.body.classList.remove('drag') }
function handleDrop(e) { e.preventDefault(); document.body.classList.remove('drag'); if (!document.getElementById('view-drive').classList.contains('hide')) uploadFiles(e.dataTransfer.files) }

// ===== TRASH =====
function updateBadge() { const b = document.getElementById('tcnt'); const c = trashN.length + trashF.length; b.textContent = c; c ? b.classList.remove('hide') : b.classList.add('hide') }
async function deleteNote(id) {
  const n = notes.find(x => x.id === id); if (n) trashN.push({ ...n, at: Date.now() });
  localStorage.setItem('pv_tn', JSON.stringify(trashN));
  await sb.from('notes').delete().eq('id', id);
  if (active?.id === id) { active = null; document.getElementById('e-ui').classList.add('hide'); document.getElementById('e-empty').classList.remove('hide') }
  loadNotes(); updateBadge(); toast('Note trashed', 'amber');
}
function renderTrash() {
  const c = document.getElementById('tlist'); c.innerHTML = '';
  if (!trashN.length && !trashF.length) { c.innerHTML = '<div class="empty"><i class="ri-delete-bin-5-line"></i><p>Trash is empty</p></div>'; return }
  trashN.forEach((n, i) => { c.innerHTML += `<div class="tr"><i class="ri-file-text-line ti"></i><span class="tn">${n.title || 'Untitled'}</span><span class="td">${new Date(n.at).toLocaleDateString()}</span><button onclick="restoreN(${i})" title="Restore"><i class="ri-arrow-go-back-line"></i></button><button class="x" onclick="permN(${i})" title="Delete"><i class="ri-close-line"></i></button></div>` });
  trashF.forEach((f, i) => { c.innerHTML += `<div class="tr"><i class="ri-file-3-line ti"></i><span class="tn">${f.name}</span><span class="td">${new Date(f.at).toLocaleDateString()}</span><button class="x" onclick="permF(${i})" title="Delete"><i class="ri-close-line"></i></button></div>` });
}
async function restoreN(i) { const n = trashN.splice(i, 1)[0]; localStorage.setItem('pv_tn', JSON.stringify(trashN)); await sb.from('notes').insert([{ title: n.title, content: n.content }]); loadNotes(); renderTrash(); updateBadge(); toast('Restored', 'success') }
function permN(i) { trashN.splice(i, 1); localStorage.setItem('pv_tn', JSON.stringify(trashN)); renderTrash(); updateBadge() }
function permF(i) { trashF.splice(i, 1); localStorage.setItem('pv_tf', JSON.stringify(trashF)); renderTrash(); updateBadge() }
function emptyTrash() { if (!confirm('Permanently empty all trash?')) return; trashN = []; trashF = []; localStorage.setItem('pv_tn', '[]'); localStorage.setItem('pv_tf', '[]'); renderTrash(); updateBadge(); toast('Trash emptied', 'success') }

// ===== CONTEXT MENUS =====
function showNoteCtx(e, id) {
  e.preventDefault(); e.stopPropagation(); const m = document.getElementById('ctx');
  m.style.cssText = `display:block;left:${Math.min(e.pageX, innerWidth - 190)}px;top:${Math.min(e.pageY, innerHeight - 150)}px`;
  m.classList.remove('hide');
  m.innerHTML = `<div class="cx" onclick="moveNoteToFolder('${id}')"><i class="ri-folder-transfer-line"></i>Move to Folder</div><div class="cx" onclick="removeFromFolder('${id}')"><i class="ri-folder-reduce-line"></i>Remove from Folder</div><div class="cx d" onclick="deleteNote('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>`;
  setTimeout(() => document.addEventListener('click', () => m.classList.add('hide'), { once: true }), 10);
}
function showFolderCtx(e, name) {
  e.preventDefault(); e.stopPropagation(); const m = document.getElementById('ctx');
  m.style.cssText = `display:block;left:${Math.min(e.pageX, innerWidth - 190)}px;top:${Math.min(e.pageY, innerHeight - 120)}px`;
  m.classList.remove('hide');
  m.innerHTML = `<div class="cx" onclick="renameFolder('${name}')"><i class="ri-edit-line"></i>Rename</div><div class="cx d" onclick="deleteFolder('${name}')"><i class="ri-delete-bin-line"></i>Delete Folder</div>`;
  setTimeout(() => document.addEventListener('click', () => m.classList.add('hide'), { once: true }), 10);
}
function showFileCtx(e, name) {
  e.preventDefault(); e.stopPropagation(); const m = document.getElementById('ctx');
  m.style.cssText = `display:block;left:${Math.min(e.pageX, innerWidth - 190)}px;top:${Math.min(e.pageY, innerHeight - 130)}px`;
  m.classList.remove('hide');
  m.innerHTML = `<div class="cx" onclick="renameFile('${name}')"><i class="ri-edit-line"></i>Rename</div><div class="cx" onclick="previewFile('${name}')"><i class="ri-eye-line"></i>Preview</div><div class="cx d" onclick="deleteFile('${name}')"><i class="ri-delete-bin-line"></i>Delete</div>`;
  setTimeout(() => document.addEventListener('click', () => m.classList.add('hide'), { once: true }), 10);
}

// ===== MODAL (replaces prompt()) =====
function showModal(title, label, okText, onOk, type = 'text', options = [], defaultVal = '') {
  const root = document.getElementById('modal-root');
  const bg = mk('div', 'modal-bg');
  const box = mk('div', 'modal');
  let inputHTML = '';
  if (type === 'select') {
    inputHTML = `<select id="modal-input">${options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
  } else {
    inputHTML = `<input id="modal-input" type="${type}" placeholder="${label}" value="${defaultVal}">`;
  }
  box.innerHTML = `<h3>${title}</h3>${inputHTML}<div class="modal-btns"><button class="m-cancel" id="m-cancel">Cancel</button><button class="m-ok" id="m-ok">${okText}</button></div>`;
  bg.appendChild(box); root.appendChild(bg);
  const inp = document.getElementById('modal-input'); inp.focus();
  if (type === 'text') inp.select();
  const close = () => root.removeChild(bg);
  document.getElementById('m-cancel').onclick = close;
  bg.onclick = e => { if (e.target === bg) close() };
  document.getElementById('m-ok').onclick = () => { onOk(inp.value); close() };
  inp.onkeydown = e => { if (e.key === 'Enter') { onOk(inp.value); close() } if (e.key === 'Escape') close() };
}

// Utils
function mk(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el }
function toast(msg, type = 'info') {
  const el = document.getElementById('toast'), ic = document.getElementById('ti');
  document.getElementById('tm').textContent = msg;
  ic.className = { info: 'ri-information-line', success: 'ri-checkbox-circle-line', amber: 'ri-error-warning-line', red: 'ri-close-circle-line' }[type] || 'ri-information-line';
  ic.style.color = { info: 'var(--ac)', success: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' }[type] || 'var(--ac)';
  el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3000);
}
