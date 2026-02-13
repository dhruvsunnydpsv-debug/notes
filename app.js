/* ═══════════════════════════════════════════
   Personal Vault — app.js
   Real AI · Search · Cloud Folders · Shortcuts
   ═══════════════════════════════════════════ */

const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co';
const SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
const AUTH_EMAIL = 'dhruv12306@outlook.com';
const CONFIG_PATH = '.vault_config.json';

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
let geminiKey = 'AIzaSyA21bmcgzm4f856jRsJNKKT9erTQaE-s_0';
let searchQuery = '';

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) startApp(session.user);
  } catch (e) { console.error('Init:', e) }

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); if (currentUser) newNote() }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (activeNote) saveNote() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const si = document.getElementById('searchInput'); if (si) { si.focus(); si.select() } }
    if (e.key === 'Escape') { closePopup('movePopup'); closePopup('inputPopup'); closePopup('settingsPopup') }
  });
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
   CLOUD CONFIG
   ══════════════════════════════════ */
async function loadConfig() {
  try {
    const { data } = await sb.storage.from('files').download(CONFIG_PATH);
    if (data) {
      const text = await data.text();
      const cfg = JSON.parse(text);
      folders = cfg.folders || [];
      noteFolder = cfg.noteFolder || {};
      geminiKey = cfg.geminiKey || '';
    }
  } catch (e) {
    folders = JSON.parse(localStorage.getItem('pv_folders') || '[]');
    noteFolder = JSON.parse(localStorage.getItem('pv_notefolder') || '{}');
    geminiKey = localStorage.getItem('pv_geminikey') || '';
    saveConfigNow();
  }
}

function saveConfig() {
  if (configTimer) clearTimeout(configTimer);
  configTimer = setTimeout(saveConfigNow, 500);
}

async function saveConfigNow() {
  try {
    const blob = new Blob([JSON.stringify({ folders, noteFolder, geminiKey })], { type: 'application/json' });
    await sb.storage.from('files').upload(CONFIG_PATH, blob, { upsert: true });
  } catch (e) { console.error('Config save:', e) }
  localStorage.setItem('pv_folders', JSON.stringify(folders));
  localStorage.setItem('pv_notefolder', JSON.stringify(noteFolder));
  localStorage.setItem('pv_geminikey', geminiKey);
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
   SEARCH
   ══════════════════════════════════ */
function searchNotes(q) {
  searchQuery = q.toLowerCase().trim();
  renderNotesList();
}

function matchesSearch(n) {
  if (!searchQuery) return true;
  return (n.title || '').toLowerCase().includes(searchQuery) || (n.content || '').toLowerCase().includes(searchQuery);
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
    const fNotes = notes.filter(n => noteFolder[n.id] === f.name && matchesSearch(n));
    const section = document.createElement('div');
    section.className = 'folder-section';

    const head = document.createElement('div');
    head.className = 'folder-head' + (isOpen ? '' : ' collapsed');
    head.innerHTML = '<div class="folder-left"><span class="folder-arrow">▼</span><span class="folder-name">📁 ' + esc(f.name) + '</span><span class="folder-count">' + fNotes.length + '</span></div><div class="folder-acts"><button class="folder-act" onclick="event.stopPropagation();renameFolder(' + fi + ')">✎</button><button class="folder-act danger" onclick="event.stopPropagation();deleteFolder(' + fi + ')">✕</button></div>';
    head.onclick = () => { folders[fi].open = !isOpen; saveConfig(); renderNotesList() };
    // Drag over folder
    head.ondragover = e => { e.preventDefault(); head.classList.add('drag-over') };
    head.ondragleave = () => head.classList.remove('drag-over');
    head.ondrop = e => { e.preventDefault(); head.classList.remove('drag-over'); const id = e.dataTransfer.getData('noteId'); if (id) { noteFolder[id] = f.name; saveConfig(); renderNotesList(); toast('Moved to ' + f.name) } };
    section.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'folder-notes' + (isOpen ? '' : ' collapsed');
    fNotes.forEach(n => wrap.appendChild(makeNoteItem(n)));
    if (!fNotes.length && !searchQuery) { const em = document.createElement('div'); em.className = 'empty-msg'; em.textContent = 'Empty folder'; wrap.appendChild(em) }
    section.appendChild(wrap);
    list.appendChild(section);
  });

  // Uncategorized
  const uncatNotes = notes.filter(n => (!noteFolder[n.id] || !folders.find(f => f.name === noteFolder[n.id])) && matchesSearch(n));
  if (uncatNotes.length || (!folders.length && !searchQuery)) {
    const us = document.createElement('div'); us.className = 'uncat-section';
    if (folders.length) { const uh = document.createElement('div'); uh.className = 'uncat-head'; uh.textContent = 'Uncategorized'; us.appendChild(uh) }
    us.ondragover = e => { e.preventDefault(); us.classList.add('drag-over') };
    us.ondragleave = () => us.classList.remove('drag-over');
    us.ondrop = e => { e.preventDefault(); us.classList.remove('drag-over'); const id = e.dataTransfer.getData('noteId'); if (id) { delete noteFolder[id]; saveConfig(); renderNotesList(); toast('Moved to Uncategorized') } };
    uncatNotes.forEach(n => us.appendChild(makeNoteItem(n)));
    if (!uncatNotes.length && !folders.length) { const em = document.createElement('div'); em.className = 'empty-msg'; em.textContent = 'No notes yet. Click + NOTE to start.'; us.appendChild(em) }
    list.appendChild(us);
  }

  // No search results
  if (searchQuery) {
    const total = notes.filter(matchesSearch).length;
    if (!total) { list.innerHTML = '<div class="empty-msg">No notes matching "' + esc(searchQuery) + '"</div>' }
  }
}

