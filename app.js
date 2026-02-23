/* ═══════════════════════════════════════════
   Personal Vault — app.js (Merged)
   AI · Search · Realtime · Cloudinary · Folders
   ═══════════════════════════════════════════ */

const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co';
const SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
const AUTH_EMAIL = 'dhruv12306@outlook.com';

// Cloudinary Config
const CLOUDINARY_CLOUD_NAME = 'dfn3vpzbj';
const CLOUDINARY_UPLOAD_PRESET = 'notes_uploads';

let sb;
try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) }
catch (e) { console.error('SB init:', e) }

/* ── STATE ── */
let notes = [];
let folders = [];
let files = [];
let activeNote = null;
let currentUser = null;
let saveTimer = null;
let curTab = 'notes';
let collapsedFolders = {};
let realtimeChannel = null;
let searchQuery = '';

// AI state
const HARDCODED_KEY = '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';
let geminiKey = HARDCODED_KEY;
let lastAiTime = 0;
const AI_COOLDOWN = 10000;

// Drag state
let draggedNoteId = null;
let draggedFileId = null;
let dragStartTime = 0;
let touchStartX = 0, touchStartY = 0;
let isDragging = false;
let draggedElement = null;
let ghostElement = null;

// Speech state
let isRecording = false;
let recognition;
let speechBuffer = '';
let speechFlushTimer = null;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) startApp(session.user);
  } catch (e) { console.error('Init:', e) }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); if (currentUser) newNote() }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (activeNote) saveNote() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const si = document.getElementById('searchInput'); if (si) { si.focus(); si.select() } }
    if (e.key === 'Escape') { closeFolderPopup(); closePopup('inputPopup'); closePopup('settingsPopup') }
  });
});

/* ══════════════════════════════════
   AUTH (Supabase Auth)
   ══════════════════════════════════ */
async function doLogin() {
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  if (!pass) { err.textContent = 'Enter your password'; return }
  err.textContent = '';
  showLoading();
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: AUTH_EMAIL, password: pass });
    if (error) {
      if (error.message.includes('not found') || error.message.includes('Invalid login')) {
        err.textContent = 'Invalid password. Try again.';
      } else { throw error; }
      return;
    }
    startApp(data.user);
  } catch (ex) { err.textContent = ex.message || 'Login failed' }
  finally { hideLoading() }
}

async function doLogout() {
  if (!confirm('Logout?')) return;
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  try { await sb.auth.signOut() } catch (e) { }
  location.reload();
}

async function handleChangePassword() {
  const newPass = prompt('Enter your NEW password (min 6 characters):');
  if (!newPass) return;
  if (newPass.length < 6) { toast('Password must be at least 6 characters'); return; }
  const confirm2 = prompt('Confirm your new password:');
  if (newPass !== confirm2) { toast('Passwords do not match!'); return; }
  showLoading();
  try {
    const { error } = await sb.auth.updateUser({ password: newPass });
    if (error) throw error;
    toast('Password changed! Please sign in again.');
    await sb.auth.signOut();
    location.reload();
  } catch (e) { toast('Failed: ' + e.message); }
  finally { hideLoading(); }
}

function startApp(user) {
  currentUser = user;
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  loadData();
  // Load saved gemini key from localStorage
  const storedKey = localStorage.getItem('pv_geminikey');
  if (storedKey) geminiKey = storedKey;
}

/* ══════════════════════════════════
   DATA LOADING
   ══════════════════════════════════ */
async function loadData() {
  if (!sb || !currentUser) return;
  showLoading();
  try {
    const { data: foldersData } = await sb.from('folders').select('*').order('created_at', { ascending: true });
    folders = foldersData || [];
    folders.forEach(f => { collapsedFolders[f.id] = true; });

    const { data: notesData } = await sb.from('notes').select('*').order('created_at', { ascending: false });
    notes = notesData || [];

    renderNotesList();
    setupDragAndDrop();

    if (notes.length === 0) {
      document.getElementById('emptyState').style.display = 'flex';
      document.getElementById('noteEditor').style.display = 'none';
    }
    setupRealtimeSync();
  } catch (e) { toast('Error loading data: ' + e.message); console.error(e); }
  finally { hideLoading(); }
}

/* ══════════════════════════════════
   REAL-TIME SYNC
   ══════════════════════════════════ */
function setupRealtimeSync() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  const ch = 'vault-sync-' + Math.random().toString(36).slice(2, 8);
  realtimeChannel = sb.channel(ch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, handleNoteRealtimeChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, handleFolderRealtimeChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, handleFileRealtimeChange)
    .subscribe(status => { updateSyncStatus(status); });
}

function updateSyncStatus(status) {
  const el = document.getElementById('syncStatusDot');
  if (!el) return;
  if (status === 'SUBSCRIBED') el.textContent = '🟢 Live';
  else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') el.textContent = '🔴 Offline';
  else el.textContent = '🟡 Connecting...';
}

