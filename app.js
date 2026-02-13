/* ═══════════════════════════════════════════
   Personal Vault — app.js
   Password-only login, Notes, Folders, Files
   ═══════════════════════════════════════════ */

const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co';
const SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';

// ─── HARDCODED LOGIN EMAIL (password-only UI) ───
// The login screen only shows a password field.
// This email is used behind the scenes with Supabase auth.
const AUTH_EMAIL = 'dhruv12306@outlook.com';

let sb;
try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) }
catch (e) { console.error('SB init:', e) }

/* ── STATE ── */
let notes = [];
let activeNote = null;
let saveTimer = null;
let curTab = 'notes';
let folders = JSON.parse(localStorage.getItem('pv_folders') || '[]');
let noteFolder = JSON.parse(localStorage.getItem('pv_notefolder') || '{}');
let currentUser = null;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) startApp(session.user);
  } catch (e) { console.error('Init:', e) }
});

/* ══════════════════════════════════
   AUTH (password-only)
   ══════════════════════════════════ */
async function doLogin() {
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  if (!pass) { err.textContent = 'Enter your password'; return }
  err.textContent = '';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: AUTH_EMAIL, password: pass });
    if (error) throw error;
    startApp(data.user);
  } catch (ex) {
    err.textContent = ex.message || 'Login failed';
  }
}

async function doLogout() {
  try { await sb.auth.signOut() } catch (e) { }
  location.reload();
}

function startApp(user) {
  currentUser = user;
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  loadNotes();
  loadFilesSidebar();
}

/* ══════════════════════════════════
   TABS
   ══════════════════════════════════ */
function switchTab(tab) {
  curTab = tab;
  document.getElementById('tabNotes').classList.toggle('active', tab === 'notes');
  document.getElementById('tabFiles').classList.toggle('active', tab === 'files');
  document.getElementById('tcNotes').classList.toggle('active', tab === 'notes');
  document.getElementById('tcFiles').classList.toggle('active', tab === 'files');
  document.getElementById('emptyState').style.display = tab === 'notes' && !activeNote ? 'flex' : 'none';
  document.getElementById('noteEditor').style.display = tab === 'notes' && activeNote ? 'flex' : 'none';
  document.getElementById('filesView').style.display = tab === 'files' ? 'flex' : 'none';
  if (tab === 'files') renderFilesGrid();
}

/* ══════════════════════════════════
   NOTES
   ══════════════════════════════════ */
async function loadNotes() {
  try {
    let { data, error } = await sb.from('notes').select('*').order('created_at', { ascending: false });
    if (error) { const r = await sb.from('notes').select('*'); data = r.data }
    notes = data || [];
  } catch (e) { notes = []; console.error(e) }
  renderNotesList();
}