function makeNoteItem(n) {
  const div = document.createElement('div');
  div.className = 'note-item' + (activeNote && activeNote.id === n.id ? ' active' : '');
  div.draggable = true;

  const info = document.createElement('div');
  info.className = 'note-info';
  info.innerHTML = '<div class="note-title">' + esc(n.title || 'Untitled') + '</div><div class="note-date">' + timeAgo(n.created_at) + '</div>';

  const acts = document.createElement('div');
  acts.className = 'note-acts';
  // Move button
  const moveBtn = document.createElement('button');
  moveBtn.className = 'note-act'; moveBtn.innerHTML = '📁'; moveBtn.title = 'Move to folder';
  moveBtn.onclick = e => { e.stopPropagation(); activeNote = n; showMovePopup() };
  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'note-act danger'; delBtn.innerHTML = '🗑'; delBtn.title = 'Delete note';
  delBtn.onclick = e => { e.stopPropagation(); deleteNote(n.id) };
  acts.appendChild(moveBtn);
  acts.appendChild(delBtn);

  div.appendChild(info);
  div.appendChild(acts);

  div.onclick = () => openNote(n.id);
  div.ondragstart = e => { e.dataTransfer.setData('noteId', n.id); div.classList.add('dragging') };
  div.ondragend = () => div.classList.remove('dragging');
  return div;
}

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  if (ta.value.endsWith('aistart')) { ta.value = ta.value.slice(0, -7); triggerAI(); return }
  autoSave();
}

function autoSave() {
  document.getElementById('footStatus').textContent = 'Saving...';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 300);
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

function updateStats() {
  const body = document.getElementById('noteBody').value;
  const w = body.trim() ? body.trim().split(/\s+/).length : 0;
  document.getElementById('footStats').textContent = w + ' words · ' + body.length + ' chars';
}

function updateFooter() {
  updateStats();
  document.getElementById('footStatus').textContent = 'Saved ✓';
}

async function deleteActiveNote() {
  if (!activeNote) return;
  if (!confirm('Delete "' + (activeNote.title || 'Untitled') + '"?')) return;
  await performDelete(activeNote.id);
}

async function deleteNote(id) {
  const n = notes.find(x => x.id === id);
  if (!confirm('Delete "' + (n ? n.title || 'Untitled' : 'this note') + '"?')) return;
  await performDelete(id);
}

async function performDelete(id) {
  try {
    await sb.from('notes').delete().eq('id', id);
    notes = notes.filter(n => n.id !== id);
    delete noteFolder[id]; saveConfig();
    if (activeNote && activeNote.id === id) {
      activeNote = null;
      document.getElementById('noteEditor').style.display = 'none';
      document.getElementById('emptyState').style.display = 'flex';
    }
    renderNotesList(); toast('Note deleted');
  } catch (e) { toast('Error'); console.error(e) }
}

