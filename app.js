const SB_URL = 'https://psukmzzuhpprfoanvjat.supabase.co', SB_KEY = 'sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
let sb; try { sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) } catch (e) { console.error(e) }
let curPath = '/', allNotes = [], activeNote = null, saveT = null, viewMode = 'grid', sortBy = 'name';
let locks = JSON.parse(localStorage.getItem('pv_locks') || '{}');
let trashN = JSON.parse(localStorage.getItem('pv_trash') || '[]');
let trashF = JSON.parse(localStorage.getItem('pv_ftrash') || '[]');
let theme = localStorage.getItem('pv_theme') || 'dark';
let noteFolders = JSON.parse(localStorage.getItem('pv_nfolders') || '["All","Personal","Work","Ideas"]');
let noteFolder = 'All';

window.onload = async () => {
  applyTheme(theme);
  try { const { data: { session } } = await sb.auth.getSession(); hideLoader(); if (session) initApp(session.user) } catch (e) { hideLoader() }
};
function hideLoader() { const l = document.getElementById('loader'); l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 400) }

// THEME
function applyTheme(t) {
  theme = t; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('pv_theme', t);
  const i = document.getElementById('ti'); if (i) i.className = t === 'dark' ? 'ri-moon-line' : 'ri-sun-line';
  const l = document.getElementById('tl'); if (l) l.textContent = t === 'dark' ? 'Dark Mode' : 'Light Mode'
}
function toggleTheme() { applyTheme(theme === 'dark' ? 'light' : 'dark') }

// AUTH
async function login() {
  const e = document.getElementById('email').value, p = document.getElementById('pass').value;
  const b = document.getElementById('lbtn'), er = document.getElementById('aerr');
  b.textContent = 'Signing in...'; er.textContent = '';
  try { const { data, error } = await sb.auth.signInWithPassword({ email: e, password: p }); if (error) throw error; initApp(data.user) }
  catch (e) { er.textContent = e.message; b.textContent = 'Sign In' }
}
async function logout() { await sb.auth.signOut(); location.reload() }
function initApp(u) {
  document.getElementById('auth-screen').style.display = 'none'; document.getElementById('app').style.display = 'flex';
  document.getElementById('ue').textContent = u.email; document.getElementById('uav').textContent = u.email[0].toUpperCase();
  refreshDrive(); refreshNotes(); updateTrashBadge(); renderFolderTabs();
}