function renderNotesList() {
  const list = document.getElementById('notesList');
  list.innerHTML = '';

  folders.forEach((f, fi) => {
    const isOpen = f.open !== false;
    const fNotes = notes.filter(n => noteFolder[n.id] === f.name);
    const section = document.createElement('div');
    section.className = 'folder-section';

    const head = document.createElement('div');
    head.className = 'folder-head' + (isOpen ? '' : ' collapsed');
    head.innerHTML = `<div class="folder-left"><span class="folder-arrow">▼</span><span class="folder-name">📁 ${esc(f.name)}</span></div><div class="folder-acts"><button class="folder-act" onclick="event.stopPropagation();renameFolder(${fi})">✎</button><button class="folder-act" onclick="event.stopPropagation();deleteFolder(${fi})">✕</button></div>`;
    head.onclick = () => { folders[fi].open = !isOpen; saveFolders(); renderNotesList() };
    head.ondragover = e => { e.preventDefault(); head.classList.add('drag-over') };
    head.ondragleave = () => head.classList.remove('drag-over');
    head.ondrop = e => { e.preventDefault(); head.classList.remove('drag-over'); const id = e.dataTransfer.getData('noteId'); if (id) { noteFolder[id] = f.name; saveNoteFolder(); renderNotesList(); toast('Moved to ' + f.name) } };
    section.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'folder-notes' + (isOpen ? '' : ' collapsed');
    fNotes.forEach(n => wrap.appendChild(makeNoteItem(n)));
    if (!fNotes.length) { const em = document.createElement('div'); em.className = 'empty-msg'; em.textContent = 'Empty'; wrap.appendChild(em) }
    section.appendChild(wrap);
    list.appendChild(section);
  });

  const uncatNotes = notes.filter(n => !noteFolder[n.id] || !folders.find(f => f.name === noteFolder[n.id]));
  if (uncatNotes.length || !folders.length) {
    const us = document.createElement('div'); us.className = 'uncat-section';
    if (folders.length) { const uh = document.createElement('div'); uh.className = 'uncat-head'; uh.textContent = 'Uncategorized'; us.appendChild(uh) }
    us.ondragover = e => { e.preventDefault(); us.classList.add('drag-over') };
    us.ondragleave = () => us.classList.remove('drag-over');
    us.ondrop = e => { e.preventDefault(); us.classList.remove('drag-over'); const id = e.dataTransfer.getData('noteId'); if (id) { delete noteFolder[id]; saveNoteFolder(); renderNotesList(); toast('Moved to Uncategorized') } };
    uncatNotes.forEach(n => us.appendChild(makeNoteItem(n)));
    if (!uncatNotes.length && !folders.length) { const em = document.createElement('div'); em.className = 'empty-msg'; em.textContent = 'No notes yet. Click + NEW NOTE.'; us.appendChild(em) }
    list.appendChild(us);
  }
}

function makeNoteItem(n) {
  const div = document.createElement('div');
  div.className = 'note-item' + (activeNote && activeNote.id === n.id ? ' active' : '');
  div.draggable = true;
  div.innerHTML = '<div class="note-title">' + esc(n.title || 'Untitled') + '</div>';
  div.onclick = () => openNote(n.id);
  div.ondragstart = e => { e.dataTransfer.setData('noteId', n.id); div.classList.add('dragging') };
  div.ondragend = () => div.classList.remove('dragging');
  return div;
}

async function newNote() {
  try {
    const { data, error } = await sb.from('notes').insert([{ title: '', content: '' }]).select();
    if (error) throw error;
    if (data && data[0]) { notes.unshift(data[0]); openNote(data[0].id); toast('Note created') }
  } catch (e) { toast('Error: ' + e.message); console.error(e) }
}

function openNote(id) {
  activeNote = notes.find(n => n.id === id) || null;
  if (!activeNote) return;
  renderNotesList();
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('filesView').style.display = 'none';
  document.getElementById('noteEditor').style.display = 'flex';
  document.getElementById('noteTitle').value = activeNote.title || '';
  document.getElementById('noteBody').value = activeNote.content || '';
  updateFooter();
  closeSidebar();
  if (curTab !== 'notes') {
    curTab = 'notes';
    document.getElementById('tabNotes').classList.add('active');
    document.getElementById('tabFiles').classList.remove('active');
    document.getElementById('tcNotes').classList.add('active');
    document.getElementById('tcFiles').classList.remove('active');
  }
}

function handleBodyInput(ta) {
  if (ta.value.endsWith('aistart')) { ta.value = ta.value.slice(0, -7); runAI(ta.value); return }
  autoSave();
}

function autoSave() {
  document.getElementById('editorFoot').textContent = 'Saving...';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 800);
}

async function saveNote() {
  if (!activeNote) return;
  const title = document.getElementById('noteTitle').value;
  const content = document.getElementById('noteBody').value;
  try {
    await sb.from('notes').update({ title, content }).eq('id', activeNote.id);
    activeNote.title = title; activeNote.content = content;
    updateFooter(); renderNotesList();
  } catch (e) { document.getElementById('editorFoot').textContent = 'Error saving'; console.error(e) }
}

function updateFooter() {
  const body = document.getElementById('noteBody').value;
  const w = body.trim() ? body.trim().split(/\s+/).length : 0;
  document.getElementById('editorFoot').textContent = w + ' words · ' + body.length + ' chars · Saved';
}

