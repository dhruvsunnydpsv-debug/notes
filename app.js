const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co';
const SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
let sb;
try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) } catch (e) { console.error('Supabase init error:', e) }

/* == STATE == */
let notes = [], active = null, saveTimer = null, curTab = 'notes';
let drivePath = '/', driveView = 'grid', driveSortBy = 'name';
let noteFolders = JSON.parse(localStorage.getItem('pv_nf') || '[]');
let noteAssign = JSON.parse(localStorage.getItem('pv_na') || '{}');
let locks = JSON.parse(localStorage.getItem('pv_lk') || '{}');
let trashN = JSON.parse(localStorage.getItem('pv_tn') || '[]');
let trashF = JSON.parse(localStorage.getItem('pv_tf') || '[]');

/* == INIT == */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!sb) { killLoader(); showAuth(); return }
    const { data: { session }, error } = await sb.auth.getSession();
    killLoader();
    if (!error && session && session.user) { boot(session.user) } else { showAuth() }
  } catch (e) {
    console.error('Init error:', e);
    killLoader(); showAuth();
  }
});

function killLoader() {
  const l = document.getElementById('loader');
  if (l) { l.style.opacity = '0'; setTimeout(() => { l.style.display = 'none' }, 400) }
}
function showAuth() { document.getElementById('auth').style.display = 'flex' }

/* == AUTH == */
async function login() {
  const email = document.getElementById('em').value.trim();
  const pass = document.getElementById('pw').value;
  const btn = document.getElementById('lbtn');
  const err = document.getElementById('aerr');
  if (!email || !pass) { err.textContent = 'Enter email and password'; return }
  btn.textContent = 'SIGNING IN...'; btn.disabled = true; err.textContent = '';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (error) throw error;
    boot(data.user);
  } catch (ex) {
    err.textContent = ex.message || 'Login failed';
    btn.textContent = 'SIGN IN'; btn.disabled = false;
  }
}
async function logout() { try { await sb.auth.signOut() } catch (e) { } location.reload() }

function boot(u) {
  document.getElementById('auth').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';
  document.getElementById('uemail').textContent = u.email;
  document.getElementById('uav').textContent = (u.email || 'U')[0].toUpperCase();
  loadNotes(); loadDriveSidebar(); updateBadge();
}

/* == TAB SWITCHING == */
function switchTab(tab) {
  curTab = tab;
  document.getElementById('tab-notes').classList.toggle('on', tab === 'notes');
  document.getElementById('tab-files').classList.toggle('on', tab === 'files');
  document.getElementById('panel-notes').classList.toggle('hide', tab !== 'notes');
  document.getElementById('panel-files').classList.toggle('hide', tab !== 'files');
  ['editor-wrap', 'view-drive', 'view-trash'].forEach(v => {
    const el = document.getElementById(v);
    el.classList.add('hide'); el.style.display = 'none';
  });
  if (tab === 'notes') {
    const ew = document.getElementById('editor-wrap');
    ew.classList.remove('hide'); ew.style.display = 'flex';
  }
  if (tab === 'files') {
    const vd = document.getElementById('view-drive');
    vd.classList.remove('hide'); vd.style.display = 'flex';
    refreshDriveGrid();
  }
}

function showTrash() {
  ['editor-wrap', 'view-drive', 'view-trash'].forEach(v => {
    const el = document.getElementById(v); el.classList.add('hide'); el.style.display = 'none';
  });
  const vt = document.getElementById('view-trash');
  vt.classList.remove('hide'); vt.style.display = 'flex';
  renderTrash();
}

/* == NOTES == */
async function loadNotes() {
  try {
    let { data, error } = await sb.from('notes').select('*').order('created_at', { ascending: false });
    if (error) { let r = await sb.from('notes').select('*'); data = r.data }
    notes = data || [];
  } catch (e) { notes = []; console.error(e) }
  renderSidebarNotes();
}