// NAV
function switchView(v) {
  document.querySelectorAll('.ni[data-v]').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.ni[data-v="${v}"]`); if (nav) nav.classList.add('active');
  ['drive', 'notes', 'trash'].forEach(id => { const el = document.getElementById('view-' + id); if (el) { el.classList.add('hidden'); el.style.display = '' } });
  const view = document.getElementById('view-' + v);
  if (view) { view.classList.remove('hidden'); if (v === 'drive') view.style.display = 'flex'; if (v === 'trash') view.style.display = 'flex' }
  if (v === 'notes' && !activeNote && allNotes.length) selectNote(allNotes[0].id);
  if (v === 'trash') renderTrash();
}

// DRIVE
async function refreshDrive() {
  const p = curPath === '/' ? '' : curPath; const { data } = await sb.storage.from('files').list(p);
  const c = document.getElementById('dg'); const cr = document.getElementById('ct'); c.innerHTML = '';
  cr.textContent = curPath === '/' ? 'Home' : curPath;
  if (curPath !== '/') { c.innerHTML += `<div class="fc ${viewMode === 'list' ? 'li' : ''}" onclick="openPath('..')"><i class="ri-arrow-up-line fi" style="color:var(--text3)"></i><span class="fn">Back</span></div>` }
  if (data) {
    let files = data.filter(f => f.name !== '.keep');
    if (sortBy === 'name') files.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'date') files.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sortBy === 'size') files.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
    files.forEach(f => {
      const isD = !f.metadata, icon = isD ? 'ri-folder-3-fill' : getIcon(f.name), color = isD ? 'var(--primary)' : 'var(--text3)';
      const sz = f.metadata ? fmtSize(f.metadata.size) : '';
      const el = document.createElement('div'); el.className = `fc ${viewMode === 'list' ? 'li' : ''}`;
      el.innerHTML = viewMode === 'list' ? `<i class="${icon} fi" style="color:${color}"></i><span class="fn">${f.name}</span><span class="fm">${sz}</span>` : `<i class="${icon} fi" style="color:${color}"></i><span class="fn">${f.name}</span>`;
      el.onclick = () => isD ? openPath(f.name) : previewFile(f.name); el.oncontextmenu = e => showCtx(e, 'file', f.name); c.appendChild(el)
    });
    if (!files.length && curPath === '/') c.innerHTML = '<div class="es"><i class="ri-folder-open-line"></i><p>Drop files here or click upload</p></div>';
  }
  c.className = viewMode === 'list' ? 'dl' : 'dg';
}
function getIcon(n) { if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n)) return 'ri-image-fill'; if (/\.pdf$/i.test(n)) return 'ri-file-pdf-2-fill'; if (/\.(zip|rar|7z)$/i.test(n)) return 'ri-file-zip-fill'; if (/\.(doc|docx|txt)$/i.test(n)) return 'ri-file-text-fill'; if (/\.(mp4|mov)$/i.test(n)) return 'ri-video-fill'; if (/\.(mp3|wav)$/i.test(n)) return 'ri-music-fill'; if (/\.(xls|xlsx|csv)$/i.test(n)) return 'ri-file-excel-fill'; return 'ri-file-3-fill' }
function fmtSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(1) + 'KB'; return (b / 1048576).toFixed(1) + 'MB' }
function openPath(f) { if (f === '..') { const p = curPath.split('/'); p.pop(); curPath = p.length === 0 || (p.length === 1 && p[0] === '') ? '/' : p.join('/') } else { curPath = curPath === '/' ? f : `${curPath}/${f}` } refreshDrive() }
async function createFolder() { const n = prompt('Folder name:'); if (n) { const fp = curPath === '/' ? `${n}/.keep` : `${curPath}/${n}/.keep`; await sb.storage.from('files').upload(fp, new Blob([''])); refreshDrive(); toast('Folder created', 'success') } }
async function uploadFiles(files) { if (!files.length) return; toast(`Uploading ${files.length} file(s)...`); for (const f of files) { const fp = curPath === '/' ? f.name : `${curPath}/${f.name}`; await sb.storage.from('files').upload(fp, f) } refreshDrive(); toast('Upload complete', 'success') }
async function renameFile(name) { const nn = prompt('New name:', name); if (nn && nn !== name) { const op = curPath === '/' ? name : `${curPath}/${name}`, np = curPath === '/' ? nn : `${curPath}/${nn}`; const { data } = await sb.storage.from('files').download(op); if (data) { await sb.storage.from('files').upload(np, data); await sb.storage.from('files').remove([op]); refreshDrive(); toast('Renamed', 'success') } } }
async function deleteFile(name) { const path = curPath === '/' ? name : `${curPath}/${name}`; trashF.push({ name, path, deletedAt: new Date().toISOString() }); localStorage.setItem('pv_ftrash', JSON.stringify(trashF)); await sb.storage.from('files').remove([path]); refreshDrive(); updateTrashBadge(); toast('Moved to trash', 'warning') }
async function previewFile(name) { const path = curPath === '/' ? name : `${curPath}/${name}`; const { data } = await sb.storage.from('files').createSignedUrl(path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }
function setView(m) { viewMode = m; document.querySelectorAll('.vt button').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); refreshDrive() }
function setSort(v) { sortBy = v; refreshDrive() }
function handleDragOver(e) { e.preventDefault(); document.body.classList.add('dragging') }
function handleDragLeave(e) { e.preventDefault(); document.body.classList.remove('dragging') }
function handleDrop(e) { e.preventDefault(); document.body.classList.remove('dragging'); if (!document.getElementById('view-drive').classList.contains('hidden')) uploadFiles(e.dataTransfer.files) }

// NOTE FOLDERS
function renderFolderTabs() {
  const c = document.getElementById('ftabs'); if (!c) return; c.innerHTML = '';
  noteFolders.forEach(f => { const el = document.createElement('div'); el.className = `folder-tab ${f === noteFolder ? 'active' : ''}`; el.textContent = f; el.onclick = () => { noteFolder = f; renderFolderTabs(); renderNoteList(allNotes) }; c.appendChild(el) });
  const add = document.createElement('div'); add.className = 'folder-tab'; add.textContent = '+'; add.onclick = addNoteFolder; c.appendChild(add);
}
function addNoteFolder() { const n = prompt('New folder name:'); if (n && !noteFolders.includes(n)) { noteFolders.push(n); localStorage.setItem('pv_nfolders', JSON.stringify(noteFolders)); renderFolderTabs(); toast('Folder added', 'success') } }

// NOTES
async function refreshNotes() {
  let { data, error } = await sb.from('notes').select('*').order('created_at', { ascending: false });
  if (error) { let r = await sb.from('notes').select('*'); data = r.data }
  allNotes = data || []; renderNoteList(allNotes);
}
function renderNoteList(notes) {
  const c = document.getElementById('notes-list'); c.innerHTML = '';
  let filtered = notes;
  if (noteFolder !== 'All') { filtered = notes.filter(n => { const f = localStorage.getItem('pv_nf_' + n.id); return f === noteFolder }) }
  filtered.forEach(n => {
    const lk = locks[n.id], folder = localStorage.getItem('pv_nf_' + n.id) || '';
    const el = document.createElement('div'); el.className = `nit ${activeNote?.id === n.id ? 'active' : ''}`;
    el.innerHTML = `<div class="nt"><span>${lk ? '<i class="ri-lock-fill"></i> ' : ''}${n.title || 'Untitled'}</span>${n.is_pinned ? '<i class="ri-pushpin-fill" style="color:var(--primary);font-size:.7rem"></i>' : ''}</div><div class="np">${lk ? '••••••••' : (n.content?.substring(0, 55) || 'Empty')}</div><div class="nm"><span>${new Date(n.created_at).toLocaleDateString()}</span>${folder ? `<span class="folder-label">${folder}</span>` : ''}</div>`;
    el.onclick = () => selectNote(n.id); el.oncontextmenu = e => showCtx(e, 'note', n.id); c.appendChild(el)
  });
  if (!filtered.length) c.innerHTML = '<div class="es" style="height:40%"><i class="ri-file-text-line"></i><p>No notes here</p></div>';
}
function filterNotes(q) { renderNoteList(allNotes.filter(n => (n.title + n.content).toLowerCase().includes(q.toLowerCase()))) }
function selectNote(id) {
  activeNote = allNotes.find(n => n.id === id); renderNoteList(allNotes);
  if (locks[id]) { document.getElementById('lscr').classList.remove('hidden'); document.getElementById('upw').value = ''; return }
  document.getElementById('lscr').classList.add('hidden');
  document.getElementById('note-title').value = activeNote.title || ''; document.getElementById('note-body').value = activeNote.content || '';
  updateStats(); updateLockIcon();
}
async function createNote() {
  const { data } = await sb.from('notes').insert([{ title: 'Untitled', content: '' }]).select();
  if (data) { if (noteFolder !== 'All') localStorage.setItem('pv_nf_' + data[0].id, noteFolder); allNotes.unshift(data[0]); selectNote(data[0].id); refreshNotes() }
}
function handleNoteInput(ta) { const v = ta.value; if (v.endsWith('aistart')) { ta.value = v.slice(0, -7); runAI(ta.value); return } triggerSave() }
function triggerSave() { document.getElementById('ss').innerHTML = '<span style="animation:pl 1s infinite">Saving...</span>'; if (saveT) clearTimeout(saveT); saveT = setTimeout(saveNote, 800); updateStats() }
async function saveNote() { if (!activeNote) return; const t = document.getElementById('note-title').value, c = document.getElementById('note-body').value; await sb.from('notes').update({ title: t, content: c }).eq('id', activeNote.id); document.getElementById('ss').innerHTML = '<span class="sd"></span>Saved'; activeNote.title = t; activeNote.content = c; refreshNotes() }
function updateStats() { const t = document.getElementById('note-body').value; const w = t.trim() ? t.trim().split(/\s+/).length : 0; document.getElementById('wc').textContent = `${w} words · ${t.length} chars` }
function moveNoteToFolder(id) {
  const f = prompt('Move to folder:\n' + noteFolders.join(', '));
  if (f && noteFolders.includes(f)) { localStorage.setItem('pv_nf_' + id, f); renderNoteList(allNotes); toast('Moved to ' + f, 'success') }
  else if (f) toast('Folder not found', 'warning');
}

// LOCK
function toggleLock() { if (!activeNote) return; if (locks[activeNote.id]) { delete locks[activeNote.id]; toast('Unlocked', 'success') } else { const p = prompt('Set password:'); if (p) { locks[activeNote.id] = p; toast('Locked', 'success') } } localStorage.setItem('pv_locks', JSON.stringify(locks)); updateLockIcon(); refreshNotes() }
function updateLockIcon() { const b = document.getElementById('blk'); if (activeNote && locks[activeNote.id]) { b.style.color = 'var(--primary)'; b.innerHTML = '<i class="ri-lock-fill"></i>' } else { b.style.color = ''; b.innerHTML = '<i class="ri-lock-unlock-line"></i>' } }
function unlockNote() { const p = document.getElementById('upw').value; if (p === locks[activeNote.id]) { document.getElementById('lscr').classList.add('hidden'); document.getElementById('note-title').value = activeNote.title; document.getElementById('note-body').value = activeNote.content; updateStats() } else toast('Wrong password', 'error') }
function insertMD(ch) { const ta = document.getElementById('note-body'), s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.substring(0, s) + ch + ta.value.substring(s, e) + ch + ta.value.substring(e); triggerSave() }
function toggleFocus() { const ns = document.querySelector('.ns'), sb2 = document.getElementById('sidebar'); const h = ns.style.display !== 'none'; ns.style.display = h ? 'none' : 'flex'; sb2.style.display = h ? 'none' : 'flex' }

// AI HUMANIZER
async function runAI(text) {
  if (!text.trim()) { toast('Write something first', 'warning'); return }
  toast('AI refining your text... ✨'); document.getElementById('ss').innerHTML = '<span style="color:var(--accent)">AI Working...</span>';
  await new Promise(r => setTimeout(r, 1200));
  document.getElementById('note-body').value = humanize(text);
  document.getElementById('ss').innerHTML = '<span class="sd"></span>Saved'; triggerSave(); toast('Text refined', 'success');
}
function humanize(t) {
  t = t.replace(/ {2,}/g, ' ').replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  const r = [[/\bvery good\b/gi, 'excellent'], [/\bvery bad\b/gi, 'terrible'], [/\bvery big\b/gi, 'enormous'], [/\bvery small\b/gi, 'tiny'], [/\bvery happy\b/gi, 'thrilled'], [/\bvery sad\b/gi, 'devastated'], [/\bvery important\b/gi, 'crucial'], [/\bvery easy\b/gi, 'effortless'], [/\bvery hard\b/gi, 'challenging'], [/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\bat this point in time\b/gi, 'now'], [/\bhas the ability to\b/gi, 'can'], [/\ba lot of\b/gi, 'many'], [/\bi think\b/gi, 'I believe'], [/\bkind of\b/gi, 'somewhat'], [/\bget rid of\b/gi, 'eliminate'], [/\bcome up with\b/gi, 'devise'], [/\blook into\b/gi, 'investigate']];
  r.forEach(([p, v]) => { t = t.replace(p, v) });
  const typos = [[/\bteh\b/g, 'the'], [/\brecieve\b/gi, 'receive'], [/\boccured\b/gi, 'occurred'], [/\bseperate\b/gi, 'separate'], [/\bdefinately\b/gi, 'definitely'], [/\bneccessary\b/gi, 'necessary']];
  typos.forEach(([p, v]) => { t = t.replace(p, v) }); return t;
}
function openGrammar() { const t = document.getElementById('note-body')?.value || ''; if (!t.trim()) { toast('Open a note first', 'warning'); return } toast('Checking grammar...'); setTimeout(() => { let i = 0; if (/\s{2,}/.test(t)) i++; if (/(^|[.!?]\s+)[a-z]/.test(t)) i++; if (/\b(teh|recieve|seperate|definately)\b/i.test(t)) i++; toast(i ? `${i} issue(s) found. Type aistart to fix!` : 'Grammar looks great!', i ? 'warning' : 'success') }, 1200) }

// TRASH
function updateTrashBadge() { const b = document.getElementById('tb'); const c = trashN.length + trashF.length; if (b) { b.textContent = c; b.style.display = c ? 'block' : 'none' } }
async function deleteNote(id) { const n = allNotes.find(x => x.id === id); if (n) { trashN.push({ ...n, deletedAt: new Date().toISOString() }); localStorage.setItem('pv_trash', JSON.stringify(trashN)) } await sb.from('notes').delete().eq('id', id); if (activeNote?.id === id) activeNote = null; refreshNotes(); updateTrashBadge(); toast('Note trashed', 'warning') }
function renderTrash() {
  const c = document.getElementById('tc'); c.innerHTML = '';
  if (!trashN.length && !trashF.length) { c.innerHTML = '<div class="es"><i class="ri-delete-bin-line"></i><p>Trash is empty</p></div>'; return }
  trashN.forEach((n, i) => { c.innerHTML += `<div class="ti"><i class="ri-sticky-note-line tic"></i><span class="tin">${n.title || 'Untitled'}</span><span class="tid">${new Date(n.deletedAt).toLocaleDateString()}</span><button onclick="restoreNote(${i})" title="Restore"><i class="ri-arrow-go-back-line"></i></button><button class="del" onclick="permDelN(${i})" title="Delete"><i class="ri-delete-bin-line"></i></button></div>` });
  trashF.forEach((f, i) => { c.innerHTML += `<div class="ti"><i class="ri-file-3-line tic"></i><span class="tin">${f.name}</span><span class="tid">${new Date(f.deletedAt).toLocaleDateString()}</span><button class="del" onclick="permDelF(${i})" title="Delete"><i class="ri-delete-bin-line"></i></button></div>` })
}
async function restoreNote(i) { const n = trashN.splice(i, 1)[0]; localStorage.setItem('pv_trash', JSON.stringify(trashN)); await sb.from('notes').insert([{ title: n.title, content: n.content }]); refreshNotes(); renderTrash(); updateTrashBadge(); toast('Restored', 'success') }
function permDelN(i) { trashN.splice(i, 1); localStorage.setItem('pv_trash', JSON.stringify(trashN)); renderTrash(); updateTrashBadge(); toast('Deleted permanently', 'error') }
function permDelF(i) { trashF.splice(i, 1); localStorage.setItem('pv_ftrash', JSON.stringify(trashF)); renderTrash(); updateTrashBadge(); toast('Deleted permanently', 'error') }
function emptyTrash() { if (!confirm('Empty all trash?')) return; trashN = []; trashF = []; localStorage.setItem('pv_trash', '[]'); localStorage.setItem('pv_ftrash', '[]'); renderTrash(); updateTrashBadge(); toast('Trash emptied', 'success') }

// PIN
async function togglePin(id) { const n = allNotes.find(x => x.id === id); if (!n) return; await sb.from('notes').update({ is_pinned: !n.is_pinned }).eq('id', id); refreshNotes(); toast(n.is_pinned ? 'Unpinned' : 'Pinned', 'success') }

// CTX MENU
function showCtx(e, type, id) {
  e.preventDefault(); const m = document.getElementById('ctx'); m.style.display = 'block'; m.style.left = e.pageX + 'px'; m.style.top = e.pageY + 'px'; m.classList.remove('hidden');
  let h = '';
  if (type === 'note') { h += `<div class="ci" onclick="togglePin('${id}')"><i class="ri-pushpin-line"></i>Pin/Unpin</div>`; h += `<div class="ci" onclick="moveNoteToFolder('${id}')"><i class="ri-folder-transfer-line"></i>Move to Folder</div>`; h += `<div class="ci dng" onclick="deleteNote('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>` }
  else { h += `<div class="ci" onclick="renameFile('${id}')"><i class="ri-edit-line"></i>Rename</div>`; h += `<div class="ci" onclick="previewFile('${id}')"><i class="ri-eye-line"></i>Preview</div>`; h += `<div class="ci dng" onclick="deleteFile('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>` }
  m.innerHTML = h; setTimeout(() => document.addEventListener('click', () => m.classList.add('hidden'), { once: true }), 10)
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast'), ic = document.getElementById('tic'); document.getElementById('tm').textContent = msg;
  const icons = { info: 'ri-information-line', success: 'ri-check-line', warning: 'ri-alert-line', error: 'ri-close-circle-line' };
  const colors = { info: 'var(--primary)', success: 'var(--success)', warning: 'var(--warning)', error: 'var(--danger)' };
  ic.className = icons[type] || icons.info; ic.style.color = colors[type] || colors.info;
  el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3000)
}