function handleNoteRealtimeChange(payload) {
  const { eventType, new: nr, old: or } = payload;
  if (eventType === 'INSERT') {
    if (!notes.find(n => n.id === nr.id)) { notes.unshift(nr); renderNotesList(); setupDragAndDrop(); }
  } else if (eventType === 'UPDATE') {
    const idx = notes.findIndex(n => n.id === nr.id);
    if (idx === -1) return;
    const isCurrent = activeNote && activeNote.id === nr.id;
    const hasUnsaved = saveTimer !== null;
    if (isCurrent && hasUnsaved) {
      notes[idx] = { ...nr, title: activeNote.title, content: activeNote.content };
    } else {
      notes[idx] = nr;
      if (isCurrent) {
        document.getElementById('noteTitle').value = nr.title || '';
        document.getElementById('noteBody').value = nr.content || '';
        activeNote = nr;
        document.getElementById('footStatus').textContent = '✦ Synced from another device';
        setTimeout(() => { document.getElementById('footStatus').textContent = 'Saved ✓'; }, 3000);
      }
    }
    renderNotesList(); setupDragAndDrop();
  } else if (eventType === 'DELETE') {
    const did = or && or.id;
    if (!did) return;
    const wasCurrent = activeNote && activeNote.id === did;
    notes = notes.filter(n => n.id !== did);
    if (wasCurrent) { activeNote = null; document.getElementById('emptyState').style.display = 'flex'; document.getElementById('noteEditor').style.display = 'none'; }
    renderNotesList(); setupDragAndDrop();
  }
}

function handleFolderRealtimeChange(payload) {
  const { eventType, new: nr, old: or } = payload;
  if (eventType === 'INSERT') {
    if (!folders.find(f => f.id === nr.id)) { folders.push(nr); collapsedFolders[nr.id] = true; renderNotesList(); renderFilesList(); setupDragAndDrop(); }
  } else if (eventType === 'UPDATE') {
    const idx = folders.findIndex(f => f.id === nr.id);
    if (idx !== -1) { folders[idx] = nr; renderNotesList(); renderFilesList(); setupDragAndDrop(); }
  } else if (eventType === 'DELETE') {
    const did = or && or.id;
    if (!did) return;
    folders = folders.filter(f => f.id !== did);
    delete collapsedFolders[did];
    notes.forEach(n => { if (n.folder_id === did) n.folder_id = null; });
    files.forEach(f => { if (f.folder_id === did) f.folder_id = null; });
    renderNotesList(); renderFilesList(); setupDragAndDrop();
  }
}

function handleFileRealtimeChange(payload) {
  const { eventType, new: nr, old: or } = payload;
  if (eventType === 'INSERT') {
    if (!files.find(f => f.id === nr.id)) { files.unshift(nr); if (curTab === 'files') { renderFilesList(); renderFilesGrid(); setupDragAndDrop(); } }
  } else if (eventType === 'UPDATE') {
    const idx = files.findIndex(f => f.id === nr.id);
    if (idx !== -1) { files[idx] = nr; if (curTab === 'files') { renderFilesList(); renderFilesGrid(); setupDragAndDrop(); } }
  } else if (eventType === 'DELETE') {
    const did = or && or.id;
    if (!did) return;
    files = files.filter(f => f.id !== did);
    if (curTab === 'files') { renderFilesList(); renderFilesGrid(); setupDragAndDrop(); }
  }
}

/* ══════════════════════════════════
   TABS & SEARCH
   ══════════════════════════════════ */
function switchTab(tab) {
  curTab = tab;
  document.getElementById('tabNotes').classList.toggle('active', tab === 'notes');
  document.getElementById('tabFiles').classList.toggle('active', tab === 'files');
  document.getElementById('tcNotes').classList.toggle('active', tab === 'notes');
  document.getElementById('tcFiles').classList.toggle('active', tab === 'files');
  if (tab === 'notes') {
    document.getElementById('filesView').style.display = 'none';
    if (activeNote) { document.getElementById('emptyState').style.display = 'none'; document.getElementById('noteEditor').style.display = 'flex'; }
    else { document.getElementById('emptyState').style.display = 'flex'; document.getElementById('noteEditor').style.display = 'none'; }
  } else {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('noteEditor').style.display = 'none';
    document.getElementById('filesView').style.display = 'flex';
    loadFiles();
  }
  closeSidebar();
}

function searchNotes(q) { searchQuery = q.toLowerCase().trim(); renderNotesList(); }
function matchesSearch(n) { if (!searchQuery) return true; return (n.title || '').toLowerCase().includes(searchQuery) || (n.content || '').toLowerCase().includes(searchQuery); }

/* ══════════════════════════════════
   NOTES CRUD
   ══════════════════════════════════ */
async function newNote() {
  showLoading();
  try {
    const { data, error } = await sb.from('notes').insert([{ title: '', content: '', folder_id: null }]).select().single();
    if (error) throw error;
    notes.unshift(data);
    renderNotesList(); setupDragAndDrop();
    openNote(data.id);
    closeSidebar();
    toast('Note created');
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); }
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
  const val = ta.value;
  const triggerMatch = val.match(/(aistart|ai start|@ai|\/ai)\s?$/i);
  if (triggerMatch) { ta.value = val.slice(0, -triggerMatch[0].length); triggerAI(); return; }
  handleNoteChange();
}

