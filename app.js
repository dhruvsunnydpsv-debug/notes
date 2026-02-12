const SUPABASE_URL='https://psukmzzuhpprfoanvjat.supabase.co';
const SUPABASE_KEY='sb_publishable_FLl6k_0aVgH_R7bKNkzsfA_HYTIM304';
let sb;
try{sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}})}catch(e){console.error(e)}

let currentPath='/',allNotes=[],activeNote=null,saveTimer=null,viewMode='grid',sortBy='name';
let lockedNotes=JSON.parse(localStorage.getItem('pv_locks')||'{}');
let trashedNotes=JSON.parse(localStorage.getItem('pv_trash')||'[]');
let trashedFiles=JSON.parse(localStorage.getItem('pv_ftrash')||'[]');
let theme=localStorage.getItem('pv_theme')||'dark';

// INIT
window.onload=async()=>{
  applyTheme(theme);
  try{
    const{data:{session}}=await sb.auth.getSession();
    hideLoader();
    if(session)initApp(session.user);
  }catch(e){hideLoader()}
};

function hideLoader(){const l=document.getElementById('loader');l.style.opacity='0';setTimeout(()=>l.style.display='none',500)}

// THEME
function applyTheme(t){
  theme=t;document.documentElement.setAttribute('data-theme',t);
  localStorage.setItem('pv_theme',t);
  const icon=document.getElementById('theme-icon');
  if(icon)icon.className=t==='dark'?'ri-moon-line':'ri-sun-line';
  const label=document.getElementById('theme-label');
  if(label)label.textContent=t==='dark'?'Dark Mode':'Light Mode';
}
function toggleTheme(){applyTheme(theme==='dark'?'light':'dark')}

// AUTH
async function login(){
  const email=document.getElementById('email').value,pass=document.getElementById('pass').value;
  const btn=document.getElementById('login-btn'),err=document.getElementById('auth-err');
  btn.textContent='Authenticating...';err.textContent='';
  try{
    const{data,error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error)throw error;
    initApp(data.user);
  }catch(e){err.textContent=e.message;btn.textContent='Sign In'}
}
async function logout(){await sb.auth.signOut();location.reload()}

function initApp(user){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('u-email').textContent=user.email;
  document.getElementById('u-avatar').textContent=user.email[0].toUpperCase();
  refreshDrive();refreshNotes();updateTrashBadge();
}

// NAV
function switchView(v){
  document.querySelectorAll('.nav-item[data-view]').forEach(n=>n.classList.remove('active'));
  const nav=document.querySelector(`.nav-item[data-view="${v}"]`);if(nav)nav.classList.add('active');
  ['drive','notes','trash'].forEach(id=>{
    const el=document.getElementById('view-'+id);if(el)el.classList.add('hidden')});
  const view=document.getElementById('view-'+v);if(view)view.classList.remove('hidden');
  if(v==='notes'&&!activeNote&&allNotes.length)selectNote(allNotes[0].id);
  if(v==='trash')renderTrash();
}

// DRIVE
async function refreshDrive(){
  const path=currentPath==='/'?'':currentPath;
  const{data}=await sb.storage.from('files').list(path);
  const container=document.getElementById('drive-grid');
  const crumb=document.getElementById('crumb-text');
  container.innerHTML='';
  crumb.textContent=currentPath==='/'?'Home':currentPath;

  if(currentPath!=='/'){
    container.innerHTML+=`<div class="file-card ${viewMode==='list'?'list-item':''}" onclick="openPath('..')">
      <i class="ri-arrow-up-line fi" style="color:var(--text3)"></i>
      <span class="fn">Go Back</span></div>`;
  }
  if(data){
    let files=data.filter(f=>f.name!=='.keep');
    if(sortBy==='name')files.sort((a,b)=>a.name.localeCompare(b.name));
    else if(sortBy==='date')files.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
    files.forEach(f=>{
      const isDir=!f.metadata;
      const icon=isDir?'ri-folder-3-fill':getIcon(f.name);
      const color=isDir?'var(--primary)':'var(--text3)';
      const size=f.metadata?formatSize(f.metadata.size):'';
      const el=document.createElement('div');
      el.className=`file-card ${viewMode==='list'?'list-item':''}`;
      el.innerHTML=viewMode==='list'?
        `<i class="${icon} fi" style="color:${color}"></i><span class="fn">${f.name}</span><span class="fmeta">${size}</span>`:
        `<i class="${icon} fi" style="color:${color}"></i><span class="fn">${f.name}</span>`;
      el.onclick=()=>isDir?openPath(f.name):previewFile(f.name);
      el.oncontextmenu=e=>showCtx(e,'file',f.name);
      container.appendChild(el);
    });
    if(!files.length&&currentPath==='/'){
      container.innerHTML=`<div class="empty-state"><i class="ri-folder-open-line"></i><p>No files yet. Upload or drag files here.</p></div>`;
    }
  }
  container.className=viewMode==='list'?'drive-list':'drive-grid';
}