function renderSidebarNotes() {
  const c = document.getElementById('sidebar-notes'); c.innerHTML = '';
  // Folders
  noteFolders.forEach((f, fi) => {
    const isOpen = f.open !== false;
    const folderNotes = notes.filter(n => noteAssign[n.id] === f.name);
    const head = mk('div', 'folder-head' + (isOpen ? ' open' : ''));
    head.innerHTML = '<i class="ri-folder-3-fill"></i><span>' + esc(f.name) + '</span><span class="arrow">▶</span>';
    head.onclick = () => { noteFolders[fi].open = !isOpen; localStorage.setItem('pv_nf', JSON.stringify(noteFolders)); renderSidebarNotes() };
    head.oncontextmenu = e => showFolderCtx(e, f.name);
    c.appendChild(head);
    if (isOpen) {
      const wrap = mk('div', 'folder-notes');
      folderNotes.forEach(n => {
        const row = mk('div', 'note-row' + (active && active.id === n.id ? ' on' : ''));
        row.innerHTML = '<i class="' + (locks[n.id] ? 'ri-lock-fill' : 'ri-file-text-line') + '"></i><span>' + esc(n.title || 'Untitled') + '</span>';
        row.onclick = () => selectNote(n.id);
        row.oncontextmenu = e => showNoteCtx(e, n.id);
        wrap.appendChild(row);
      });
      if (!folderNotes.length) {
        const em = mk('div', 'note-row');
        em.style.cssText = 'color:var(--tx3);font-style:italic;cursor:default;font-size:.72rem';
        em.textContent = 'Empty folder'; wrap.appendChild(em);
      }
      c.appendChild(wrap);
    }
  });
  // Uncategorized
  const uncat = notes.filter(n => !noteAssign[n.id] || !noteFolders.find(f => f.name === noteAssign[n.id]));
  if (uncat.length || !noteFolders.length) {
    if (noteFolders.length) { const lab = mk('div', 'uncat-label'); lab.textContent = 'Uncategorized'; c.appendChild(lab) }
    uncat.forEach(n => {
      const row = mk('div', 'note-row' + (active && active.id === n.id ? ' on' : ''));
      row.innerHTML = '<i class="' + (locks[n.id] ? 'ri-lock-fill' : 'ri-file-text-line') + '"></i><span>' + esc(n.title || 'Untitled') + '</span>';
      row.onclick = () => selectNote(n.id);
      row.oncontextmenu = e => showNoteCtx(e, n.id);
      c.appendChild(row);
    });
  }
  if (!notes.length && !noteFolders.length) {
    c.innerHTML = '<div class="empty" style="height:40%;padding-top:30px"><i class="ri-file-text-line"></i><p>No notes yet<br>Click NEW NOTE above</p></div>';
  }
}

function selectNote(id) {
  if (curTab !== 'notes') switchTab('notes');
  active = notes.find(n => n.id === id);
  renderSidebarNotes();
  document.getElementById('e-empty').style.display = 'none';
  const eui = document.getElementById('e-ui');
  eui.classList.remove('hide'); eui.style.display = 'flex';
  if (locks[id]) {
    document.getElementById('lock-wall').classList.remove('hide');
    document.getElementById('lock-wall').style.display = 'flex';
    document.getElementById('lockpw').value = ''; return;
  }
  document.getElementById('lock-wall').classList.add('hide');
  document.getElementById('lock-wall').style.display = 'none';
  document.getElementById('et').value = active.title || '';
  document.getElementById('eb').value = active.content || '';
  updateStats(); updateLockBtn();
}

async function createNote() {
  try {
    const { data, error } = await sb.from('notes').insert([{ title: '', content: '' }]).select();
    if (error) throw error;
    if (data && data[0]) { notes.unshift(data[0]); selectNote(data[0].id); toast('Note created', 'success') }
  } catch (e) { toast('Error creating note', 'red'); console.error(e) }
}

function createNoteFolder() {
  showModal('New Folder', 'Folder name:', 'Create', name => {
    if (!name.trim()) return;
    if (noteFolders.find(f => f.name === name)) { toast('Already exists', 'amber'); return }
    noteFolders.push({ name: name, open: true });
    localStorage.setItem('pv_nf', JSON.stringify(noteFolders));
    renderSidebarNotes(); toast('Folder created', 'success');
  });
}