function handleNoteChange() {
  if (!activeNote) return;
  const title = document.getElementById('noteTitle').value;
  const content = document.getElementById('noteBody').value;
  activeNote.title = title;
  activeNote.content = content;
  document.getElementById('footStatus').textContent = 'Saving...';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const { error } = await sb.from('notes').update({ title, content, updated_at: new Date().toISOString() }).eq('id', activeNote.id);
      if (error) throw error;
      document.getElementById('footStatus').textContent = 'Saved ✓';
      renderNotesList(); setupDragAndDrop();
    } catch (e) { document.getElementById('footStatus').textContent = 'Error'; console.error(e); }
  }, 1000);
  updateStats();
}

async function saveNote() {
  if (!activeNote) return;
  const title = document.getElementById('noteTitle').value;
  const content = document.getElementById('noteBody').value;
  try {
    await sb.from('notes').update({ title, content }).eq('id', activeNote.id);
    activeNote.title = title; activeNote.content = content;
    document.getElementById('footStatus').textContent = 'Saved ✓';
    renderNotesList();
  } catch (e) { document.getElementById('footStatus').textContent = 'Error'; console.error(e) }
}

async function deleteActiveNote() {
  if (!activeNote) return;
  if (!confirm('Delete "' + (activeNote.title || 'Untitled') + '"?')) return;
  await performDelete(activeNote.id);
}

async function performDelete(id) {
  showLoading();
  try {
    await sb.from('notes').delete().eq('id', id);
    notes = notes.filter(n => n.id !== id);
    if (activeNote && activeNote.id === id) {
      activeNote = null;
      document.getElementById('noteEditor').style.display = 'none';
      document.getElementById('emptyState').style.display = 'flex';
    }
    renderNotesList(); setupDragAndDrop(); toast('Note deleted');
  } catch (e) { toast('Error'); console.error(e) }
  finally { hideLoading(); }
}

function updateStats() {
  const body = document.getElementById('noteBody').value;
  const w = body.trim() ? body.trim().split(/\s+/).length : 0;
  document.getElementById('footStats').textContent = w + ' words · ' + body.length + ' chars';
}
function updateFooter() { updateStats(); document.getElementById('footStatus').textContent = 'Saved ✓'; }

/* ══════════════════════════════════
   NOTES LIST RENDERING
   ══════════════════════════════════ */
function renderNotesList() {
  const list = document.getElementById('notesList');
  if (notes.length === 0 && folders.length === 0) { list.innerHTML = '<div class="empty-msg">No notes yet</div>'; return; }
  let html = '';
  const noteFolders = folders.filter(f => f.type === 'note' || !f.type);
  const notesByFolder = {};
  notes.forEach(n => { if (n.folder_id) { if (!notesByFolder[n.folder_id]) notesByFolder[n.folder_id] = []; notesByFolder[n.folder_id].push(n); } });

  noteFolders.forEach(folder => {
    const fNotes = (notesByFolder[folder.id] || []).filter(matchesSearch);
    const isCollapsed = collapsedFolders[folder.id];
    html += '<div class="folder-section"><div class="folder-head ' + (isCollapsed ? 'collapsed' : '') + '" data-folder-id="' + folder.id + '" onclick="toggleFolder(\'' + folder.id + '\')"><div class="folder-left"><span class="folder-arrow">▶</span><span class="folder-name">📁 ' + esc(folder.name) + '</span><span class="folder-count">' + fNotes.length + '</span></div><div class="folder-acts"><button class="folder-act" onclick="event.stopPropagation();renameFolder(\'' + folder.id + '\')">✎</button><button class="folder-act danger" onclick="event.stopPropagation();deleteFolder(\'' + folder.id + '\')">✕</button></div></div><div class="folder-notes ' + (isCollapsed ? 'collapsed' : '') + '">';
    if (!fNotes.length && !searchQuery) html += '<div class="empty-msg">Empty folder</div>';
    fNotes.forEach(n => { html += noteItemHtml(n); });
    html += '</div></div>';
  });

  const uncatNotes = notes.filter(n => !n.folder_id && matchesSearch(n));
  if (uncatNotes.length > 0 || noteFolders.length > 0) {
    html += '<div class="uncat-section" data-drop-zone="uncategorized">';
    if (noteFolders.length) html += '<div class="uncat-head">📋 Uncategorized</div>';
    uncatNotes.forEach(n => { html += noteItemHtml(n); });
    html += '</div>';
  }

  if (searchQuery) {
    const total = notes.filter(matchesSearch).length;
    if (!total) html = '<div class="empty-msg">No notes matching "' + esc(searchQuery) + '"</div>';
  }
  list.innerHTML = html;
}

function noteItemHtml(n) {
  const isActive = activeNote && activeNote.id === n.id;
  return '<div class="note-item ' + (isActive ? 'active' : '') + '" draggable="true" data-note-id="' + n.id + '" onclick="openNote(\'' + n.id + '\')"><div class="note-info"><div class="note-title">' + esc(n.title || 'Untitled') + '</div><div class="note-date">' + timeAgo(n.created_at) + '</div></div></div>';
}

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ══════════════════════════════════
   FOLDERS (DB-driven)
   ══════════════════════════════════ */
function toggleFolder(folderId) { collapsedFolders[folderId] = !collapsedFolders[folderId]; renderNotesList(); renderFilesList(); setupDragAndDrop(); }