async function deleteActiveNote() {
  if (!activeNote) return;
  if (!confirm('Delete this note?')) return;
  try {
    await sb.from('notes').delete().eq('id', activeNote.id);
    notes = notes.filter(n => n.id !== activeNote.id);
    delete noteFolder[activeNote.id]; saveNoteFolder();
    activeNote = null;
    document.getElementById('noteEditor').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    renderNotesList(); toast('Deleted');
  } catch (e) { toast('Error'); console.error(e) }
}

/* ── FOLDERS ── */
function newFolder() {
  showInput('New Folder', 'Folder name:', 'CREATE', name => {
    if (!name.trim()) return;
    if (folders.find(f => f.name === name.trim())) { toast('Already exists'); return }
    folders.push({ name: name.trim(), open: true });
    saveFolders(); renderNotesList(); toast('Folder created');
  });
}

function renameFolder(idx) {
  showInput('Rename Folder', 'New name:', 'RENAME', name => {
    if (!name.trim()) return;
    const oldName = folders[idx].name;
    folders[idx].name = name.trim();
    Object.keys(noteFolder).forEach(k => { if (noteFolder[k] === oldName) noteFolder[k] = name.trim() });
    saveFolders(); saveNoteFolder(); renderNotesList(); toast('Renamed');
  }, folders[idx].name);
}

function deleteFolder(idx) {
  if (!confirm('Delete folder "' + folders[idx].name + '"?')) return;
  const name = folders[idx].name;
  folders.splice(idx, 1);
  Object.keys(noteFolder).forEach(k => { if (noteFolder[k] === name) delete noteFolder[k] });
  saveFolders(); saveNoteFolder(); renderNotesList(); toast('Folder deleted');
}

function saveFolders() { localStorage.setItem('pv_folders', JSON.stringify(folders)) }
function saveNoteFolder() { localStorage.setItem('pv_notefolder', JSON.stringify(noteFolder)) }

/* ── MOVE TO FOLDER POPUP ── */
function showMovePopup() {
  if (!activeNote) return;
  const list = document.getElementById('moveList');
  list.innerHTML = '';
  const uncat = document.createElement('div');
  uncat.className = 'popup-opt uncat';
  uncat.textContent = '📦 Uncategorized';
  uncat.onclick = () => { delete noteFolder[activeNote.id]; saveNoteFolder(); renderNotesList(); closePopup('movePopup'); toast('Moved to Uncategorized') };
  list.appendChild(uncat);
  folders.forEach(f => {
    const opt = document.createElement('div');
    opt.className = 'popup-opt';
    opt.textContent = '📁 ' + f.name;
    opt.onclick = () => { noteFolder[activeNote.id] = f.name; saveNoteFolder(); renderNotesList(); closePopup('movePopup'); toast('Moved to ' + f.name) };
    list.appendChild(opt);
  });
  if (!folders.length) { const em = document.createElement('div'); em.className = 'empty-msg'; em.textContent = 'Create folders first'; list.appendChild(em) }
  document.getElementById('movePopup').classList.add('active');
}

/* ── AI ── */
async function runAI(text) {
  if (!text.trim()) { toast('Write something first'); return }
  document.getElementById('editorFoot').textContent = 'AI Working...';
  toast('AI refining... ✨');
  await new Promise(r => setTimeout(r, 800));
  document.getElementById('noteBody').value = humanize(text);
  autoSave(); toast('Text refined!');
}
function humanize(t) {
  t = t.replace(/ {2,}/g, ' ');
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\ba lot of\b/gi, 'many'], [/\bi think\b/gi, 'I believe'], [/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely']].forEach(([p, v]) => { t = t.replace(p, v) });
  return t;
}

/* ══════════════════════════════════
   FILES
   ══════════════════════════════════ */
async function loadFilesSidebar() {
  try {
    const { data } = await sb.storage.from('files').list('');
    const list = document.getElementById('filesList');
    list.innerHTML = '';
    if (data) {
      const items = data.filter(f => f.name !== '.keep');
      items.forEach(f => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = '<div class="note-title">' + fileIcon(f.name) + ' ' + esc(f.name) + '</div>';
        div.onclick = () => switchTab('files');
        list.appendChild(div);
      });
      if (!items.length) list.innerHTML = '<div class="empty-msg">No files yet</div>';
    }
  } catch (e) { console.error(e) }
}