function moveNoteToFolder(id) {
  const opts = noteFolders.map(f => f.name);
  if (!opts.length) { toast('Create a folder first', 'amber'); return }
  showModal('Move to Folder', 'Select folder:', 'Move', folder => {
    noteAssign[id] = folder;
    localStorage.setItem('pv_na', JSON.stringify(noteAssign));
    renderSidebarNotes(); toast('Moved', 'success');
  }, 'select', opts);
}

function removeFromFolder(id) {
  delete noteAssign[id];
  localStorage.setItem('pv_na', JSON.stringify(noteAssign));
  renderSidebarNotes(); toast('Removed from folder', 'success');
}

function renameFolder(oldName) {
  showModal('Rename Folder', 'New name:', 'Rename', newName => {
    if (!newName.trim()) return;
    const f = noteFolders.find(x => x.name === oldName); if (f) f.name = newName;
    Object.keys(noteAssign).forEach(k => { if (noteAssign[k] === oldName) noteAssign[k] = newName });
    localStorage.setItem('pv_nf', JSON.stringify(noteFolders));
    localStorage.setItem('pv_na', JSON.stringify(noteAssign));
    renderSidebarNotes(); toast('Renamed', 'success');
  }, 'text', [], oldName);
}

function deleteFolder(name) {
  noteFolders = noteFolders.filter(f => f.name !== name);
  Object.keys(noteAssign).forEach(k => { if (noteAssign[k] === name) delete noteAssign[k] });
  localStorage.setItem('pv_nf', JSON.stringify(noteFolders));
  localStorage.setItem('pv_na', JSON.stringify(noteAssign));
  renderSidebarNotes(); toast('Folder deleted', 'success');
}

/* Editor */
function handleInput(ta) {
  if (ta.value.endsWith('aistart')) { ta.value = ta.value.slice(0, -7); runAI(ta.value); return }
  triggerSave();
}
function triggerSave() {
  document.getElementById('ss').innerHTML = '<span style="animation:pulse 1s infinite;color:var(--amber)">Saving...</span>';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 800);
  updateStats();
}
async function save() {
  if (!active) return;
  const t = document.getElementById('et').value, c = document.getElementById('eb').value;
  try { await sb.from('notes').update({ title: t, content: c }).eq('id', active.id) } catch (e) { console.error(e) }
  document.getElementById('ss').innerHTML = '<span class="dot"></span>Saved';
  active.title = t; active.content = c; renderSidebarNotes();
}
function updateStats() {
  const t = document.getElementById('eb').value;
  const w = t.trim() ? t.trim().split(/\s+/).length : 0;
  document.getElementById('wc').textContent = w + ' words · ' + t.length + ' chars';
}

/* Lock */
function toggleLock() {
  if (!active) return;
  if (locks[active.id]) {
    delete locks[active.id]; toast('Unlocked', 'success');
  } else {
    showModal('Lock Note', 'Set password:', 'Lock', pw => {
      if (!pw) return;
      locks[active.id] = pw;
      localStorage.setItem('pv_lk', JSON.stringify(locks));
      toast('Locked', 'success'); updateLockBtn(); renderSidebarNotes();
    });
    return;
  }
  localStorage.setItem('pv_lk', JSON.stringify(locks));
  updateLockBtn(); renderSidebarNotes();
}
function updateLockBtn() {
  const b = document.getElementById('lockbtn');
  if (!b) return;
  if (active && locks[active.id]) { b.style.color = 'var(--ac)'; b.innerHTML = '<i class="ri-lock-fill"></i>' }
  else { b.style.color = ''; b.innerHTML = '<i class="ri-lock-unlock-line"></i>' }
}
function unlockNote() {
  if (!active) return;
  if (document.getElementById('lockpw').value === locks[active.id]) {
    document.getElementById('lock-wall').classList.add('hide');
    document.getElementById('lock-wall').style.display = 'none';
    document.getElementById('et').value = active.title || '';
    document.getElementById('eb').value = active.content || '';
    updateStats();
  } else { toast('Wrong password', 'red') }
}
function insertMD(ch) {
  const ta = document.getElementById('eb'), s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.substring(0, s) + ch + ta.value.substring(s, e) + ch + ta.value.substring(e);
  triggerSave();
}
function toggleFocus() { document.getElementById('side').classList.toggle('hide') }