async function newFolder(type) {
  showInput('New Folder', 'Folder name', 'CREATE', async name => {
    if (!name.trim()) return;
    showLoading();
    try {
      const { data, error } = await sb.from('folders').insert([{ name: name.trim(), type: type || 'note' }]).select().single();
      if (error) throw error;
      folders.push(data); collapsedFolders[data.id] = true;
      renderNotesList(); renderFilesList(); renderFilesGrid(); setupDragAndDrop(); toast('Folder created');
    } catch (e) { toast('Error: ' + e.message); }
    finally { hideLoading(); }
  });
}

async function renameFolder(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  showInput('Rename Folder', 'New name', 'RENAME', async name => {
    if (!name.trim() || name === folder.name) return;
    showLoading();
    try {
      const { error } = await sb.from('folders').update({ name: name.trim() }).eq('id', folderId);
      if (error) throw error;
      folder.name = name.trim();
      renderNotesList(); renderFilesList(); renderFilesGrid(); setupDragAndDrop(); toast('Renamed');
    } catch (e) { toast('Error: ' + e.message); }
    finally { hideLoading(); }
  }, folder.name);
}

async function deleteFolder(folderId) {
  if (!confirm('Delete this folder? Notes inside will be moved to Uncategorized.')) return;
  showLoading();
  try {
    const { error } = await sb.from('folders').delete().eq('id', folderId);
    if (error) throw error;
    folders = folders.filter(f => f.id !== folderId);
    notes.forEach(n => { if (n.folder_id === folderId) n.folder_id = null; });
    files.forEach(f => { if (f.folder_id === folderId) f.folder_id = null; });
    delete collapsedFolders[folderId];
    renderNotesList(); renderFilesList(); renderFilesGrid(); setupDragAndDrop(); toast('Folder deleted');
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); }
}

/* ══════════════════════════════════
   FOLDER POPUP (Move note to folder)
   ══════════════════════════════════ */
function showFolderPopup() {
  if (!activeNote) return;
  const list = document.getElementById('folderPopupList');
  let html = '<div class="popup-opt uncat" onclick="moveNoteToFolder(null)"><span>📄</span> No Folder (Uncategorized)</div>';
  const noteFolders = folders.filter(f => f.type === 'note' || !f.type);
  noteFolders.forEach(f => {
    const isActive = activeNote.folder_id === f.id;
    html += '<div class="popup-opt ' + (isActive ? 'active' : '') + '" onclick="moveNoteToFolder(\'' + f.id + '\')"><span>📁</span> ' + esc(f.name) + '</div>';
  });
  list.innerHTML = html;
  document.getElementById('folderPopup').classList.add('active');
}

function closeFolderPopup() { document.getElementById('folderPopup').classList.remove('active'); }

async function moveNoteToFolder(folderId) {
  if (!activeNote) return;
  closeFolderPopup(); showLoading();
  try {
    const { error } = await sb.from('notes').update({ folder_id: folderId }).eq('id', activeNote.id);
    if (error) throw error;
    activeNote.folder_id = folderId;
    renderNotesList(); setupDragAndDrop();
    toast(folderId ? 'Moved to folder' : 'Moved to Uncategorized');
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); }
}

/* ══════════════════════════════════
   DRAG AND DROP (Desktop + Touch)
   ══════════════════════════════════ */
function setupDragAndDrop() {
  const noteItems = document.querySelectorAll('.note-item[draggable="true"]');
  const fileItems = document.querySelectorAll('.file-item[draggable="true"], .file-card[draggable="true"]');
  const folderHeaders = document.querySelectorAll('.folder-head');
  const uncatSection = document.querySelector('.uncat-section');
  const all = [...noteItems, ...fileItems];
  all.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('touchstart', handleTouchStart, { passive: false });
    item.addEventListener('touchmove', handleTouchMove, { passive: false });
    item.addEventListener('touchend', handleTouchEnd, { passive: false });
  });
  folderHeaders.forEach(h => {
    h.addEventListener('dragover', e => { if (!draggedNoteId && !draggedFileId) return; e.preventDefault(); h.classList.add('drag-over'); });
    h.addEventListener('dragleave', e => { h.classList.remove('drag-over'); });
    h.addEventListener('drop', handleDrop);
  });
  if (uncatSection) {
    uncatSection.addEventListener('dragover', e => { if (!draggedNoteId && !draggedFileId) return; e.preventDefault(); uncatSection.classList.add('drag-over'); });
    uncatSection.addEventListener('dragleave', () => uncatSection.classList.remove('drag-over'));
    uncatSection.addEventListener('drop', handleUncategorizedDrop);
  }
}

function handleDragStart(e) {
  dragStartTime = Date.now();
  draggedNoteId = e.currentTarget.dataset.noteId || null;
  draggedFileId = e.currentTarget.dataset.fileId || null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function handleDragEnd(e) { e.currentTarget.classList.remove('dragging'); draggedNoteId = null; draggedFileId = null; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); }

async function handleDrop(e) {
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedNoteId && !draggedFileId) return;
  if (Date.now() - dragStartTime < 100) return;
  const folderId = e.currentTarget.dataset.folderId;
  if (!folderId) return;
  if (draggedNoteId) { await moveNoteToFolderById(draggedNoteId, folderId); draggedNoteId = null; }
  else if (draggedFileId) { await moveFileToFolderById(draggedFileId, folderId); draggedFileId = null; }
}

