/* ═══════════════════════════════════════════
   Personal Vault — app.js
   Password-only login · Cloud-synced folders
   ═══════════════════════════════════════════ */

const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co';
const SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
const AUTH_EMAIL = 'dhruv12306@outlook.com';

let sb;
try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) }
catch (e) { console.error('SB init:', e) }

/* ── STATE ── */
let notes = [];
let activeNote = null;
let saveTimer = null;
let configTimer = null;
let curTab = 'notes';
let folders = [];
let noteFolder = {};
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
   AUTH
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
  } catch (ex) { err.textContent = ex.message || 'Login failed' }
}

async function doLogout() {
  try { await sb.auth.signOut() } catch (e) { }
  location.reload();
}

function startApp(user) {
  currentUser = user;
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  loadConfig().then(() => { loadNotes(); loadFilesSidebar() });
}

/* ══════════════════════════════════
   CLOUD CONFIG (folders sync)
   Stored as .vault_config.json in Supabase storage
   ══════════════════════════════════ */
const CONFIG_PATH = '.vault_config.json';

async function loadConfig() {
  try {
    const { data } = await sb.storage.from('files').download(CONFIG_PATH);
    if (data) {
      const text = await data.text();
      const cfg = JSON.parse(text);
      folders = cfg.folders || [];
      noteFolder = cfg.noteFolder || {};
    }
  } catch (e) {
    // Config doesn't exist yet — use localStorage fallback for migration
    folders = JSON.parse(localStorage.getItem('pv_folders') || '[]');
    noteFolder = JSON.parse(localStorage.getItem('pv_notefolder') || '{}');
    // Save to cloud immediately
    saveConfigNow();
  }
}

function saveConfig() {
  // Debounce saves to avoid hammering storage
  if (configTimer) clearTimeout(configTimer);
  configTimer = setTimeout(saveConfigNow, 500);
}

async function saveConfigNow() {
  try {
    const blob = new Blob([JSON.stringify({ folders, noteFolder })], { type: 'application/json' });
    await sb.storage.from('files').upload(CONFIG_PATH, blob, { upsert: true });
  } catch (e) { console.error('Config save error:', e) }
  // Also keep localStorage as local cache
  localStorage.setItem('pv_folders', JSON.stringify(folders));
  localStorage.setItem('pv_notefolder', JSON.stringify(noteFolder));
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
    head.innerHTML = '<div class="folder-left"><span class="folder-arrow">▼</span><span class="folder-name">📁 ' + esc(f.name) + '</span></div><div class="folder-acts"><button class="folder-act" onclick="event.stopPropagation();renameFolder(' + fi + ')">✎</button><button class="folder-act" onclick="event.stopPropagation();deleteFolder(' + fi + ')">✕</button></div>';
    head.onclick = () => { folders[fi].open = !isOpen; saveConfig(); renderNotesList() };
    head.ondragover = e => { e.preventDefault(); head.classList.add('drag-over') };
    head.ondragleave = () => head.classList.remove('drag-over');
    head.ondrop = e => { e.preventDefault(); head.classList.remove('drag-over'); const id = e.dataTransfer.getData('noteId'); if (id) { noteFolder[id] = f.name; saveConfig(); renderNotesList(); toast('Moved to ' + f.name) } };
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
    us.ondrop = e => { e.preventDefault(); us.classList.remove('drag-over'); const id = e.dataTransfer.getData('noteId'); if (id) { delete noteFolder[id]; saveConfig(); renderNotesList(); toast('Moved to Uncategorized') } };
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
    delete noteFolder[activeNote.id]; saveConfig();
    activeNote = null;
    document.getElementById('noteEditor').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    renderNotesList(); toast('Deleted');
  } catch (e) { toast('Error'); console.error(e) }
}

/* ── FOLDERS (cloud synced) ── */
function newFolder() {
  showInput('New Folder', 'Folder name:', 'CREATE', name => {
    if (!name.trim()) return;
    if (folders.find(f => f.name === name.trim())) { toast('Already exists'); return }
    folders.push({ name: name.trim(), open: true });
    saveConfig(); renderNotesList(); toast('Folder created');
  });
}

function renameFolder(idx) {
  showInput('Rename Folder', 'New name:', 'RENAME', name => {
    if (!name.trim()) return;
    const oldName = folders[idx].name;
    folders[idx].name = name.trim();
    Object.keys(noteFolder).forEach(k => { if (noteFolder[k] === oldName) noteFolder[k] = name.trim() });
    saveConfig(); renderNotesList(); toast('Renamed');
  }, folders[idx].name);
}