async function renderFilesGrid() {
  try {
    const { data } = await sb.storage.from('files').list('');
    const grid = document.getElementById('filesGrid');
    grid.innerHTML = '';
    if (!data || !data.filter(f => f.name !== '.keep').length) {
      grid.innerHTML = '<div class="empty-msg" style="padding:40px;text-align:center">No files yet. Click UPLOAD to add files.</div>';
      return;
    }
    data.filter(f => f.name !== '.keep').forEach(f => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.innerHTML = `<div class="fc-info"><span class="fc-icon">${fileIcon(f.name)}</span><div class="fc-details"><div class="fc-name">${esc(f.name)}</div><div class="fc-meta">${f.metadata ? fmtSize(f.metadata.size) : ''}</div></div></div><div class="fc-acts"><button class="fc-btn" onclick="previewFile('${esc(f.name)}')">VIEW</button><button class="fc-btn danger" onclick="deleteFile('${esc(f.name)}')">DEL</button></div>`;
      grid.appendChild(card);
    });
  } catch (e) { console.error(e) }
}

async function uploadFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const bar = document.getElementById('uploadBar');
  const txt = document.getElementById('uploadTxt');
  bar.classList.add('active');
  for (let i = 0; i < fileList.length; i++) {
    txt.textContent = 'Uploading ' + (i + 1) + '/' + fileList.length + '...';
    try { await sb.storage.from('files').upload(fileList[i].name, fileList[i]) } catch (e) { console.error(e) }
  }
  bar.classList.remove('active');
  loadFilesSidebar(); renderFilesGrid();
  toast(fileList.length + ' file(s) uploaded');
  document.getElementById('fileInput').value = '';
}

async function previewFile(name) {
  try {
    const { data } = await sb.storage.from('files').createSignedUrl(name, 3600);
    if (data && data.signedUrl) window.open(data.signedUrl, '_blank');
  } catch (e) { console.error(e) }
}

async function deleteFile(name) {
  if (!confirm('Delete "' + name + '"?')) return;
  try {
    await sb.storage.from('files').remove([name]);
    loadFilesSidebar(); renderFilesGrid(); toast('Deleted');
  } catch (e) { toast('Error'); console.error(e) }
}

function fileIcon(n) {
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n)) return '🖼️';
  if (/\.pdf$/i.test(n)) return '📕';
  if (/\.(zip|rar|7z)$/i.test(n)) return '🗜️';
  if (/\.(doc|docx|txt)$/i.test(n)) return '📝';
  if (/\.(mp4|mov|avi)$/i.test(n)) return '🎬';
  if (/\.(mp3|wav|flac)$/i.test(n)) return '🎵';
  return '📄';
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

/* ══════════════════════════════════
   MOBILE SIDEBAR
   ══════════════════════════════════ */
function openSidebar() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sideOverlay').classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sideOverlay').classList.remove('active');
}

/* ══════════════════════════════════
   POPUPS
   ══════════════════════════════════ */
function closePopup(id) { document.getElementById(id).classList.remove('active') }

function showInput(title, placeholder, btnText, onOk, defaultVal) {
  document.getElementById('popupTitle').textContent = title;
  const inp = document.getElementById('popupInput');
  inp.placeholder = placeholder;
  inp.value = defaultVal || '';
  const okBtn = document.getElementById('popupOk');
  okBtn.textContent = btnText;
  document.getElementById('inputPopup').classList.add('active');
  setTimeout(() => { inp.focus(); if (defaultVal) inp.select() }, 100);
  const newBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newBtn, okBtn);
  newBtn.id = 'popupOk';
  const handler = () => { onOk(inp.value); closePopup('inputPopup') };
  newBtn.addEventListener('click', handler);
  inp.onkeydown = e => { if (e.key === 'Enter') handler(); if (e.key === 'Escape') closePopup('inputPopup') };
}

/* ══════════════════════════════════
   UTILS
   ══════════════════════════════════ */
function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '' }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2500);
}