async function handleUncategorizedDrop(e) {
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedNoteId && !draggedFileId) return;
  if (Date.now() - dragStartTime < 100) return;
  if (draggedNoteId) { await moveNoteToFolderById(draggedNoteId, null); draggedNoteId = null; }
  else if (draggedFileId) { await moveFileToFolderById(draggedFileId, null); draggedFileId = null; }
}

async function moveNoteToFolderById(noteId, folderId) {
  const note = notes.find(n => n.id === noteId);
  if (!note || note.folder_id === folderId) return;
  showLoading();
  try {
    const { error } = await sb.from('notes').update({ folder_id: folderId }).eq('id', noteId);
    if (error) throw error;
    note.folder_id = folderId;
    if (activeNote && activeNote.id === noteId) activeNote.folder_id = folderId;
    renderNotesList(); setupDragAndDrop();
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); }
}

async function moveFileToFolderById(fileId, folderId) {
  showLoading();
  try {
    const { error } = await sb.from('files').update({ folder_id: folderId }).eq('id', fileId);
    if (error) throw error;
    const file = files.find(f => f.id === fileId);
    if (file) file.folder_id = folderId;
    loadFiles();
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); }
}

// Touch drag support
function handleTouchStart(e) {
  const touch = e.touches[0]; touchStartX = touch.clientX; touchStartY = touch.clientY;
  isDragging = false; draggedElement = e.currentTarget;
  draggedNoteId = draggedElement.dataset.noteId || null;
  draggedFileId = draggedElement.dataset.fileId || null;
  dragStartTime = Date.now();
}
function handleTouchMove(e) {
  if (!draggedElement) return;
  const touch = e.touches[0];
  if (!isDragging && (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10)) {
    isDragging = true; e.preventDefault();
    ghostElement = draggedElement.cloneNode(true);
    ghostElement.classList.add('ghost-dragging');
    Object.assign(ghostElement.style, { position: 'fixed', width: draggedElement.offsetWidth + 'px', pointerEvents: 'none', zIndex: '9999', opacity: '0.8' });
    document.body.appendChild(ghostElement);
    draggedElement.classList.add('dragging');
  }
  if (isDragging) {
    e.preventDefault();
    if (ghostElement) { ghostElement.style.left = (touch.clientX - ghostElement.offsetWidth / 2) + 'px'; ghostElement.style.top = (touch.clientY - 30) + 'px'; }
    const below = document.elementFromPoint(touch.clientX, touch.clientY);
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (below) { const fh = below.closest('.folder-head'); const us = below.closest('.uncat-section'); if (fh) fh.classList.add('drag-over'); else if (us) us.classList.add('drag-over'); }
  }
}
async function handleTouchEnd(e) {
  if (!isDragging) { draggedElement = null; draggedNoteId = null; draggedFileId = null; return; }
  e.preventDefault();
  const touch = e.changedTouches[0]; const below = document.elementFromPoint(touch.clientX, touch.clientY);
  if (ghostElement) { ghostElement.remove(); ghostElement = null; }
  if (draggedElement) draggedElement.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (below && (draggedNoteId || draggedFileId)) {
    const fh = below.closest('.folder-head'); const us = below.closest('.uncat-section');
    if (fh) { const fid = fh.dataset.folderId; if (fid) { if (draggedNoteId) await moveNoteToFolderById(draggedNoteId, fid); else if (draggedFileId) await moveFileToFolderById(draggedFileId, fid); } }
    else if (us) { if (draggedNoteId) await moveNoteToFolderById(draggedNoteId, null); else if (draggedFileId) await moveFileToFolderById(draggedFileId, null); }
  }
  isDragging = false; draggedElement = null; draggedNoteId = null; draggedFileId = null;
}

/* ══════════════════════════════════
   MIC / SPEECH (CLEAN OUTPUT)
   ══════════════════════════════════ */
function cleanSpeechText(raw) {
  let t = raw;
  t = t.replace(/\b(um|uh|uhh|umm|hmm|hm|er|err|ah|ahh|like|you know|i mean|basically|so like|well like)\b/gi, '');
  t = t.replace(/  +/g, ' ').trim();
  t = t.replace(/^\w/, c => c.toUpperCase());
  if (t.length > 0 && !/[.!?]$/.test(t)) t += '.';
  return t;
}
function flushSpeechBuffer() {
  if (!speechBuffer.trim()) return;
  const cleaned = cleanSpeechText(speechBuffer);
  if (!cleaned || cleaned === '.') { speechBuffer = ''; return; }
  const body = document.getElementById('noteBody');
  const existing = body.value;
  const separator = existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith(' ') ? ' ' : '';
  body.value = existing + separator + cleaned;
  speechBuffer = '';
  handleNoteChange();
}
function toggleMic() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { toast('Speech not supported in this browser'); return; }
  if (isRecording) { recognition.stop(); if (speechFlushTimer) clearTimeout(speechFlushTimer); flushSpeechBuffer(); return; }
  recognition = new Recognition();
  recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
  recognition.onstart = () => { isRecording = true; speechBuffer = ''; const btn = document.getElementById('micBtn'); btn.classList.add('recording'); btn.textContent = '⏹️'; toast('🎤 Listening... speak naturally'); };
  recognition.onend = () => { if (isRecording) { try { recognition.start(); } catch (e) { } return; } const btn = document.getElementById('micBtn'); btn.classList.remove('recording'); btn.textContent = '🎤'; flushSpeechBuffer(); toast('🎤 Mic OFF — text saved'); };
  recognition.onresult = (event) => { for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) speechBuffer += ' ' + event.results[i][0].transcript; } if (speechFlushTimer) clearTimeout(speechFlushTimer); speechFlushTimer = setTimeout(flushSpeechBuffer, 1500); };
  recognition.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; toast('Speech error: ' + e.error); isRecording = false; const btn = document.getElementById('micBtn'); btn.classList.remove('recording'); btn.textContent = '🎤'; };
  recognition.start();
}