/* AI */
async function runAI(text) {
  if (!text.trim()) { toast('Write something first', 'amber'); return }
  toast('AI refining... ✨');
  document.getElementById('ss').innerHTML = '<span style="color:var(--ac)">AI Working...</span>';
  await new Promise(r => setTimeout(r, 1000));
  document.getElementById('eb').value = humanize(text);
  triggerSave(); toast('Text refined', 'success');
}
function humanize(t) {
  t = t.replace(/ {2,}/g, ' ');
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  const r = [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\ba lot of\b/gi, 'many'], [/\bi think\b/gi, 'I believe'], [/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely']];
  r.forEach(([p, v]) => { t = t.replace(p, v) });
  return t;
}
function openGrammar() {
  const t = document.getElementById('eb');
  if (!t || !t.value.trim()) { toast('Open a note first', 'amber'); return }
  toast('Checking...');
  setTimeout(() => {
    let i = 0; const v = t.value;
    if (/\s{2,}/.test(v)) i++;
    if (/(^|[.!?]\s+)[a-z]/.test(v)) i++;
    if (/\b(teh|recieve|seperate|definately)\b/i.test(v)) i++;
    toast(i ? i + ' issue(s) found — type aistart to fix' : 'Grammar looks great!', i ? 'amber' : 'success');
  }, 800);
}

/* == DRIVE == */
async function loadDriveSidebar() {
  try {
    const { data } = await sb.storage.from('files').list('');
    const c = document.getElementById('sidebar-files'); c.innerHTML = '';
    if (data) {
      const items = data.filter(f => f.name !== '.keep');
      items.forEach(f => {
        const dir = !f.metadata;
        const row = mk('div', 'file-row');
        row.innerHTML = '<i class="' + (dir ? 'ri-folder-3-fill' : 'ri-file-3-line') + '" style="color:' + (dir ? 'var(--ac)' : 'var(--tx3)') + '"></i><span class="fname">' + esc(f.name) + '</span>' + (f.metadata ? '<span class="fsize">' + fmtSize(f.metadata.size) + '</span>' : '');
        row.onclick = () => { if (dir) { drivePath = f.name; switchTab('files') } else switchTab('files') };
        row.oncontextmenu = e => showFileCtx(e, f.name);
        c.appendChild(row);
      });
      if (!items.length) c.innerHTML = '<div class="empty" style="height:30%"><i class="ri-cloud-line"></i><p>No files yet</p></div>';
    }
  } catch (e) { console.error(e) }
}

async function refreshDrive() { drivePath = '/'; refreshDriveGrid(); loadDriveSidebar() }

async function refreshDriveGrid() {
  try {
    const p = drivePath === '/' ? '' : drivePath;
    const { data } = await sb.storage.from('files').list(p);
    const c = document.getElementById('dgrid'); c.innerHTML = '';
    document.getElementById('dp').textContent = drivePath === '/' ? 'Home' : drivePath;
    if (drivePath !== '/') {
      const back = mk('div', 'card' + (driveView === 'list' ? ' row' : ''));
      back.innerHTML = '<i class="ri-arrow-up-line ci" style="color:var(--tx3)"></i><span class="cn">← Back</span>';
      back.onclick = () => { const segs = drivePath.split('/'); segs.pop(); drivePath = segs.length ? segs.join('/') : '/'; refreshDriveGrid() };
      c.appendChild(back);
    }
    if (data) {
      let list = data.filter(f => f.name !== '.keep');
      if (driveSortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      else if (driveSortBy === 'date') list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      else if (driveSortBy === 'size') list.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
      list.forEach(f => {
        const dir = !f.metadata, icon = dir ? 'ri-folder-3-fill' : ficon(f.name), color = dir ? 'var(--ac)' : 'var(--tx3)';
        const el = mk('div', 'card' + (driveView === 'list' ? ' row' : ''));
        if (driveView === 'list') {
          el.innerHTML = '<i class="' + icon + ' ci" style="color:' + color + '"></i><span class="cn">' + esc(f.name) + '</span><span class="cm">' + (f.metadata ? fmtSize(f.metadata.size) : '') + '</span>';
        } else {
          el.innerHTML = '<i class="' + icon + ' ci" style="color:' + color + '"></i><span class="cn">' + esc(f.name) + '</span>';
        }
        el.onclick = () => {
          if (dir) { drivePath = drivePath === '/' ? f.name : drivePath + '/' + f.name; refreshDriveGrid() }
          else previewFile(f.name);
        };
        el.oncontextmenu = e => showFileCtx(e, f.name);
        c.appendChild(el);
      });
      if (!list.length && drivePath === '/') { c.innerHTML = '<div class="empty"><i class="ri-cloud-line"></i><p>Your drive is empty<br>Upload files to get started</p></div>' }
    }
    c.className = driveView === 'list' ? 'dl' : 'dg';
  } catch (e) { console.error(e) }
}

function ficon(n) {
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n)) return 'ri-image-fill';
  if (/\.pdf$/i.test(n)) return 'ri-file-pdf-2-fill';
  if (/\.(zip|rar|7z)$/i.test(n)) return 'ri-file-zip-fill';
  if (/\.(doc|docx|txt)$/i.test(n)) return 'ri-file-text-fill';
  if (/\.(mp4|mov)$/i.test(n)) return 'ri-video-fill';
  if (/\.(mp3|wav)$/i.test(n)) return 'ri-music-2-fill';
  return 'ri-file-3-fill';
}
function fmtSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1e6) return (b / 1024).toFixed(1) + 'KB'; return (b / 1e6).toFixed(1) + 'MB' }