/* ── FOLDERS ── */
function newFolder() {
  showInput('New Folder', 'Folder name', 'CREATE', name => {
    if (!name.trim()) return;
    if (folders.find(f => f.name === name.trim())) { toast('Already exists'); return }
    folders.push({ name: name.trim(), open: true });
    saveConfig(); renderNotesList(); toast('Folder created');
  });
}

function renameFolder(idx) {
  showInput('Rename Folder', 'New name', 'RENAME', name => {
    if (!name.trim()) return;
    const oldName = folders[idx].name;
    folders[idx].name = name.trim();
    Object.keys(noteFolder).forEach(k => { if (noteFolder[k] === oldName) noteFolder[k] = name.trim() });
    saveConfig(); renderNotesList(); toast('Renamed');
  }, folders[idx].name);
}

function deleteFolder(idx) {
  if (!confirm('Delete folder "' + folders[idx].name + '"? Notes will be moved to Uncategorized.')) return;
  const name = folders[idx].name;
  folders.splice(idx, 1);
  Object.keys(noteFolder).forEach(k => { if (noteFolder[k] === name) delete noteFolder[k] });
  saveConfig(); renderNotesList(); toast('Folder deleted');
}

/* ── MOVE POPUP ── */
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

/* ══════════════════════════════════
   AI HUMANIZER (Gemini API + fallback)
   ══════════════════════════════════ */
async function triggerAI() {
  if (!activeNote) { toast('Open a note first'); return }
  const text = document.getElementById('noteBody').value;
  if (!text.trim()) { toast('Write something first'); return }

  // Show loading
  document.getElementById('aiLoading').classList.add('active');
  document.getElementById('footStatus').textContent = 'AI Working...';

  try {
    let result;
    if (geminiKey) {
      // Use real Gemini AI
      result = await callGemini(text);
    } else {
      // Fallback to local humanizer
      await new Promise(r => setTimeout(r, 600));
      result = humanize(text);
    }
    document.getElementById('noteBody').value = result;
    autoSave();
    toast(geminiKey ? 'AI rewrite complete! ✨' : 'Text improved! (Add Gemini key in ⚙ for real AI)');
  } catch (e) {
    console.error('AI error:', e);
    toast('AI error: ' + e.message);
  } finally {
    document.getElementById('aiLoading').classList.remove('active');
  }
}

async function callGemini(text) {
  const prompt = `You are a world-class ghostwriter and editor who specializes in making text sound authentically human-written. Your task is to completely rewrite the following text so it reads as if a thoughtful, articulate person naturally wrote it.

Rules you MUST follow:
1. VARY sentence length dramatically — mix short punchy sentences with longer flowing ones. Real humans don't write uniform sentences.
2. Use NATURAL transitions — "Look," "Here's the thing," "What's interesting is," "The truth is," "That said," instead of robotic connectors like "Furthermore" or "Moreover."
3. Replace ALL generic/overused words: "utilize" → "use", "implement" → "set up/build", "leverage" → "take advantage of", "facilitate" → "help", "optimize" → "improve".
4. Add subtle PERSONALITY — occasional rhetorical questions, mild emphasis, genuine observations. Not over-the-top, just enough to feel real.
5. ELIMINATE academic/corporate stiffness: no "It is worth noting that", "It should be emphasized", "In conclusion", "As previously mentioned".
6. Use CONTRACTIONS naturally: "it's", "don't", "we're", "that's", "wouldn't" — real people use contractions.
7. Break up walls of text into digestible paragraphs. Each paragraph should have ONE clear idea.
8. KEEP the original meaning, facts, and intent completely intact. Don't add information that wasn't there.
9. If the text has technical terms, keep them but explain naturally if needed.
10. The tone should feel like a smart friend explaining something — confident but not arrogant, clear but not dumbed down.

Return ONLY the rewritten text. No explanations, no "Here's the rewritten version", no quotes around it. Just the clean rewritten text.

Text to rewrite:
${text}`;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=' + geminiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'API error ' + res.status);
  }
  const data = await res.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('No response from AI');
}