/* ══════════════════════════════════
   AI HUMANIZER (OpenRouter + fallback)
   ══════════════════════════════════ */
async function triggerAI() {
  if (!activeNote) { toast('Open a note first'); return }
  const now = Date.now();
  if (now - lastAiTime < AI_COOLDOWN) { toast(`Please wait ${Math.ceil((AI_COOLDOWN - (now - lastAiTime)) / 1000)}s before next humanization`); return; }
  const text = document.getElementById('noteBody').value;
  if (!text.trim()) { toast('Write something first'); return }
  document.getElementById('aiLoading').classList.add('active');
  document.getElementById('footStatus').textContent = 'AI Working...';
  try {
    let result, usedAI = false;
    if (geminiKey) { try { result = await callGemini(text); usedAI = true; } catch (apiErr) { toast('API unavailable — using local humanizer'); result = humanize(text); } }
    else { await new Promise(r => setTimeout(r, 400)); result = humanize(text); }
    if (result && result.trim()) { document.getElementById('noteBody').value = result; lastAiTime = Date.now(); handleNoteChange(); toast(usedAI ? 'AI rewrite complete! ✨' : 'Text humanized locally ✓'); }
    else { toast('AI returned empty — try again'); }
  } catch (e) { toast('Error: ' + e.message); }
  finally { document.getElementById('aiLoading').classList.remove('active'); }
}

const FREE_MODELS = ['google/gemini-2.0-flash-001', 'google/gemini-flash-1.5', 'mistralai/mistral-small-24b-instruct-2501:free', 'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free'];

async function callGemini(text) {
  const prompt = `You are a world-class ghostwriter. Rewrite the following text so it reads as if a thoughtful, articulate person naturally wrote it.\nRules:\n1. VARY sentence length — mix short punchy with longer flowing ones.\n2. Use NATURAL transitions — "Look," "Here's the thing," "What's interesting is,"\n3. Replace generic words: "utilize" → "use", "implement" → "set up/build"\n4. Add subtle PERSONALITY — occasional rhetorical questions, mild emphasis.\n5. ELIMINATE academic stiffness: no "It is worth noting that"\n6. Use CONTRACTIONS naturally: "it's", "don't", "we're"\n7. Break up walls of text into digestible paragraphs.\n8. KEEP the original meaning, facts, and intent intact.\n9. Return ONLY the rewritten text. No explanations.`;
  let lastError = '';
  for (const model of FREE_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + geminiKey, 'HTTP-Referer': window.location.href, 'X-Title': 'Personal Vault' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }], temperature: 0.7, max_tokens: 4000 })
      });
      clearTimeout(timeout);
      const raw = await res.text(); let data;
      try { data = JSON.parse(raw); } catch { lastError = 'Invalid JSON from ' + model; continue; }
      if (!res.ok) { lastError = data?.error?.message || 'HTTP ' + res.status; continue; }
      const content = data?.choices?.[0]?.message?.content;
      if (content && content.trim().length > 10) return content.trim();
      lastError = 'Empty response from ' + model;
    } catch (e) { lastError = e.name === 'AbortError' ? 'Timeout on ' + model : e.message; }
  }
  throw new Error(lastError);
}