async function createDriveFolder() {
  showModal('New Folder', 'Folder name:', 'Create', async name => {
    if (!name.trim()) return;
    const fp = drivePath === '/' ? name + '/.keep' : drivePath + '/' + name + '/.keep';
    try { await sb.storage.from('files').upload(fp, new Blob([''])) } catch (e) { console.error(e) }
    refreshDriveGrid(); loadDriveSidebar(); toast('Folder created', 'success');
  });
}

async function uploadFiles(files) {
  if (!files || !files.length) return;
  toast('Uploading ' + files.length + ' file(s)...');
  for (const f of files) {
    const path = drivePath === '/' ? f.name : drivePath + '/' + f.name;
    try { await sb.storage.from('files').upload(path, f) } catch (e) { console.error(e) }
  }
  refreshDriveGrid(); loadDriveSidebar(); toast('Upload complete', 'success');
}

async function renameFile(name) {
  showModal('Rename', 'New name:', 'Rename', async nn => {
    if (!nn || nn === name) return;
    const old = drivePath === '/' ? name : drivePath + '/' + name;
    const nw = drivePath === '/' ? nn : drivePath + '/' + nn;
    try {
      const { data } = await sb.storage.from('files').download(old);
      if (data) { await sb.storage.from('files').upload(nw, data); await sb.storage.from('files').remove([old]) }
    } catch (e) { console.error(e) }
    refreshDriveGrid(); loadDriveSidebar(); toast('Renamed', 'success');
  }, 'text', [], name);
}

async function deleteFile(name) {
  const path = drivePath === '/' ? name : drivePath + '/' + name;
  trashF.push({ name: name, path: path, at: Date.now() });
  localStorage.setItem('pv_tf', JSON.stringify(trashF));
  try { await sb.storage.from('files').remove([path]) } catch (e) { console.error(e) }
  refreshDriveGrid(); loadDriveSidebar(); updateBadge(); toast('Moved to trash', 'amber');
}

async function previewFile(name) {
  const path = drivePath === '/' ? name : drivePath + '/' + name;
  try {
    const { data } = await sb.storage.from('files').createSignedUrl(path, 3600);
    if (data && data.signedUrl) window.open(data.signedUrl, '_blank');
  } catch (e) { console.error(e) }
}

function setDriveView(m) { driveView = m; refreshDriveGrid() }