function humanize(t) {
  t = t.replace(/ {2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  // Typos
  [[/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely'], [/\boccured\b/gi, 'occurred'], [/\buntill?\b/gi, 'until'], [/\balot\b/gi, 'a lot'], [/\bcould of\b/gi, 'could have'], [/\bshould of\b/gi, 'should have'], [/\bwould of\b/gi, 'would have'], [/\bdont\b/g, "don't"], [/\bcant\b/g, "can't"], [/\bwont\b/g, "won't"], [/\bdidnt\b/g, "didn't"], [/\bisnt\b/g, "isn't"], [/\barent\b/g, "aren't"]].forEach(([p, v]) => { t = t.replace(p, v) });
  // Vocabulary
  [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bvery sad\b/gi, 'devastated'], [/\bvery tired\b/gi, 'exhausted'], [/\bvery important\b/gi, 'crucial'], [/\bvery easy\b/gi, 'effortless'], [/\bvery hard\b/gi, 'challenging'], [/\bvery fast\b/gi, 'rapid'], [/\bvery nice\b/gi, 'delightful'], [/\bvery interesting\b/gi, 'fascinating'], [/\bvery scared\b/gi, 'terrified'], [/\bvery angry\b/gi, 'furious']].forEach(([p, v]) => { t = t.replace(p, v) });
  // Wordy
  [[/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\bat this point in time\b/gi, 'now'], [/\bin the event that\b/gi, 'if'], [/\bfor the purpose of\b/gi, 'to'], [/\ba lot of\b/gi, 'many'], [/\bi think\b/gi, 'I believe'], [/\bat the end of the day\b/gi, 'ultimately'], [/\bneedless to say\b/gi, 'clearly'], [/\bthe fact that\b/gi, 'that'], [/\bis able to\b/gi, 'can'], [/\bhas the ability to\b/gi, 'can']].forEach(([p, v]) => { t = t.replace(p, v) });
  // Fillers
  [[/\bbasically,?\s*/gi, ''], [/\bliterally\s+/gi, ''], [/\bhonestly,?\s*/gi, ''], [/\bsort of\s+/gi, ''], [/\byou know,?\s*/gi, '']].forEach(([p, v]) => { t = t.replace(p, v) });
  // Capitalize
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  t = t.replace(/([.!?])\1+/g, '$1');
  t = t.replace(/\s+([.!?,;:])/g, '$1');
  t = t.replace(/^ +| +$/gm, '');
  t = t.replace(/ {2,}/g, ' ');
  return t;
}

/* ══════════════════════════════════
   SETTINGS
   ══════════════════════════════════ */
function showSettings() {
  document.getElementById('geminiKeyInput').value = geminiKey;
  document.getElementById('settingsPopup').classList.add('active');
}

function saveSettings() {
  geminiKey = document.getElementById('geminiKeyInput').value.trim();
  saveConfig();
  closePopup('settingsPopup');
  toast(geminiKey ? 'Gemini API key saved! AI is ready ✨' : 'API key cleared');
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
        div.innerHTML = '<div class="note-info"><div class="note-title">' + fileIcon(f.name) + ' ' + esc(f.name) + '</div><div class="note-date">' + (f.metadata ? fmtSize(f.metadata.size) : '') + '</div></div>';
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
      grid.innerHTML = '<div class="empty-msg" style="padding:40px;text-align:center;grid-column:1/-1">No files yet. Click ⬆ UPLOAD to add files.</div>';
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
    loadFilesSidebar(); renderFilesGrid(); toast('File deleted');
  } catch (e) { toast('Error'); console.error(e) }
}

function fileIcon(n) {
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n)) return '🖼️';
  if (/\.pdf$/i.test(n)) return '📕';
  if (/\.(zip|rar|7z)$/i.test(n)) return '🗜️';
  if (/\.(doc|docx|txt)$/i.test(n)) return '📝';
  if (/\.(mp4|mov|avi)$/i.test(n)) return '🎬';
  if (/\.(mp3|wav|flac)$/i.test(n)) return '🎵';
  if (/\.(xls|xlsx|csv)$/i.test(n)) return '📊';
  if (/\.(ppt|pptx)$/i.test(n)) return '📽️';
  return '📄';
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

/* ══════════════════════════════════
   MOBILE
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
  t._t = setTimeout(() => t.classList.remove('show'), 3000);
}