function humanize(t) {
  t = t.replace(/ {2,}/g, ' '); t = t.replace(/\n{3,}/g, '\n\n');
  [[/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely'], [/\boccured\b/gi, 'occurred'], [/\buntill?\b/gi, 'until'], [/\balot\b/gi, 'a lot'], [/\bcould of\b/gi, 'could have'], [/\bshould of\b/gi, 'should have'], [/\bwould of\b/gi, 'would have'], [/\bdont\b/g, "don't"], [/\bcant\b/g, "can't"], [/\bwont\b/g, "won't"], [/\bdidnt\b/g, "didn't"], [/\bisnt\b/g, "isn't"], [/\barent\b/g, "aren't"]].forEach(([p, v]) => { t = t.replace(p, v) });
  [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bvery sad\b/gi, 'devastated'], [/\bvery tired\b/gi, 'exhausted'], [/\bvery important\b/gi, 'crucial'], [/\bvery easy\b/gi, 'effortless'], [/\bvery hard\b/gi, 'challenging']].forEach(([p, v]) => { t = t.replace(p, v) });
  [[/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\bat this point in time\b/gi, 'now'], [/\bin the event that\b/gi, 'if'], [/\bfor the purpose of\b/gi, 'to'], [/\ba lot of\b/gi, 'many'], [/\bi think\b/gi, 'I believe']].forEach(([p, v]) => { t = t.replace(p, v) });
  [[/\bbasically,?\s*/gi, ''], [/\bliterally\s+/gi, ''], [/\bhonestly,?\s*/gi, ''], [/\bsort of\s+/gi, ''], [/\byou know,?\s*/gi, '']].forEach(([p, v]) => { t = t.replace(p, v) });
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  t = t.replace(/([.!?])\1+/g, '$1'); t = t.replace(/\s+([.!?,;:])/g, '$1');
  t = t.replace(/^ +| +$/gm, ''); t = t.replace(/ {2,}/g, ' ');
  return t;
}

/* ══════════════════════════════════
   FILES (Cloudinary + Supabase DB)
   ══════════════════════════════════ */
async function loadFiles() {
  if (!sb || !currentUser) return;
  showLoading();
  try {
    const { data, error } = await sb.from('files').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    files = data || [];
    renderFilesList(); renderFilesGrid(); setupDragAndDrop();
  } catch (e) { files = []; renderFilesList(); renderFilesGrid(); }
  finally { hideLoading(); }
}

function renderFilesList() {
  const list = document.getElementById('filesList');
  if (files.length === 0 && folders.filter(f => f.type === 'file').length === 0) { list.innerHTML = '<div class="empty-msg">No files yet</div>'; return; }
  let html = '';
  const fileFolders = folders.filter(f => f.type === 'file');
  const filesByFolder = {};
  files.forEach(f => { if (f.folder_id) { if (!filesByFolder[f.folder_id]) filesByFolder[f.folder_id] = []; filesByFolder[f.folder_id].push(f); } });
  fileFolders.forEach(folder => {
    const ff = filesByFolder[folder.id] || [];
    const isCollapsed = collapsedFolders[folder.id];
    html += '<div class="folder-section"><div class="folder-head ' + (isCollapsed ? 'collapsed' : '') + '" data-folder-id="' + folder.id + '" onclick="toggleFolder(\'' + folder.id + '\')"><div class="folder-left"><span class="folder-arrow">▶</span><span class="folder-name">📁 ' + esc(folder.name) + '</span></div><div class="folder-acts"><button class="folder-act" onclick="event.stopPropagation();renameFolder(\'' + folder.id + '\')">✎</button><button class="folder-act danger" onclick="event.stopPropagation();deleteFolder(\'' + folder.id + '\')">✕</button></div></div><div class="folder-notes ' + (isCollapsed ? 'collapsed' : '') + '">';
    if (!ff.length) html += '<div class="empty-msg">Empty folder</div>';
    ff.forEach(f => { html += '<div class="file-item" draggable="true" data-file-id="' + f.id + '"><div class="file-info"><span class="file-icon">' + getFileIcon(f.type) + '</span><div class="file-name">' + esc(f.name) + '</div></div><div class="file-acts"><button class="file-act-btn" onclick="downloadFile(\'' + f.url + '\',\'' + esc(f.name) + '\')">⬇️</button><button class="file-act-btn danger" onclick="deleteFile(\'' + f.id + '\')">🗑️</button></div></div>'; });
    html += '</div></div>';
  });
  const uncatFiles = files.filter(f => !f.folder_id);
  if (uncatFiles.length > 0 || fileFolders.length > 0) {
    html += '<div class="uncat-section">';
    if (fileFolders.length) html += '<div class="uncat-head">📦 Uncategorized Files</div>';
    uncatFiles.forEach(f => { html += '<div class="file-item" draggable="true" data-file-id="' + f.id + '"><div class="file-info"><span class="file-icon">' + getFileIcon(f.type) + '</span><div class="file-details"><div class="file-name">' + esc(f.name) + '</div><div class="file-size">' + formatFileSize(f.size) + '</div></div></div><div class="file-acts"><button class="file-act-btn" onclick="downloadFile(\'' + f.url + '\',\'' + esc(f.name) + '\')">⬇️</button><button class="file-act-btn danger" onclick="deleteFile(\'' + f.id + '\')">🗑️</button></div></div>'; });
    html += '</div>';
  }
  list.innerHTML = html;
}

function renderFilesGrid() {
  const grid = document.getElementById('filesGrid');
  if (files.length === 0) { grid.innerHTML = '<div class="empty-msg" style="padding:40px;text-align:center;grid-column:1/-1">No files uploaded yet. Click "+ UPLOAD FILE" to add files.</div>'; return; }
  let html = '';
  const fileFolders = folders.filter(f => f.type === 'file');
  const filesByFolder = {};
  const uncatFiles = files.filter(f => !f.folder_id);
  files.forEach(f => { if (f.folder_id) { if (!filesByFolder[f.folder_id]) filesByFolder[f.folder_id] = []; filesByFolder[f.folder_id].push(f); } });
  fileFolders.forEach(folder => {
    const ff = filesByFolder[folder.id] || [];
    if (ff.length) { html += '<h3 class="folder-grid-header">📁 ' + esc(folder.name) + '</h3>'; ff.forEach(f => { html += renderFileCard(f); }); }
  });
  if (uncatFiles.length) { if (fileFolders.length) html += '<h3 class="folder-grid-header">📦 Uncategorized</h3>'; uncatFiles.forEach(f => { html += renderFileCard(f); }); }
  grid.innerHTML = html;
}

function renderFileCard(file) {
  const icon = getFileIcon(file.type), size = formatFileSize(file.size), date = new Date(file.created_at).toLocaleDateString();
  return '<div class="file-card" draggable="true" data-file-id="' + file.id + '"><div class="fc-info"><span class="fc-icon">' + icon + '</span><div class="fc-details"><div class="fc-name">' + esc(file.name) + '</div><div class="fc-meta">' + size + ' • ' + date + '</div></div></div><div class="fc-acts"><button class="fc-btn" onclick="showFileFolderPopup(\'' + file.id + '\')">MOVE</button><button class="fc-btn" onclick="downloadFile(\'' + file.url + '\',\'' + esc(file.name) + '\')">DOWNLOAD</button><button class="fc-btn danger" onclick="deleteFile(\'' + file.id + '\')">DELETE</button></div></div>';
}

function getFileIcon(type) {
  if (!type) return '📄'; if (type.startsWith('image/')) return '🖼️'; if (type.startsWith('video/')) return '🎬'; if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📕'; if (type.includes('word') || type.includes('document')) return '📘'; if (type.includes('sheet') || type.includes('excel')) return '📗';
  if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '📦'; return '📄';
}
function formatFileSize(bytes) { if (!bytes) return ''; if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }

async function handleFileUpload(e) {
  const selectedFiles = e.target.files;
  if (!selectedFiles || selectedFiles.length === 0) return;
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadText = document.getElementById('uploadProgressText');
  uploadProgress.classList.add('active');
  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    uploadText.textContent = 'Uploading ' + file.name + '... (' + (i + 1) + '/' + selectedFiles.length + ')';
    try {
      let resourceType = 'auto';
      const ext = file.name.split('.').pop().toLowerCase();
      const rawTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'zip', 'rar', '7z', 'json', 'xml'];
      if (rawTypes.includes(ext)) resourceType = 'raw';
      else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) resourceType = 'video';
      else if (file.type.startsWith('image/')) resourceType = 'image';
      const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      const cloudData = await response.json();
      const { error } = await sb.from('files').insert([{ name: file.name, url: cloudData.secure_url, public_id: cloudData.public_id, size: file.size, type: file.type }]);
      if (error) throw error;
    } catch (error) { toast('Failed to upload ' + file.name + ': ' + error.message); }
  }
  uploadProgress.classList.remove('active');
  e.target.value = '';
  loadFiles();
  toast(selectedFiles.length + ' file(s) uploaded');
}