function handleDragOver(e) { if (e) { e.preventDefault(); document.body.classList.add('drag') } }
function handleDragLeave(e) { if (e) { e.preventDefault(); document.body.classList.remove('drag') } }
function handleDrop(e) {
  if (e) { e.preventDefault(); document.body.classList.remove('drag') }
  const vd = document.getElementById('view-drive');
  if (vd && !vd.classList.contains('hide') && e.dataTransfer) uploadFiles(e.dataTransfer.files);
}

/* == TRASH == */
function updateBadge() {
  const b = document.getElementById('tcnt');
  if (!b) return;
  const c = trashN.length + trashF.length;
  b.textContent = c;
  if (c) b.classList.remove('hide'); else b.classList.add('hide');
}

async function deleteNote(id) {
  const n = notes.find(x => x.id === id);
  if (n) trashN.push({ title: n.title, content: n.content, id: n.id, at: Date.now() });
  localStorage.setItem('pv_tn', JSON.stringify(trashN));
  try { await sb.from('notes').delete().eq('id', id) } catch (e) { console.error(e) }
  if (active && active.id === id) {
    active = null;
    document.getElementById('e-ui').classList.add('hide');
    document.getElementById('e-ui').style.display = 'none';
    document.getElementById('e-empty').style.display = 'flex';
  }
  loadNotes(); updateBadge(); toast('Note trashed', 'amber');
}

function renderTrash() {
  const c = document.getElementById('tlist'); c.innerHTML = '';
  if (!trashN.length && !trashF.length) {
    c.innerHTML = '<div class="empty"><i class="ri-delete-bin-5-line"></i><p>Trash is empty</p></div>'; return;
  }
  trashN.forEach((n, i) => {
    const d = mk('div', 'tr');
    d.innerHTML = '<i class="ri-file-text-line ti"></i><span class="tn">' + esc(n.title || 'Untitled') + '</span><span class="td">' + new Date(n.at).toLocaleDateString() + '</span><button onclick="restoreN(' + i + ')" title="Restore"><i class="ri-arrow-go-back-line"></i></button><button class="x" onclick="permN(' + i + ')" title="Delete forever"><i class="ri-close-line"></i></button>';
    c.appendChild(d);
  });
  trashF.forEach((f, i) => {
    const d = mk('div', 'tr');
    d.innerHTML = '<i class="ri-file-3-line ti"></i><span class="tn">' + esc(f.name) + '</span><span class="td">' + new Date(f.at).toLocaleDateString() + '</span><button class="x" onclick="permF(' + i + ')" title="Delete forever"><i class="ri-close-line"></i></button>';
    c.appendChild(d);
  });
}

async function restoreN(i) {
  const n = trashN.splice(i, 1)[0];
  localStorage.setItem('pv_tn', JSON.stringify(trashN));
  try { await sb.from('notes').insert([{ title: n.title, content: n.content }]) } catch (e) { console.error(e) }
  loadNotes(); renderTrash(); updateBadge(); toast('Restored', 'success');
}
function permN(i) { trashN.splice(i, 1); localStorage.setItem('pv_tn', JSON.stringify(trashN)); renderTrash(); updateBadge() }
function permF(i) { trashF.splice(i, 1); localStorage.setItem('pv_tf', JSON.stringify(trashF)); renderTrash(); updateBadge() }
function emptyTrash() {
  if (!confirm('Permanently empty all trash?')) return;
  trashN = []; trashF = [];
  localStorage.setItem('pv_tn', '[]'); localStorage.setItem('pv_tf', '[]');
  renderTrash(); updateBadge(); toast('Trash emptied', 'success');
}

/* == CONTEXT MENUS == */
function showNoteCtx(e, id) {
  e.preventDefault(); e.stopPropagation();
  const m = document.getElementById('ctx');
  m.style.cssText = 'display:block;left:' + Math.min(e.pageX, innerWidth - 190) + 'px;top:' + Math.min(e.pageY, innerHeight - 160) + 'px';
  m.classList.remove('hide');
  m.innerHTML = '<div class="cx" onclick="moveNoteToFolder(\'' + id + '\')"><i class="ri-folder-transfer-line"></i>Move to Folder</div><div class="cx" onclick="removeFromFolder(\'' + id + '\')"><i class="ri-folder-reduce-line"></i>Remove from Folder</div><div class="cx d" onclick="deleteNote(\'' + id + '\')"><i class="ri-delete-bin-line"></i>Delete</div>';
  setTimeout(() => document.addEventListener('click', () => { m.classList.add('hide') }, { once: true }), 10);
}