function deleteFolder(idx) {
  if (!confirm('Delete folder "' + folders[idx].name + '"?')) return;
  const name = folders[idx].name;
  folders.splice(idx, 1);
  Object.keys(noteFolder).forEach(k => { if (noteFolder[k] === name) delete noteFolder[k] });
  saveConfig(); renderNotesList(); toast('Folder deleted');
}

/* ── MOVE TO FOLDER ── */
function showMovePopup() {
  if (!activeNote) return;
  const list = document.getElementById('moveList');
  list.innerHTML = '';
  const uncat = document.createElement('div');
  uncat.className = 'popup-opt uncat'; uncat.textContent = '📦 Uncategorized';
  uncat.onclick = () => { delete noteFolder[activeNote.id]; saveConfig(); renderNotesList(); closePopup('movePopup'); toast('Moved to Uncategorized') };
  list.appendChild(uncat);
  folders.forEach(f => {
    const opt = document.createElement('div'); opt.className = 'popup-opt'; opt.textContent = '📁 ' + f.name;
    opt.onclick = () => { noteFolder[activeNote.id] = f.name; saveConfig(); renderNotesList(); closePopup('movePopup'); toast('Moved to ' + f.name) };
    list.appendChild(opt);
  });
  if (!folders.length) { const em = document.createElement('div'); em.className = 'empty-msg'; em.textContent = 'Create folders first'; list.appendChild(em) }
  document.getElementById('movePopup').classList.add('active');
}