function downloadFile(url, filename) {
  if (!url) return;
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    const downloadUrl = url.replace('/upload/', '/upload/fl_attachment/');
    const link = document.createElement('a'); link.href = downloadUrl; link.download = filename || 'download';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } else { window.open(url, '_blank'); }
}

async function deleteFile(fileId) {
  if (!confirm('Delete this file permanently?')) return;
  showLoading();
  try {
    const { error } = await sb.from('files').delete().eq('id', fileId);
    if (error) throw error;
    loadFiles();
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); }
}

let activeMoveFileId = null;
function showFileFolderPopup(fileId) {
  activeMoveFileId = fileId;
  const file = files.find(f => f.id === fileId);
  if (!file) return;
  const list = document.getElementById('folderPopupList');
  let html = '<div class="popup-opt uncat" onclick="moveFileToFolder(null)"><span>📄</span> No Folder (Uncategorized)</div>';
  const fileFolders = folders.filter(f => f.type === 'file');
  fileFolders.forEach(f => {
    const isActive = file.folder_id === f.id;
    html += '<div class="popup-opt ' + (isActive ? 'active' : '') + '" onclick="moveFileToFolder(\'' + f.id + '\')"><span>📁</span> ' + esc(f.name) + '</div>';
  });
  list.innerHTML = html;
  document.getElementById('folderPopup').classList.add('active');
}
async function moveFileToFolder(folderId) {
  if (!activeMoveFileId) return;
  closeFolderPopup(); showLoading();
  try {
    const { error } = await sb.from('files').update({ folder_id: folderId }).eq('id', activeMoveFileId);
    if (error) throw error;
    const file = files.find(f => f.id === activeMoveFileId);
    if (file) file.folder_id = folderId;
    loadFiles();
  } catch (e) { toast('Error: ' + e.message); }
  finally { hideLoading(); activeMoveFileId = null; }
}

/* ══════════════════════════════════
   SETTINGS
   ══════════════════════════════════ */
function showSettings() { document.getElementById('geminiKeyInput').value = geminiKey; document.getElementById('settingsPopup').classList.add('active'); }
function saveSettings() {
  geminiKey = document.getElementById('geminiKeyInput').value.trim();
  localStorage.setItem('pv_geminikey', geminiKey);
  closePopup('settingsPopup');
  toast(geminiKey ? 'API key saved! AI is ready ✨' : 'API key cleared');
}

/* ══════════════════════════════════
   MOBILE / UI
   ══════════════════════════════════ */
function openSidebar() { document.getElementById('sidebar').classList.add('mobile-open'); document.getElementById('sideOverlay').classList.add('active'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('mobile-open'); document.getElementById('sideOverlay').classList.remove('active'); }
function showLoading() { document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

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
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3000); }