function showFolderCtx(e, name) {
  e.preventDefault(); e.stopPropagation();
  const m = document.getElementById('ctx');
  m.style.cssText = 'display:block;left:' + Math.min(e.pageX, innerWidth - 190) + 'px;top:' + Math.min(e.pageY, innerHeight - 120) + 'px';
  m.classList.remove('hide');
  m.innerHTML = '<div class="cx" onclick="renameFolder(\'' + name + '\')"><i class="ri-edit-line"></i>Rename</div><div class="cx d" onclick="deleteFolder(\'' + name + '\')"><i class="ri-delete-bin-line"></i>Delete Folder</div>';
  setTimeout(() => document.addEventListener('click', () => { m.classList.add('hide') }, { once: true }), 10);
}

function showFileCtx(e, name) {
  e.preventDefault(); e.stopPropagation();
  const m = document.getElementById('ctx');
  m.style.cssText = 'display:block;left:' + Math.min(e.pageX, innerWidth - 190) + 'px;top:' + Math.min(e.pageY, innerHeight - 140) + 'px';
  m.classList.remove('hide');
  m.innerHTML = '<div class="cx" onclick="renameFile(\'' + name + '\')"><i class="ri-edit-line"></i>Rename</div><div class="cx" onclick="previewFile(\'' + name + '\')"><i class="ri-eye-line"></i>Preview</div><div class="cx d" onclick="deleteFile(\'' + name + '\')"><i class="ri-delete-bin-line"></i>Delete</div>';
  setTimeout(() => document.addEventListener('click', () => { m.classList.add('hide') }, { once: true }), 10);
}

/* == MODAL == */
function showModal(title, label, okText, onOk, type, options, defaultVal) {
  type = type || 'text'; options = options || []; defaultVal = defaultVal || '';
  const root = document.getElementById('modal-root');
  const bg = mk('div', 'modal-bg');
  const box = mk('div', 'modal');
  let inputHTML;
  if (type === 'select') {
    inputHTML = '<select id="modal-input">' + options.map(o => '<option value="' + esc(o) + '">' + esc(o) + '</option>').join('') + '</select>';
  } else {
    inputHTML = '<input id="modal-input" type="' + type + '" placeholder="' + esc(label) + '" value="' + esc(defaultVal) + '">';
  }
  box.innerHTML = '<h3>' + esc(title) + '</h3>' + inputHTML + '<div class="modal-btns"><button class="m-cancel" id="m-cancel">Cancel</button><button class="m-ok" id="m-ok">' + esc(okText) + '</button></div>';
  bg.appendChild(box); root.appendChild(bg);
  const inp = document.getElementById('modal-input');
  setTimeout(() => { inp.focus(); if (type === 'text') inp.select() }, 50);
  const close = () => { try { root.removeChild(bg) } catch (e) { } };
  document.getElementById('m-cancel').onclick = close;
  bg.onclick = e => { if (e.target === bg) close() };
  document.getElementById('m-ok').onclick = () => { onOk(inp.value); close() };
  inp.onkeydown = e => { if (e.key === 'Enter') { onOk(inp.value); close() } if (e.key === 'Escape') close() };
}

/* == UTILS == */
function mk(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el }
function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function toast(msg, type) {
  type = type || 'info';
  const el = document.getElementById('toast'), ic = document.getElementById('ti');
  if (!el || !ic) return;
  document.getElementById('tm').textContent = msg;
  const icons = { info: 'ri-information-line', success: 'ri-checkbox-circle-line', amber: 'ri-error-warning-line', red: 'ri-close-circle-line' };
  const colors = { info: '#5b8def', success: '#46a758', amber: '#f5a623', red: '#e5484d' };
  ic.className = icons[type] || icons.info;
  ic.style.color = colors[type] || colors.info;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

/* Drag/drop binding */
document.body.ondragover = handleDragOver;
document.body.ondragleave = handleDragLeave;
document.body.ondrop = handleDrop;