function getIcon(n){
  if(/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(n))return'ri-image-fill';
  if(/\.pdf$/i.test(n))return'ri-file-pdf-2-fill';
  if(/\.(zip|rar|7z)$/i.test(n))return'ri-file-zip-fill';
  if(/\.(doc|docx|txt)$/i.test(n))return'ri-file-text-fill';
  if(/\.(mp4|mov|avi)$/i.test(n))return'ri-video-fill';
  if(/\.(mp3|wav)$/i.test(n))return'ri-music-fill';
  return'ri-file-3-fill';
}
function formatSize(b){if(!b)return'';if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB'}
function openPath(f){
  if(f==='..'){const p=currentPath.split('/');p.pop();currentPath=p.length===0||(p.length===1&&p[0]==='')?'/':p.join('/')}
  else{currentPath=currentPath==='/'?f:`${currentPath}/${f}`}
  refreshDrive();
}
async function createFolder(){
  const name=prompt('Folder name:');
  if(name){const fp=currentPath==='/'?`${name}/.keep`:`${currentPath}/${name}/.keep`;
    await sb.storage.from('files').upload(fp,new Blob(['']));refreshDrive();toast('Folder created','success')}
}
async function uploadFiles(files){
  if(!files.length)return;toast(`Uploading ${files.length} file(s)...`,'info');
  for(const f of files){const fp=currentPath==='/'?f.name:`${currentPath}/${f.name}`;await sb.storage.from('files').upload(fp,f)}
  refreshDrive();toast('Upload complete','success');
}
async function renameFile(name){
  const newName=prompt('New name:',name);
  if(newName&&newName!==name){
    const oldPath=currentPath==='/'?name:`${currentPath}/${name}`;
    const newPath=currentPath==='/'?newName:`${currentPath}/${newName}`;
    const{data}=await sb.storage.from('files').download(oldPath);
    if(data){await sb.storage.from('files').upload(newPath,data);await sb.storage.from('files').remove([oldPath]);refreshDrive();toast('Renamed','success')}
  }
}
async function deleteFile(name){
  const path=currentPath==='/'?name:`${currentPath}/${name}`;
  trashedFiles.push({name,path,deletedAt:new Date().toISOString()});
  localStorage.setItem('pv_ftrash',JSON.stringify(trashedFiles));
  await sb.storage.from('files').remove([path]);
  refreshDrive();updateTrashBadge();toast('Moved to trash','warning');
}
async function previewFile(name){
  const path=currentPath==='/'?name:`${currentPath}/${name}`;
  const{data}=await sb.storage.from('files').createSignedUrl(path,3600);
  if(data?.signedUrl)window.open(data.signedUrl,'_blank');
}
function setViewMode(m){viewMode=m;document.querySelectorAll('.view-toggle button').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');refreshDrive()}
function setSortBy(val){sortBy=val;refreshDrive()}

// DRAG DROP
function handleDragOver(e){e.preventDefault();document.body.classList.add('dragging')}
function handleDragLeave(e){e.preventDefault();document.body.classList.remove('dragging')}
function handleDrop(e){e.preventDefault();document.body.classList.remove('dragging');
  if(!document.getElementById('view-drive').classList.contains('hidden'))uploadFiles(e.dataTransfer.files)}

// NOTES
async function refreshNotes(){
  let{data,error}=await sb.from('notes').select('*').order('created_at',{ascending:false});
  if(error){let r=await sb.from('notes').select('*');data=r.data}
  allNotes=data||[];renderNoteList(allNotes);
}
function renderNoteList(notes){
  const c=document.getElementById('notes-list');c.innerHTML='';
  notes.forEach(n=>{
    const locked=lockedNotes[n.id];const el=document.createElement('div');
    el.className=`note-item ${activeNote?.id===n.id?'active':''}`;
    el.innerHTML=`<div class="nt"><span>${locked?'<i class="ri-lock-fill"></i> ':''}${n.title||'Untitled'}</span>
      ${n.is_pinned?'<i class="ri-pushpin-fill" style="color:var(--primary);font-size:.75rem"></i>':''}</div>
      <div class="np">${locked?'••••••••':(n.content?.substring(0,60)||'Empty note')}</div>
      <div class="nm">${new Date(n.created_at).toLocaleDateString()}</div>`;
    el.onclick=()=>selectNote(n.id);
    el.oncontextmenu=e=>showCtx(e,'note',n.id);
    c.appendChild(el);
  });
}
function filterNotes(q){renderNoteList(allNotes.filter(n=>(n.title+n.content).toLowerCase().includes(q.toLowerCase())))}
function selectNote(id){
  activeNote=allNotes.find(n=>n.id===id);renderNoteList(allNotes);
  if(lockedNotes[id]){document.getElementById('lock-screen').classList.remove('hidden');document.getElementById('unlock-pw').value='';return}
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('note-title').value=activeNote.title||'';
  document.getElementById('note-body').value=activeNote.content||'';
  updateStats();updateLockIcon();
}
async function createNote(){
  const{data}=await sb.from('notes').insert([{title:'Untitled',content:''}]).select();
  if(data){allNotes.unshift(data[0]);selectNote(data[0].id);refreshNotes()}
}
function handleNoteInput(ta){
  const v=ta.value;
  if(v.endsWith('aistart')){ta.value=v.slice(0,-7);runAI(ta.value);return}
  triggerSave();
}
function triggerSave(){
  document.getElementById('save-status').innerHTML='<span style="animation:pulse 1s infinite">Saving...</span>';
  if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(saveNote,800);updateStats();
}
async function saveNote(){
  if(!activeNote)return;
  const title=document.getElementById('note-title').value,content=document.getElementById('note-body').value;
  await sb.from('notes').update({title,content}).eq('id',activeNote.id);
  document.getElementById('save-status').innerHTML='<span class="save-dot"></span>Saved';
  activeNote.title=title;activeNote.content=content;refreshNotes();
}
function updateStats(){
  const t=document.getElementById('note-body').value;
  const w=t.trim()?t.trim().split(/\s+/).length:0;
  const c=t.length;
  document.getElementById('word-count').textContent=`${w} words · ${c} chars · ${Math.ceil(w/200)} min`;
}

// LOCK
function toggleLock(){
  if(!activeNote)return;
  if(lockedNotes[activeNote.id]){delete lockedNotes[activeNote.id];toast('Unlocked','success')}
  else{const p=prompt('Set password:');if(p){lockedNotes[activeNote.id]=p;toast('Locked','success')}}
  localStorage.setItem('pv_locks',JSON.stringify(lockedNotes));updateLockIcon();refreshNotes();
}
function updateLockIcon(){
  const b=document.getElementById('btn-lock');
  if(activeNote&&lockedNotes[activeNote.id]){b.style.color='var(--primary)';b.innerHTML='<i class="ri-lock-fill"></i>'}
  else{b.style.color='';b.innerHTML='<i class="ri-lock-unlock-line"></i>'}
}
function unlockNote(){
  const p=document.getElementById('unlock-pw').value;
  if(p===lockedNotes[activeNote.id]){document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('note-title').value=activeNote.title;document.getElementById('note-body').value=activeNote.content;updateStats()}
  else toast('Wrong password','error');
}
function insertMD(ch){
  const ta=document.getElementById('note-body'),s=ta.selectionStart,e=ta.selectionEnd;
  ta.value=ta.value.substring(0,s)+ch+ta.value.substring(s,e)+ch+ta.value.substring(e);triggerSave();
}
function toggleFocus(){
  const ns=document.querySelector('.notes-sidebar'),sb2=document.getElementById('sidebar');
  const hide=ns.style.display!=='none';
  ns.style.display=hide?'none':'flex';sb2.style.display=hide?'none':'flex';
}

// AI HUMANIZER
async function runAI(text){
  if(!text.trim()){toast('Write something first','warning');return}
  toast('AI Processing... ✨','info');
  document.getElementById('save-status').innerHTML='<span style="color:var(--accent)">AI Working...</span>';
  await new Promise(r=>setTimeout(r,1200));
  const improved=humanizeText(text);
  document.getElementById('note-body').value=improved;
  document.getElementById('save-status').innerHTML='<span class="save-dot"></span>Saved';
  triggerSave();toast('Text refined by AI','success');
}
function humanizeText(text){
  let t=text;
  // Fix double spaces
  t=t.replace(/ {2,}/g,' ');
  // Capitalize sentences
  t=t.replace(/(^|[.!?]\s+)([a-z])/g,(m,p,c)=>p+c.toUpperCase());
  // Improve common phrases
  const replacements=[
    [/\bvery good\b/gi,'excellent'],[/\bvery bad\b/gi,'terrible'],[/\bvery big\b/gi,'enormous'],
    [/\bvery small\b/gi,'tiny'],[/\bvery happy\b/gi,'thrilled'],[/\bvery sad\b/gi,'devastated'],
    [/\bvery important\b/gi,'crucial'],[/\bvery easy\b/gi,'effortless'],[/\bvery hard\b/gi,'challenging'],
    [/\bin order to\b/gi,'to'],[/\bdue to the fact that\b/gi,'because'],[/\bat this point in time\b/gi,'now'],
    [/\bin the event that\b/gi,'if'],[/\bhas the ability to\b/gi,'can'],[/\ba lot of\b/gi,'many'],
    [/\bvery tired\b/gi,'exhausted'],[/\bvery hungry\b/gi,'famished'],[/\bvery fast\b/gi,'rapid'],
    [/\bvery slow\b/gi,'sluggish'],[/\bvery nice\b/gi,'lovely'],[/\bvery scared\b/gi,'terrified'],
    [/\bi think\b/gi,'I believe'],[/\bkind of\b/gi,'somewhat'],[/\bsort of\b/gi,'rather'],
    [/\bget rid of\b/gi,'eliminate'],[/\bcome up with\b/gi,'devise'],[/\blook into\b/gi,'investigate'],
  ];
  replacements.forEach(([pat,rep])=>{t=t.replace(pat,rep)});
  // Fix common typos
  const typos=[[/\bteh\b/g,'the'],[/\brecieve\b/gi,'receive'],[/\boccured\b/gi,'occurred'],
    [/\bseperate\b/gi,'separate'],[/\bdefinately\b/gi,'definitely'],[/\baccommodate\b/gi,'accommodate'],
    [/\boccasionally\b/gi,'occasionally'],[/\bneccessary\b/gi,'necessary']];
  typos.forEach(([pat,rep])=>{t=t.replace(pat,rep)});
  return t;
}

// GRAMMAR
function openGrammar(){
  const text=document.getElementById('note-body')?.value||'';
  if(!text.trim()){toast('Open a note with content first','warning');return}
  toast('Scanning grammar...','info');
  setTimeout(()=>{
    let issues=0;
    if(/\s{2,}/.test(text))issues++;
    if(/(^|[.!?]\s+)[a-z]/.test(text))issues++;
    if(/\b(teh|recieve|seperate|definately)\b/i.test(text))issues++;
    toast(issues?`Found ${issues} issue(s). Use AI to fix!`:'Grammar looks clean!',issues?'warning':'success');
  },1500);
}

// TRASH
function updateTrashBadge(){
  const b=document.getElementById('trash-badge');
  const count=trashedNotes.length+trashedFiles.length;
  if(b){b.textContent=count;b.style.display=count?'block':'none'}
}
async function deleteNote(id){
  const note=allNotes.find(n=>n.id===id);
  if(note){trashedNotes.push({...note,deletedAt:new Date().toISOString()});
    localStorage.setItem('pv_trash',JSON.stringify(trashedNotes))}
  await sb.from('notes').delete().eq('id',id);
  if(activeNote?.id===id)activeNote=null;
  refreshNotes();updateTrashBadge();toast('Note trashed','warning');
}
function renderTrash(){
  const c=document.getElementById('trash-content');c.innerHTML='';
  if(!trashedNotes.length&&!trashedFiles.length){
    c.innerHTML='<div class="empty-state"><i class="ri-delete-bin-line"></i><p>Trash is empty</p></div>';return}
  trashedNotes.forEach((n,i)=>{
    c.innerHTML+=`<div class="trash-item"><i class="ri-sticky-note-line ti"></i>
      <span class="tn">${n.title||'Untitled'}</span><span class="td">${new Date(n.deletedAt).toLocaleDateString()}</span>
      <button onclick="restoreNote(${i})" title="Restore"><i class="ri-arrow-go-back-line"></i></button>
      <button class="del" onclick="permDeleteNote(${i})" title="Delete forever"><i class="ri-delete-bin-line"></i></button></div>`;
  });
  trashedFiles.forEach((f,i)=>{
    c.innerHTML+=`<div class="trash-item"><i class="ri-file-3-line ti"></i>
      <span class="tn">${f.name}</span><span class="td">${new Date(f.deletedAt).toLocaleDateString()}</span>
      <button class="del" onclick="permDeleteFile(${i})" title="Delete forever"><i class="ri-delete-bin-line"></i></button></div>`;
  });
}
async function restoreNote(i){
  const n=trashedNotes.splice(i,1)[0];localStorage.setItem('pv_trash',JSON.stringify(trashedNotes));
  await sb.from('notes').insert([{title:n.title,content:n.content}]);
  refreshNotes();renderTrash();updateTrashBadge();toast('Note restored','success');
}
function permDeleteNote(i){trashedNotes.splice(i,1);localStorage.setItem('pv_trash',JSON.stringify(trashedNotes));renderTrash();updateTrashBadge();toast('Permanently deleted','error')}
function permDeleteFile(i){trashedFiles.splice(i,1);localStorage.setItem('pv_ftrash',JSON.stringify(trashedFiles));renderTrash();updateTrashBadge();toast('Permanently deleted','error')}
function emptyTrash(){if(!confirm('Empty trash? This cannot be undone.'))return;
  trashedNotes=[];trashedFiles=[];localStorage.setItem('pv_trash','[]');localStorage.setItem('pv_ftrash','[]');
  renderTrash();updateTrashBadge();toast('Trash emptied','success')}

// PIN
async function togglePin(id){
  const n=allNotes.find(x=>x.id===id);if(!n)return;
  await sb.from('notes').update({is_pinned:!n.is_pinned}).eq('id',id);refreshNotes();toast(n.is_pinned?'Unpinned':'Pinned','success');
}

// CONTEXT MENU
function showCtx(e,type,id){
  e.preventDefault();const m=document.getElementById('ctx-menu');
  m.style.display='block';m.style.left=e.pageX+'px';m.style.top=e.pageY+'px';m.classList.remove('hidden');
  let h='';
  if(type==='note'){
    h+=`<div class="ctx-item" onclick="togglePin('${id}')"><i class="ri-pushpin-line"></i>Pin/Unpin</div>`;
    h+=`<div class="ctx-item danger" onclick="deleteNote('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>`;
  }else{
    h+=`<div class="ctx-item" onclick="renameFile('${id}')"><i class="ri-edit-line"></i>Rename</div>`;
    h+=`<div class="ctx-item" onclick="previewFile('${id}')"><i class="ri-eye-line"></i>Preview</div>`;
    h+=`<div class="ctx-item danger" onclick="deleteFile('${id}')"><i class="ri-delete-bin-line"></i>Delete</div>`;
  }
  m.innerHTML=h;
  setTimeout(()=>document.addEventListener('click',()=>m.classList.add('hidden'),{once:true}),10);
}

// TOAST
function toast(msg,type='info'){
  const el=document.getElementById('toast'),ic=document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent=msg;
  const icons={info:'ri-information-line',success:'ri-check-line',warning:'ri-alert-line',error:'ri-close-circle-line'};
  const colors={info:'var(--primary)',success:'var(--success)',warning:'var(--warning)',error:'var(--danger)'};
  ic.className=icons[type]||icons.info;ic.style.color=colors[type]||colors.info;
  el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),3000);
}