/* ── AI HUMANIZER ── */
async function runAI(text) {
  if (!text.trim()) { toast('Write something first'); return }
  document.getElementById('editorFoot').textContent = 'AI Working...';
  toast('AI refining your text... ✨');
  await new Promise(r => setTimeout(r, 600));
  const result = humanize(text);
  document.getElementById('noteBody').value = result;
  autoSave();
  const changes = countDiffs(text, result);
  toast(changes > 0 ? changes + ' improvements made! ✨' : 'Text looks good already!');
}
function countDiffs(a, b) { const wa = a.split(/\s+/), wb = b.split(/\s+/); let d = 0; for (let i = 0; i < Math.max(wa.length, wb.length); i++) { if (wa[i] !== wb[i]) d++ } return d }
function humanize(t) {
  // Fix spacing
  t = t.replace(/ {2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');

  // Fix common typos/misspellings
  const typos = [[/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely'], [/\boccured\b/gi, 'occurred'], [/\buntill?\b/gi, 'until'], [/\balot\b/gi, 'a lot'], [/\bcould of\b/gi, 'could have'], [/\bshould of\b/gi, 'should have'], [/\bwould of\b/gi, 'would have'], [/\btheir is\b/gi, 'there is'], [/\btheir are\b/gi, 'there are'], [/\byour welcome\b/gi, 'you\'re welcome'], [/\bits a\b/g, 'it\'s a'], [/\bdont\b/g, 'don\'t'], [/\bcant\b/g, 'can\'t'], [/\bwont\b/g, 'won\'t'], [/\bdidnt\b/g, 'didn\'t'], [/\bisnt\b/g, 'isn\'t'], [/\barent\b/g, 'aren\'t'], [/\bcouldnt\b/g, 'couldn\'t'], [/\bshouldnt\b/g, 'shouldn\'t'], [/\bwouldnt\b/g, 'wouldn\'t'], [/\bthats\b/g, 'that\'s'], [/\bwhats\b/g, 'what\'s'], [/\bheres\b/g, 'here\'s'], [/\btheres\b/g, 'there\'s']];
  typos.forEach(([p, v]) => { t = t.replace(p, v) });

  // Upgrade weak vocabulary
  const upgrades = [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bvery sad\b/gi, 'devastated'], [/\bvery tired\b/gi, 'exhausted'], [/\bvery scared\b/gi, 'terrified'], [/\bvery angry\b/gi, 'furious'], [/\bvery important\b/gi, 'crucial'], [/\bvery easy\b/gi, 'effortless'], [/\bvery hard\b/gi, 'challenging'], [/\bvery fast\b/gi, 'rapid'], [/\bvery slow\b/gi, 'sluggish'], [/\bvery old\b/gi, 'ancient'], [/\bvery new\b/gi, 'brand-new'], [/\bvery nice\b/gi, 'delightful'], [/\bvery boring\b/gi, 'tedious'], [/\bvery interesting\b/gi, 'fascinating'], [/\bvery pretty\b/gi, 'gorgeous'], [/\bvery ugly\b/gi, 'hideous'], [/\bvery cold\b/gi, 'freezing'], [/\bvery hot\b/gi, 'scorching'], [/\bvery hungry\b/gi, 'starving'], [/\bvery quiet\b/gi, 'silent'], [/\bvery loud\b/gi, 'deafening'], [/\bvery rich\b/gi, 'wealthy'], [/\bvery poor\b/gi, 'impoverished'], [/\bvery simple\b/gi, 'straightforward'], [/\bvery difficult\b/gi, 'arduous'], [/\bvery strong\b/gi, 'powerful'], [/\bvery weak\b/gi, 'feeble'], [/\bvery bright\b/gi, 'brilliant'], [/\bvery dark\b/gi, 'pitch-black'], [/\bvery clean\b/gi, 'spotless'], [/\bvery dirty\b/gi, 'filthy']];
  upgrades.forEach(([p, v]) => { t = t.replace(p, v) });

  // Remove filler phrases
  const fillers = [[/\bbasically,?\s*/gi, ''], [/\bliterally\s+/gi, ''], [/\bactually,?\s*/gi, ''], [/\bhonestly,?\s*/gi, ''], [/\bjust\s+/gi, ''], [/\breally\s+/gi, ''], [/\bsort of\s+/gi, ''], [/\bkind of\s+/gi, 'somewhat '], [/\byou know,?\s*/gi, ''], [/\blike,\s+/gi, ''], [/\bI mean,?\s*/gi, '']];
  fillers.forEach(([p, v]) => { t = t.replace(p, v) });

  // Improve wordy phrases
  const wordy = [[/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\bat this point in time\b/gi, 'now'], [/\bin the event that\b/gi, 'if'], [/\bfor the purpose of\b/gi, 'to'], [/\bin spite of the fact that\b/gi, 'although'], [/\bwith regard to\b/gi, 'regarding'], [/\bin the near future\b/gi, 'soon'], [/\ba large number of\b/gi, 'many'], [/\ba lot of\b/gi, 'many'], [/\bgave an explanation\b/gi, 'explained'], [/\bmade a decision\b/gi, 'decided'], [/\btook into consideration\b/gi, 'considered'], [/\bhad a discussion\b/gi, 'discussed'], [/\bis able to\b/gi, 'can'], [/\bhas the ability to\b/gi, 'can'], [/\bin my opinion,?\s*/gi, ''], [/\bi think\b/gi, 'I believe'], [/\bi feel like\b/gi, 'I sense that'], [/\bat the end of the day\b/gi, 'ultimately'], [/\bneedless to say\b/gi, 'clearly'], [/\bit goes without saying\b/gi, 'clearly'], [/\bthe fact that\b/gi, 'that'], [/\bin today's world\b/gi, 'today'], [/\beach and every\b/gi, 'every'], [/\bfirst and foremost\b/gi, 'first']];
  wordy.forEach(([p, v]) => { t = t.replace(p, v) });

  // Capitalize after sentence endings
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());

  // Fix double punctuation
  t = t.replace(/([.!?])\1+/g, '$1');
  t = t.replace(/\s+([.!?,;:])/g, '$1');

  // Trim whitespace
  t = t.replace(/^ +| +$/gm, '');
  t = t.replace(/ {2,}/g, ' ');

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
      const items = data.filter(f => f.name !== '.keep' && f.name !== CONFIG_PATH);
      items.forEach(f => {
        const div = document.createElement('div'); div.className = 'note-item';
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
    const items = (data || []).filter(f => f.name !== '.keep' && f.name !== CONFIG_PATH);
    if (!items.length) {
      grid.innerHTML = '<div class="empty-msg" style="padding:40px;text-align:center">No files yet. Click UPLOAD to add files.</div>';
      return;
    }
    items.forEach(f => {
      const card = document.createElement('div'); card.className = 'file-card';
      card.innerHTML = '<div class="fc-info"><span class="fc-icon">' + fileIcon(f.name) + '</span><div class="fc-details"><div class="fc-name">' + esc(f.name) + '</div><div class="fc-meta">' + (f.metadata ? fmtSize(f.metadata.size) : '') + '</div></div></div><div class="fc-acts"><button class="fc-btn" onclick="previewFile(\'' + esc(f.name) + '\')">VIEW</button><button class="fc-btn danger" onclick="deleteFile(\'' + esc(f.name) + '\')">DEL</button></div>';
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
  inp.placeholder = placeholder; inp.value = defaultVal || '';
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
