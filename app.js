// ---- Thème (appliqué avant tout rendu pour éviter un flash) ----
function applyTheme(pref){
  const resolved = pref==='auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : pref;
  document.documentElement.setAttribute('data-theme', resolved);
}
let themePref = 'dark';
try{ themePref = localStorage.getItem('fonte-theme') || 'dark'; }catch(e){}
applyTheme(themePref);

function setTheme(pref){
  themePref = pref;
  try{ localStorage.setItem('fonte-theme', pref); }catch(e){}
  applyTheme(pref);
  document.querySelectorAll('.theme-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.themeValue===pref);
  });
}
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{
  if(themePref==='auto') applyTheme('auto');
});

// ============================================================
//  CONNEXION À SUPABASE
// ============================================================
const SUPABASE_URL = 'https://nwdkeznwflmtidxgittq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MwMZwjs585vP0wi4mxm60w_5K5Bp63R';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;

// ---- Écran de connexion ----
let authMode = 'login';

function switchAuthMode(mode){
  authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode==='login');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode==='signup');
  document.getElementById('auth-submit').textContent = mode==='login' ? 'Se connecter' : 'Créer mon compte';
  document.getElementById('auth-password').setAttribute('autocomplete', mode==='login' ? 'current-password' : 'new-password');
  document.getElementById('auth-forgot').style.display = mode==='login' ? 'block' : 'none';
  hideAuthMessages();
}

function showAuthError(msg){
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('auth-info').style.display = 'none';
}
function showAuthInfo(msg){
  const el = document.getElementById('auth-info');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('auth-error').style.display = 'none';
}
function hideAuthMessages(){
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-info').style.display = 'none';
}

// Traduit les messages d'erreur de Supabase, qui sont en anglais
function translateAuthError(msg){
  const m = (msg||'').toLowerCase();
  if(m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.';
  if(m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet email. Passe sur « Connexion ».';
  if(m.includes('password should be at least')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if(m.includes('email not confirmed')) return 'Confirme ton adresse via le mail reçu avant de te connecter.';
  if(m.includes('unable to validate email') || m.includes('invalid email')) return 'Adresse email invalide.';
  if(m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if(m.includes('failed to fetch') || m.includes('network')) return 'Connexion au serveur impossible. Vérifie ta connexion internet.';
  return msg || 'Une erreur est survenue.';
}

async function submitAuth(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit');

  if(!email || !password){ showAuthError('Renseigne ton email et ton mot de passe.'); return; }
  if(authMode==='signup' && password.length<8){ showAuthError('Choisis un mot de passe d\'au moins 8 caractères.'); return; }

  hideAuthMessages();
  btn.disabled = true;
  btn.textContent = authMode==='login' ? 'Connexion…' : 'Création…';

  try{
    if(authMode==='login'){
      const {error} = await db.auth.signInWithPassword({email, password});
      if(error) throw error;
      // onAuthStateChange prend le relais
    } else {
      const {data, error} = await db.auth.signUp({email, password});
      if(error) throw error;
      if(data.user && !data.session){
        showAuthInfo('Compte créé. Ouvre le mail de confirmation, puis reviens te connecter.');
        switchAuthMode('login');
        showAuthInfo('Compte créé. Ouvre le mail de confirmation, puis reviens te connecter.');
      }
    }
  }catch(e){
    showAuthError(translateAuthError(e.message));
  }finally{
    btn.disabled = false;
    btn.textContent = authMode==='login' ? 'Se connecter' : 'Créer mon compte';
  }
}

async function sendResetEmail(){
  const email = document.getElementById('auth-email').value.trim();
  if(!email){ showAuthError('Saisis ton adresse email d\'abord.'); return; }
  try{
    const {error} = await db.auth.resetPasswordForEmail(email, {redirectTo: window.location.href});
    if(error) throw error;
    showAuthInfo('Si un compte existe pour cette adresse, un mail de réinitialisation vient de partir.');
  }catch(e){ showAuthError(translateAuthError(e.message)); }
}

async function signOut(){
  await db.auth.signOut();
  window.location.reload();
}

// ---- Aiguillage connexion / application ----
db.auth.onAuthStateChange((event, session) => {
  if(session && session.user){
    if(currentUser && currentUser.id === session.user.id) return; // déjà chargé
    currentUser = session.user;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-root').style.display = 'block';
    loadAll();
  } else if(event === 'SIGNED_OUT'){
    currentUser = null;
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-root').style.display = 'none';
  }
});

// Au démarrage : session déjà active ?
(async () => {
  const {data} = await db.auth.getSession();
  if(!data.session){
    document.getElementById('auth-screen').style.display = 'flex';
  }
})();

// ============================================================
//  PHOTOS (stockage de fichiers Supabase)
// ============================================================
// On garde la signature storageGet/storageSet pour que les
// fonctions d'affichage des photos restent inchangées.
function photoPath(weekKey){ return `${currentUser.id}/${weekKey}.jpg`; }

async function storageGet(key){
  if(!key.startsWith('photo-mensu:')) return null;
  const weekKey = key.slice('photo-mensu:'.length);
  try{
    const {data, error} = await db.storage.from('photos').download(photoPath(weekKey));
    if(error || !data) return null;
    return {key, value: URL.createObjectURL(data)};
  }catch(e){ return null; }
}

async function storageSet(key, value){
  if(!key.startsWith('photo-mensu:')) return null;
  const weekKey = key.slice('photo-mensu:'.length);
  try{
    const blob = await (await fetch(value)).blob();
    const {error} = await db.storage.from('photos')
      .upload(photoPath(weekKey), blob, {contentType:'image/jpeg', upsert:true});
    if(error) throw error;
    return {key, value};
  }catch(e){
    console.error('Envoi de la photo impossible', e);
    return null;
  }
}

let mensurations = [];
let exercices = [];
let performances = []; // séances : {id, weekKey, date, note, exercices:[{exoId, sets:[{poids,reps}]}]}
let suivi = [];
let objectifs = {mensu:{}, suivi:{}};
let reminderSettings = {day:null};
let reminderDismissedWeek = null;
let pseudo = '';
let avatar = '💪';
let onboarded = true;
let partageSeances = false;

const todayStr = () => new Date().toISOString().slice(0,10);
const fieldLabels = {pec:'Pectoraux',bras:'Bras',epaule:'Épaules',jambe:'Jambes',taille:'Taille'};
const DAY_NAMES = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

const ICONS = {
  ruler:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7v3M11 7v3M15 7v3M19 7v3"/></svg>',
  scale:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  dumbbell:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="9" width="3" height="6" rx="1"/><rect x="18.5" y="9" width="3" height="6" rx="1"/><path d="M5.5 12h13"/><rect x="7" y="7" width="2.5" height="10" rx="1"/><rect x="14.5" y="7" width="2.5" height="10" rx="1"/></svg>',
};

// ---- Semaine ISO ----
function isoWeekKey(d){
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (dt.getUTCDay()+6)%7;
  dt.setUTCDate(dt.getUTCDate()-dayNum+3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(),0,4));
  const fDayNum = (firstThursday.getUTCDay()+6)%7;
  firstThursday.setUTCDate(firstThursday.getUTCDate()-fDayNum+3);
  const weekNum = 1 + Math.round((dt-firstThursday)/(7*86400000));
  return `${dt.getUTCFullYear()}-W${String(weekNum).padStart(2,'0')}`;
}
function weekShort(weekKey){ const [,w] = weekKey.split('-W'); return 'S'+parseInt(w); }
function weekLabel(weekKey){ const [y,w] = weekKey.split('-W'); return `S${parseInt(w)} · ${y}`; }
function sortByWeek(arr){ return [...arr].sort((a,b)=>a.weekKey.localeCompare(b.weekKey)); }


function updateClock(){
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
  const timeStr = now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  const el = document.getElementById('live-clock');
  if(el) el.textContent = `${dateStr} · ${timeStr}`;
}
updateClock();
setInterval(updateClock, 30000);

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

function animateCount(el, target, duration=900){
  const startTime = performance.now();
  function step(now){
    const p = Math.min((now-startTime)/duration, 1);
    const eased = 1-Math.pow(1-p,3);
    el.textContent = Math.round(target*eased);
    if(p<1) requestAnimationFrame(step); else el.textContent = target;
  }
  requestAnimationFrame(step);
}

// Migration : si d'anciennes données existent au format "un exercice par entrée", on regroupe par séance.
function migratePerformances(arr){
  if(arr.length===0) return arr;
  if(arr[0].exercices) return arr;
  const grouped = {};
  arr.forEach(item=>{
    if(!grouped[item.weekKey]) grouped[item.weekKey] = {id: crypto.randomUUID(), weekKey:item.weekKey, date:item.date, note:null, exercices:[]};
    grouped[item.weekKey].exercices.push({exoId:item.exoId, sets:item.sets});
  });
  return Object.values(grouped);
}

// Retourne, pour un exercice, la liste triée de ses passages (un par séance où il apparaît)
function getExoEntries(exoId){
  return performances
    .filter(se=>se.exercices.some(b=>b.exoId===exoId))
    .map(se=>{ const b=se.exercices.find(bb=>bb.exoId===exoId); return {weekKey:se.weekKey, date:se.date, sets:b.sets, seanceId:se.id}; })
    .sort((a,b)=>a.weekKey.localeCompare(b.weekKey));
}

function getMensuNote(id){ const m = mensurations.find(x=>x.id===id); return m && m.note ? m.note : ''; }
function getSuiviNote(id){ const s = suivi.find(x=>x.id===id); return s && s.note ? s.note : ''; }
function getSeanceNote(id){ const se = performances.find(x=>x.id===id); return se && se.note ? se.note : ''; }
function showNote(text){ afficherInfo('Note', text); }

// ---- Photos de progression ----
function resizeImageToDataURL(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; } }
        else { if(h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function showPhoto(weekKey){
  try{
    const r = await storageGet('photo-mensu:'+weekKey);
    if(!r){ showToast('Photo introuvable'); return; }
    document.getElementById('photo-modal-img').src = r.value;
    document.getElementById('photo-modal-title').textContent = 'Photo — '+weekLabel(weekKey);
    document.getElementById('photo-modal').style.display = 'flex';
  }catch(e){ showToast('Photo introuvable'); }
}
function closePhotoModal(){ document.getElementById('photo-modal').style.display='none'; }

function renderCompareSelects(){
  const weeksWithPhoto = sortByWeek(mensurations.filter(m=>m.hasPhoto));
  const selA = document.getElementById('compare-week-a');
  const selB = document.getElementById('compare-week-b');
  if(weeksWithPhoto.length<2){
    selA.innerHTML=''; selB.innerHTML='';
    return;
  }
  const opts = weeksWithPhoto.map(m=>`<option value="${m.weekKey}">${weekLabel(m.weekKey)}</option>`).join('');
  selA.innerHTML = opts; selB.innerHTML = opts;
  selA.value = weeksWithPhoto[0].weekKey;
  selB.value = weeksWithPhoto[weeksWithPhoto.length-1].weekKey;
}

async function renderComparison(){
  const wkA = document.getElementById('compare-week-a').value;
  const wkB = document.getElementById('compare-week-b').value;
  const holder = document.getElementById('compare-holder');
  if(!wkA || !wkB){ holder.innerHTML = '<p class="empty">Ajoute des photos sur au moins deux semaines pour activer la comparaison.</p>'; return; }
  if(wkA===wkB){ holder.innerHTML = '<p class="empty">Choisis deux semaines différentes.</p>'; return; }
  try{
    const [ra, rb] = await Promise.all([storageGet('photo-mensu:'+wkA), storageGet('photo-mensu:'+wkB)]);
    if(!ra || !rb){ holder.innerHTML = '<p class="empty">Photo introuvable pour l\'une des semaines.</p>'; return; }
    holder.innerHTML = `
      <div class="compare-wrap">
        <img id="compare-after" src="${rb.value}">
        <img id="compare-before" src="${ra.value}" style="clip-path:inset(0 50% 0 0);">
      </div>
      <input type="range" min="0" max="100" value="50" id="compare-range" oninput="updateCompareSlider(this.value)" style="width:100%;margin-top:12px;">
      <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--ink-soft);margin-top:4px;">
        <span>◀ ${weekLabel(wkA)}</span><span>${weekLabel(wkB)} ▶</span>
      </div>`;
  }catch(e){ holder.innerHTML = '<p class="empty">Erreur lors du chargement des photos.</p>'; }
}

function updateCompareSlider(val){
  const before = document.getElementById('compare-before');
  if(before) before.style.clipPath = `inset(0 ${100-val}% 0 0)`;
}

async function loadAll(){
  try{
    const uid = currentUser.id;
    const [rProfile, rExos, rMensu, rSeances, rSeries, rSuivi, rObj, rRemind] = await Promise.all([
      db.from('profiles').select('pseudo, avatar, onboarded, partage_seances').eq('id', uid).maybeSingle(),
      db.from('exercices').select('*').order('created_at'),
      db.from('mensurations').select('*'),
      db.from('seances').select('*'),
      db.from('series').select('*').order('position'),
      db.from('suivi').select('*'),
      db.from('objectifs').select('*').eq('user_id', uid).maybeSingle(),
      db.from('reminder_settings').select('*').eq('user_id', uid).maybeSingle()
    ]);

    const firstError = [rProfile,rExos,rMensu,rSeances,rSeries,rSuivi,rObj,rRemind]
      .map(r=>r.error).find(Boolean);
    if(firstError) throw firstError;

    pseudo    = rProfile.data?.pseudo || '';
    avatar    = rProfile.data?.avatar || '💪';
    onboarded = rProfile.data?.onboarded ?? false;
    partageSeances = rProfile.data?.partage_seances ?? false;

    exercices = (rExos.data||[]).map(e=>({
      id: e.id, name: e.name,
      objectif: e.objectif!=null ? Number(e.objectif) : null
    }));

    mensurations = (rMensu.data||[]).map(m=>({
      id: m.id, date: m.date, weekKey: m.week_key,
      pec: numOrNull(m.pec), bras: numOrNull(m.bras), epaule: numOrNull(m.epaule),
      jambe: numOrNull(m.jambe), taille: numOrNull(m.taille),
      note: m.note, hasPhoto: !!m.photo_path
    }));

    // On recompose la structure imbriquée que le reste du code attend :
    // séance > blocs d'exercice > séries
    const seriesBySeance = {};
    (rSeries.data||[]).forEach(s=>{
      (seriesBySeance[s.seance_id] ||= []).push(s);
    });
    performances = (rSeances.data||[]).map(se=>{
      const blocks = [];
      const byExo = {};
      (seriesBySeance[se.id]||[]).forEach(s=>{
        if(!byExo[s.exercice_id]){
          byExo[s.exercice_id] = {exoId: s.exercice_id, sets: []};
          blocks.push(byExo[s.exercice_id]);
        }
        byExo[s.exercice_id].sets.push({poids: Number(s.poids), reps: Number(s.reps)});
      });
      return {id: se.id, weekKey: se.week_key, date: se.date, note: se.note, exercices: blocks};
    });

    suivi = (rSuivi.data||[]).map(s=>({
      id: s.id, date: s.date, weekKey: s.week_key,
      calories: numOrNull(s.calories), poids: numOrNull(s.poids), taille: numOrNull(s.taille),
      bonusDimanche: !!s.bonus_dimanche, note: s.note
    }));

    objectifs = {
      mensu: rObj.data?.mensu || {},
      suivi: rObj.data?.suivi || {}
    };

    reminderSettings = {day: numVersJour(rRemind.data?.day)};
    reminderDismissedWeek = rRemind.data?.dismissed_week ?? null;

  }catch(e){
    console.error('Chargement impossible', e);
    // Sans cette ligne, le conteneur reste en opacity:0 et la page
    // paraît vide au lieu d'afficher l'erreur.
    document.body.classList.add('loaded');
    const msg = (e && (e.message || e.hint || e.details)) || 'erreur inconnue';
    document.getElementById('loading').innerHTML =
      '<p class="empty">Impossible de charger tes données.<br><br>' +
      '<code style="font-family:var(--font-mono);font-size:11.5px;color:var(--accent);">' +
      String(msg).replace(/</g,'&lt;') + '</code><br><br>' +
      '<button class="ghost" onclick="window.location.reload()">Réessayer</button> ' +
      '<button class="ghost" onclick="signOut()">Se déconnecter</button></p>';
    return;
  }

  document.getElementById('loading').style.display='none';

  // On révèle l'application AVANT les rendus : si l'un d'eux échoue,
  // le reste du carnet doit rester utilisable plutôt que d'afficher
  // une page vide.
  document.body.classList.add('loaded');

  const safe = (label, fn) => {
    try{ fn(); }
    catch(e){ console.error('Affichage en échec :', label, e); }
  };

  safe('en-têtes de semaine', ()=>{
    const wk = isoWeekKey(new Date());
    document.getElementById('mensu-week-info').textContent = `Semaine en cours : ${weekLabel(wk)}`;
    document.getElementById('perf-week-info').textContent = `Semaine en cours : ${weekLabel(wk)}`;
    document.getElementById('reminder-day-select').value = reminderSettings.day || '';
  });

  safe('récap objectifs',    renderObjMensuRecap);
  safe('récap mensurations', renderMensuRecap);
  safe('récap suivi',        renderSuiviRecap);
  safe('récap séance',       renderSeanceRecap);
  safe('accueil',            renderHome);
  safe('historique mensu',   renderMensuHistory);
  safe('graphique mensu',    renderMensuChart);
  safe('liste exercices',    renderExoList);
  safe('sélecteur perf',     renderPerfChartSelect);
  safe('historique perf',    renderPerfHistory);
  safe('semaines perf',      renderPerfWeekSelect);
  safe('historique suivi',   renderSuiviHistory);
  safe('graphique suivi',    renderSuiviChart);
  safe('comparaison',        renderCompareSelects);

  safe('jalon', chargerJalonChoisi);
  safe('empreintes', initEmpreintes);
  safe('calcul XP', ()=>{ lastXPBreakdown = computeXPBreakdown(); });

  // La navbar était masquée pendant le chargement : les onglets avaient
  // donc une largeur nulle et la pastille ne pouvait pas se placer.
  // On la positionne maintenant que tout est visible et mesurable.
  safe('avatar', renderAvatar);
  safe('version et semaine', renderVersionAndWeek);
  chargerAmis();
  requestAnimationFrame(()=>{
    positionNavSlider();
    document.querySelector('.nav-slider')?.classList.add('ready');
  });

  safe('lien de profil', checkProfileLink);

  // Boutons Precedent / Suivant du navigateur
  window.addEventListener('hashchange', function(){
    const h = window.location.hash;
    if(/^#\/u\//.test(h) || /^#u=/.test(h)) checkProfileLink();
    else if(document.getElementById('view-profil').classList.contains('active')){
      const btn = document.querySelector('nav.tabs button[data-view="' + vueAvantProfil + '"]')
               || document.querySelector('nav.tabs button[data-view="accueil"]');
      btn.click();
    }
  });
  if(!onboarded) safe('accueil du nouveau compte', startOnboarding);
  else safe('rappel hebdo', checkWeeklyReminder);
}

const APP_VERSION = 'v3.0.0';
const numOrNull = v => v==null ? null : Number(v);

function renderVersionAndWeek(){
  const wk = isoWeekKey(new Date());
  const v = document.getElementById('footer-version');
  if(v) v.textContent = APP_VERSION;
  const nw = document.getElementById('nav-week');
  if(nw) nw.textContent = 'Semaine ' + weekLabel(wk);
  const pw = document.getElementById('profile-week');
  if(pw) pw.textContent = 'Semaine ' + weekLabel(wk);
}

// Dimanche selon l'heure locale de l'appareil : un utilisateur
// à l'étranger doit voir son bonus tomber son dimanche à lui.
function estDimanche(){ return new Date().getDay() === 0; }
const BONUS_DIMANCHE = 5;
const JOURS_SAISIE = 3;   // aujourd'hui, hier, avant-hier

// La colonne `day` est un entier en base, alors que le menu manipule
// des noms de jours. On convertit dans les deux sens (norme ISO : lundi = 1).
const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const jourVersNum = j => { const i = JOURS.indexOf(j); return i === -1 ? null : i + 1; };
const numVersJour = n => (n>=1 && n<=7) ? JOURS[n-1] : null;


// ============================================================
//  AVATAR
// ============================================================
const AVATARS = ['💪','🔥','🏋️','🦾','⚡','🐺','🦁','🐻','🦍','🚀','⚙️','🎯','🥇','🧊','🌑','🍀'];

function renderAvatarPicker(containerId, selected, onPick){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = AVATARS.map(a=>
    `<button class="avatar-opt${a===selected?' selected':''}" data-avatar="${a}">${a}</button>`
  ).join('');
  el.querySelectorAll('.avatar-opt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      el.querySelectorAll('.avatar-opt').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      onPick(btn.dataset.avatar);
    });
  });
}

function renderAvatar(){
  const nav = document.getElementById('nav-avatar');
  const burger = document.getElementById('burger-avatar');
  if(nav) nav.textContent = avatar;
  if(burger) burger.textContent = avatar;
}

async function saveAvatar(newAvatar){
  avatar = newAvatar;
  renderAvatar();
  try{
    check(await db.from('profiles').upsert({id: uid(), avatar, updated_at: new Date().toISOString()}));
    showToast('Avatar mis à jour ✓');
  }catch(e){
    console.error(e);
    showToast('⚠️ Enregistrement impossible');
  }
}

// ============================================================
//  CONFIGURATION INITIALE
// ============================================================
let onbAvatar = '💪';

function startOnboarding(){
  document.getElementById('onboarding').style.display = 'flex';
  document.getElementById('onb-progress').style.width = '50%';
  renderAvatarPicker('onb-avatar-picker', onbAvatar, a=>{ onbAvatar = a; });
  setTimeout(()=>document.getElementById('onb-pseudo').focus(), 200);
}

async function onbNext(){
  const val = document.getElementById('onb-pseudo').value.replace(/\s+/g,' ').trim().slice(0,24);
  const err = document.getElementById('onb-error');
  const btn = document.querySelector('#onb-step-1 .onb-btn');

  const souci = validerPseudo(val);
  if(souci){ err.textContent = souci; err.style.display = 'block'; return; }

  // On reserve le pseudo tout de suite : c'est la fonction en base
  // qui garantit l'unicite, pas le navigateur.
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Verification...';
  try{
    const res = await db.rpc('set_pseudo', {new_pseudo: val});
    if(res.error) throw res.error;
    pseudo = val;
    document.getElementById('onb-step-1').style.display = 'none';
    document.getElementById('onb-step-2').style.display = 'block';
    document.getElementById('onb-progress').style.width = '100%';
  }catch(e){
    err.textContent = e.message || 'Ce pseudo est indisponible.';
    err.style.display = 'block';
  }finally{
    btn.disabled = false; btn.textContent = 'Continuer';
  }
}

// Regles de pseudo, verifiees aussi en base
const PSEUDO_REGLES = 'Entre 2 et 24 caracteres. Lettres, chiffres, espaces, tirets et points uniquement.';
function validerPseudo(v){
  if(v.length < 2)  return 'Le pseudo doit faire au moins 2 caracteres.';
  if(v.length > 24) return 'Le pseudo ne peut pas depasser 24 caracteres.';
  if(!/^[A-Za-z0-9 _.\-]+$/.test(v))
    return 'Caracteres autorises : lettres, chiffres, espaces, tirets et points.';
  return null;
}

async function finishOnboarding(withDemo){
  avatar = onbAvatar;
  try{
    // Le pseudo a deja ete enregistre a l'etape 1 par set_pseudo,
    // qui seul garantit l'unicite. On ne touche qu'a l'avatar ici.
    check(await db.from('profiles').upsert({
      id: uid(), avatar, onboarded: true, updated_at: new Date().toISOString()
    }));
  }catch(e){ console.error(e); showToast('⚠️ Enregistrement impossible'); }

  document.getElementById('onboarding').style.display = 'none';
  renderAvatar();
  renderPseudo();
  renderHome();
  if(withDemo) startDemo();
  else showToast(`Bienvenue, ${pseudo} 👋`);
}

// ============================================================
//  DÉMO
// ============================================================
const DEMO_STEPS = [
  {icon:'🏠', title:'L\'accueil',
   text:"Ton tableau de bord : niveau, ligue, barre d'XP et résumé de la semaine. C'est la page qui te dit en un coup d'œil où tu en es."},
  {icon:'📏', title:'Mensurations',
   text:"Chaque semaine, relève ton tour de pectoraux, bras, épaules, jambes et taille. Tu peux ajouter une photo pour comparer visuellement deux semaines côte à côte."},
  {icon:'🏋️', title:'Performances',
   text:"Crée tes exercices, puis enregistre tes séances série par série. Le carnet suit ta progression vers tes objectifs de charge et détecte tes records."},
  {icon:'⚖️', title:'Suivi hebdo',
   text:"Poids, calories et tour de taille, une fois par semaine. Faire ton bilan le dimanche rapporte un bonus d'XP."},
  {icon:'🏆', title:'Records',
   text:"Tes meilleures charges par exercice, ta grille d'assiduité sur l'année et tes jalons de régularité. C'est la page qui récompense la constance."},
  {icon:'📊', title:'Corrélations',
   text:"Croise tes calories et ton poids avec le volume que tu soulèves. C'est là que tu repères ce qui marche vraiment pour toi."},
  {icon:'🎮', title:'Niveaux et ligues',
   text:"Chaque séance, chaque record et chaque semaine d'affilée rapporte de l'XP, annoncée en direct à l'écran. La régularité compte plus que les grosses performances isolées."},
  {icon:'🔒', title:'Tes données t\'appartiennent',
   text:"Tout est synchronisé entre tes appareils et visible de toi seul. Tu peux exporter en JSON ou en PDF à tout moment, et supprimer ton carnet ou ton compte d'un clic."}
];
let demoIndex = 0;

function startDemo(){
  demoIndex = 0;
  document.getElementById('demo-modal').style.display = 'flex';
  renderDemoStep();
}

function renderDemoStep(){
  const step = DEMO_STEPS[demoIndex];
  document.getElementById('demo-visual').textContent = step.icon;
  document.getElementById('demo-title').textContent = step.title;
  document.getElementById('demo-text').textContent = step.text;
  document.getElementById('demo-dots').innerHTML =
    DEMO_STEPS.map((_,i)=>`<span class="demo-dot${i===demoIndex?' active':''}"></span>`).join('');
  document.getElementById('demo-next').textContent =
    demoIndex === DEMO_STEPS.length-1 ? 'Commencer' : 'Suivant';
}

function demoNext(){
  if(demoIndex < DEMO_STEPS.length-1){ demoIndex++; renderDemoStep(); }
  else closeDemo();
}
function closeDemo(){ document.getElementById('demo-modal').style.display = 'none'; }

// ============================================================
//  RÉGLAGES
// ============================================================
function openSettings(){
  nettoyerAdresseProfil();
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-reglages').classList.add('active');
  document.getElementById('nav-avatar').classList.add('active');
  positionNavSlider();
  renderSettings();
}

function renderSettings(){
  document.getElementById('settings-pseudo').value = pseudo || '';
  document.getElementById('settings-email').textContent = currentUser ? currentUser.email : '—';
  renderAvatarPicker('settings-avatar-picker', avatar, saveAvatar);
  renderPartageBtns();
  document.querySelectorAll('.theme-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.themeValue===themePref);
  });
}

async function saveSettingsPseudo(){
  const val = document.getElementById('settings-pseudo').value.replace(/\s+/g,' ').trim().slice(0,24);
  const souci = validerPseudo(val);
  if(souci){ showToast(souci); return; }
  if(val === pseudo){ showToast('C\'est deja ton pseudo'); return; }
  try{
    // La regle "un changement par mois" est appliquee en base :
    // la contourner depuis le navigateur ne servirait a rien.
    const res = await db.rpc('set_pseudo', {new_pseudo: val});
    if(res.error) throw res.error;
    pseudo = val;
    renderPseudo();
    showToast('Pseudo mis a jour');
  }catch(e){
    showToast(e.message || 'Changement impossible');
  }
}

// ============================================================
//  ASSISTANT PAS-À-PAS
// ============================================================
// Un moteur unique alimente les quatre parcours (mensurations,
// objectifs, suivi, séance). Chaque parcours décrit ses étapes ;
// le moteur gère navigation, progression, touche Entrée et récap.

const MENSU_FIELDS = [
  {key:'pec',    label:'Pectoraux', unit:'cm'},
  {key:'bras',   label:'Bras',      unit:'cm'},
  {key:'epaule', label:'Épaules',   unit:'cm'},
  {key:'jambe',  label:'Jambes',    unit:'cm'},
  {key:'taille', label:'Tour de taille', unit:'cm'},
];
const SUIVI_FIELDS = [
  {key:'poids',    label:'Poids',              unit:'kg',  step:'0.1'},
  {key:'calories', label:'Calories moy./jour', unit:'kcal',step:'1'},
  {key:'taille',   label:'Tour de taille',     unit:'cm',  step:'0.1'},
];
const OBJ_FIELDS = [
  ...MENSU_FIELDS,
  {key:'poidsCible', label:'Poids cible', unit:'kg'},
];

let wiz = null; // {type, steps, index, data, editing}

function startWizard(type){
  if(type==='mensurations')  wiz = buildMensuWizard();
  else if(type==='objectifs') wiz = buildObjWizard();
  else if(type==='suivi')     wiz = buildSuiviWizard();
  else if(type==='exercice')  wiz = buildExoWizard();
  else if(type==='seance')    wiz = buildSeanceWizard();
  else return;
  document.getElementById('wizard-modal').style.display = 'flex';
  renderWizStep();
}

function closeWizard(){
  document.getElementById('wizard-modal').style.display = 'none';
  wiz = null;
}

function renderWizStep(){
  if(!wiz) return;
  const step = wiz.steps[wiz.index];
  document.getElementById('wiz-eyebrow').textContent =
    `Étape ${wiz.index+1} sur ${wiz.steps.length}`;
  document.getElementById('wiz-title').textContent = step.title;
  document.getElementById('wiz-progress').style.width =
    Math.round(((wiz.index+1)/wiz.steps.length)*100) + '%';
  document.getElementById('wiz-body').innerHTML = step.render();
  document.getElementById('wiz-back').style.visibility = wiz.index===0 ? 'hidden' : 'visible';
  document.getElementById('wiz-next').textContent =
    wiz.index===wiz.steps.length-1 ? (wiz.saveLabel||'Enregistrer') : 'Suivant';
  if(step.after) step.after();

  // La touche Entrée fait avancer, comme le bouton
  const first = document.querySelector('#wiz-body input:not([type=file]):not([type=checkbox])');
  if(first){
    first.focus();
    if(first.select) first.select();
  }
  document.querySelectorAll('#wiz-body input').forEach(inp=>{
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); wizNext(); }
    });
  });
}

function wizBack(){
  if(!wiz || wiz.index===0) return;
  if(wiz.steps[wiz.index].collect) wiz.steps[wiz.index].collect();
  wiz.index--;
  renderWizStep();
}

async function wizNext(){
  if(!wiz) return;
  const step = wiz.steps[wiz.index];
  if(step.collect){
    const ok = step.collect();
    if(ok === false) return; // validation échouée
  }
  if(wiz.index < wiz.steps.length-1){
    wiz.index++;
    renderWizStep();
  } else {
    const btn = document.getElementById('wiz-next');
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try{ await wiz.finish(); closeWizard(); }
    catch(e){ console.error(e); showToast('⚠️ Enregistrement impossible'); }
    finally{ btn.disabled = false; }
  }
}

// Champ numérique générique
function numStep(field, getVal, setVal, previous){
  return {
    title: field.label,
    render(){
      const v = getVal();
      const prev = previous ? previous() : null;
      return `
        <div class="wiz-field">
          <label>${field.label} (${field.unit})</label>
          <input type="number" step="${field.step||'0.1'}" id="wiz-input"
                 value="${v ?? ''}" placeholder="—" inputmode="decimal">
          ${prev!=null ? `<div class="wiz-prev">Semaine précédente : ${prev} ${field.unit}</div>` : ''}
          <div class="wiz-hint">Laisse vide pour passer ce champ.</div>
        </div>`;
    },
    collect(){
      const raw = document.getElementById('wiz-input').value;
      setVal(raw==='' ? null : parseFloat(raw));
    }
  };
}

// Étape de récapitulatif
function recapStep(title, fields, getData, extra){
  return {
    title,
    render(){
      const rows = fields.map(f=>{
        const v = getData()[f.key];
        return `<div class="recap-row">
          <span class="recap-label">${f.label}</span>
          <span class="recap-value${v==null?' empty-val':''}">${v==null?'non renseigné':v+`<span class="unit">${f.unit}</span>`}</span>
        </div>`;
      }).join('');
      return `<div class="recap">${rows}</div>${extra?extra():''}`;
    },
  };
}

// ---- Parcours : mensurations ----
function buildMensuWizard(){
  const wk = isoWeekKey(new Date());
  const existing = mensurations.find(m=>m.weekKey===wk);
  const sorted = sortByWeek(mensurations.filter(m=>m.weekKey!==wk));
  const prevEntry = sorted.length ? sorted[sorted.length-1] : null;
  const data = {};
  MENSU_FIELDS.forEach(f=> data[f.key] = existing ? existing[f.key] : null);

  const steps = MENSU_FIELDS.map(f=>
    numStep(f, ()=>data[f.key], v=>data[f.key]=v, ()=>prevEntry ? prevEntry[f.key] : null)
  );
  steps.push(recapStep('Récapitulatif', MENSU_FIELDS, ()=>data, ()=>`
    <label class="wiz-photo" for="wiz-photo" style="display:block;cursor:pointer;text-align:center;">
      📷 ${existing && existing.hasPhoto ? 'Remplacer la photo de cette semaine' : 'Ajouter une photo de progression'}
    </label>
    <input type="file" accept="image/*" id="wiz-photo" style="display:none;"
           onchange="document.querySelector('label[for=wiz-photo]').textContent = '📷 ' + (this.files[0]?.name || 'Photo sélectionnée')">
    <div class="wiz-hint" style="margin-top:8px;">
      Facultatif. Prise dans les mêmes conditions chaque semaine, elle rend la progression bien plus lisible
      que les chiffres seuls. Elle reste privée : personne d'autre ne peut la voir.
    </div>
  `));

  return {
    type:'mensurations', steps, index:0, data,
    saveLabel: existing ? 'Mettre à jour' : 'Enregistrer',
    async finish(){
      const photoInput = document.getElementById('wiz-photo');
      let photoDataURL = null;
      if(photoInput && photoInput.files && photoInput.files[0]){
        try{ photoDataURL = await resizeImageToDataURL(photoInput.files[0], 900, 0.72); }
        catch(e){ showToast('Photo illisible, ignorée'); }
      }
      let entry = mensurations.find(m=>m.weekKey===wk);
      if(entry){
        MENSU_FIELDS.forEach(f=> entry[f.key] = data[f.key]);
        entry.date = todayStr();
      } else {
        entry = {id: crypto.randomUUID(), date: todayStr(), weekKey: wk,
                 ...data, note:null, hasPhoto:false};
        mensurations.push(entry);
      }
      if(photoDataURL){
        try{ await storageSet('photo-mensu:'+wk, photoDataURL); entry.hasPhoto = true; }
        catch(e){ showToast('Photo non enregistrée'); }
      }
      await save('mensurations', mensurations);
      renderMensuRecap(); renderMensuHistory(); renderMensuChart();
      renderCompareSelects(); renderHome();
      showToast(existing ? 'Mesures mises à jour ✓' : 'Mesures enregistrées ✓');
    }
  };
}

// ---- Parcours : objectifs ----
function buildObjWizard(){
  const data = {};
  MENSU_FIELDS.forEach(f=> data[f.key] = objectifs.mensu[f.key] ?? null);
  data.poidsCible = objectifs.suivi.poids ?? null;

  const steps = OBJ_FIELDS.map(f=>
    numStep(f, ()=>data[f.key], v=>data[f.key]=v, null)
  );
  steps.push(recapStep('Récapitulatif', OBJ_FIELDS, ()=>data));

  return {
    type:'objectifs', steps, index:0, data, saveLabel:'Enregistrer',
    async finish(){
      MENSU_FIELDS.forEach(f=>{
        if(data[f.key]==null) delete objectifs.mensu[f.key];
        else objectifs.mensu[f.key] = data[f.key];
      });
      // Le tour de taille sert aussi d'objectif côté suivi
      if(data.taille==null) delete objectifs.suivi.taille;
      else objectifs.suivi.taille = data.taille;
      if(data.poidsCible==null) delete objectifs.suivi.poids;
      else objectifs.suivi.poids = data.poidsCible;

      await save('objectifs', objectifs);
      renderObjMensuRecap(); renderMensuChart(); renderSuiviChart(); renderHome();
      showToast('Objectifs enregistrés ✓');
    }
  };
}

// ---- Parcours : suivi hebdo ----
function buildSuiviWizard(){
  const wk = isoWeekKey(new Date());
  const existing = suivi.find(s=>s.weekKey===wk);
  const sorted = sortByWeek(suivi.filter(s=>s.weekKey!==wk));
  const prevEntry = sorted.length ? sorted[sorted.length-1] : null;
  const data = {};
  SUIVI_FIELDS.forEach(f=> data[f.key] = existing ? existing[f.key] : null);

  const steps = SUIVI_FIELDS.map(f=>
    numStep(f, ()=>data[f.key], v=>data[f.key]=v, ()=>prevEntry ? prevEntry[f.key] : null)
  );
  steps.push(recapStep('Récapitulatif', SUIVI_FIELDS, ()=>data, ()=>{
    if(existing) return '';
    return estDimanche()
      ? `<div class="wiz-prev">📅 Bilan du dimanche : +${BONUS_DIMANCHE} XP en plus</div>`
      : `<div class="wiz-hint">Astuce : faire ton bilan le dimanche rapporte ${BONUS_DIMANCHE} XP de plus.</div>`;
  }));

  return {
    type:'suivi', steps, index:0, data,
    saveLabel: existing ? 'Mettre à jour' : 'Enregistrer',
    async finish(){
      let entry = suivi.find(s=>s.weekKey===wk);
      if(entry){
        // Modification : on ne retouche ni la date ni le bonus déjà acquis,
        // sinon il suffirait de rouvrir le formulaire un dimanche pour l'obtenir.
        SUIVI_FIELDS.forEach(f=> entry[f.key] = data[f.key]);
      } else {
        suivi.push({id: crypto.randomUUID(), date: todayStr(), weekKey: wk,
                    poids:data.poids, calories:data.calories, taille:data.taille,
                    bonusDimanche: estDimanche(), note:null});
      }
      await save('suivi', suivi);
      renderSuiviRecap(); renderSuiviHistory(); renderSuiviChart();
      renderCorrelations(); renderHome();
      showToast(existing ? 'Suivi mis à jour ✓' : 'Suivi enregistré ✓');
    }
  };
}

// ---- Parcours : nouvel exercice ----
function buildExoWizard(){
  const data = {name:'', objectif:null};
  return {
    type:'exercice', index:0, data, saveLabel:'Ajouter',
    steps:[
      {
        title:'Nom de l\'exercice',
        render(){
          return `<div class="wiz-field">
            <label>Nom</label>
            <input type="text" id="wiz-input" value="${data.name}" placeholder="ex : Développé couché">
          </div>`;
        },
        collect(){
          const v = document.getElementById('wiz-input').value.trim();
          if(!v){ showToast('Donne un nom à l\'exercice'); return false; }
          if(exercices.some(e=>e.name.toLowerCase()===v.toLowerCase())){
            showToast('Cet exercice existe déjà'); return false;
          }
          data.name = v;
        }
      },
      {
        title:'Objectif de charge',
        render(){
          return `<div class="wiz-field">
            <label>Objectif (kg)</label>
            <input type="number" step="0.5" id="wiz-input" value="${data.objectif ?? ''}" placeholder="—" inputmode="decimal">
            <div class="wiz-hint">Facultatif. Sert à afficher ta progression vers cette charge.</div>
          </div>`;
        },
        collect(){
          const raw = document.getElementById('wiz-input').value;
          data.objectif = raw==='' ? null : parseFloat(raw);
        }
      }
    ],
    async finish(){
      exercices.push({id: crypto.randomUUID(), name:data.name, objectif:data.objectif});
      await save('exercices', exercices);
      renderExoList(); renderPerfChartSelect(); renderHome();
      showToast('Exercice ajouté ✓');
    }
  };
}

// ---- Parcours : séance ----
function buildSeanceWizard(){
  if(exercices.length===0){
    return {type:'seance', index:0, steps:[{title:'Aucun exercice',
      render:()=>`<p class="recap-empty">Tu dois d'abord creer au moins un exercice avant d'enregistrer une seance.</p>
        <button class="primary" style="width:100%;border-radius:999px;" onclick="closeWizard(); startWizard('exercice');">Ajouter un exercice</button>`}],
      saveLabel:'Fermer', async finish(){}};
  }

  // Saisie possible sur les 3 derniers jours : oublier d'enregistrer
  // le soir meme ne doit pas coûter une semaine. La limite d'une
  // seance par jour, elle, reste : c'est elle qui ferme l'exploit.
  let dateChoisie = todayStr();
  let existingSeance = performances.find(p=>p.date===dateChoisie);
  let blocks = existingSeance
    ? existingSeance.exercices.map(b=>({exoId:b.exoId, sets:b.sets.map(x=>({poids:x.poids, reps:x.reps}))}))
    : [];
  let picked = null;
  let noteSeance = existingSeance ? (existingSeance.note || '') : '';

  function joursDisponibles(){
    const out = [];
    for(let i=0;i<JOURS_SAISIE;i++){
      const d = new Date();
      d.setDate(d.getDate()-i);
      const iso = d.toISOString().slice(0,10);
      const nom = i===0 ? "Aujourd'hui"
                : i===1 ? 'Hier'
                : d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
      out.push({iso, nom, existe: !!performances.find(p=>p.date===iso)});
    }
    return out;
  }

  const dateStep = {
    title:'Quel jour ?',
    render(){
      return '<div class="wiz-exo-pick">' + joursDisponibles().map(function(j){
        return '<button class="wiz-exo-opt' + (j.iso===dateChoisie?' chosen':'') + '" data-date="' + j.iso + '">' +
          '<span>' + j.nom + '</span><small>' + (j.existe ? 'seance deja enregistree - modifier' : 'aucune seance') + '</small>' +
        '</button>';
      }).join('') + '</div>' +
      '<div class="wiz-hint">Une seule seance par jour. Tu peux revenir sur les ' + JOURS_SAISIE + ' derniers jours.</div>';
    },
    after(){
      document.querySelectorAll('.wiz-exo-opt[data-date]').forEach(function(btn){
        btn.addEventListener('click', function(){
          dateChoisie = btn.dataset.date;
          existingSeance = performances.find(p=>p.date===dateChoisie);
          blocks = existingSeance
            ? existingSeance.exercices.map(b=>({exoId:b.exoId, sets:b.sets.map(x=>({poids:x.poids, reps:x.reps}))}))
            : [];
          wiz.index = 1;
          renderWizStep();
        });
      });
    }
  };

  const pickStep = {
    title:'Choisis un exercice',
    render(){
      const done = blocks.map(b=>b.exoId);
      const opts = exercices.map(e=>{
        const last = getExoEntries(e.id).slice(-1)[0];
        const hint = last ? `dernière fois : ${Math.max(...last.sets.map(s=>s.poids))} kg` : 'jamais fait';
        return `<button class="wiz-exo-opt${done.includes(e.id)?' chosen':''}" data-exo="${e.id}">
          <span>${e.name}</span><small>${done.includes(e.id)?'déjà ajouté ✓':hint}</small>
        </button>`;
      }).join('');
      return `<div class="wiz-exo-pick">${opts}</div>
        ${blocks.length ? `<div class="wiz-hint">${blocks.length} exercice(s) dans cette séance. Passe au récapitulatif pour enregistrer.</div>` : ''}`;
    },
    after(){
      document.querySelectorAll('.wiz-exo-opt').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          picked = btn.dataset.exo;
          wiz.index = 2;
          renderWizStep();
        });
      });
    },
    collect(){
      if(!picked && blocks.length===0){ showToast('Choisis un exercice'); return false; }
    }
  };

  const setsStep = {
    title:'Séries',
    render(){
      const exo = exercices.find(e=>e.id===picked);
      const existing = blocks.find(b=>b.exoId===picked);
      const sets = existing ? existing.sets : [{poids:'',reps:''}];
      const last = getExoEntries(picked).slice(-1)[0];
      const rows = sets.map((s,i)=>`
        <div class="wiz-set-row">
          <span class="idx">#${i+1}</span>
          <input type="number" step="0.5" class="wiz-poids" value="${s.poids}" placeholder="kg" inputmode="decimal">
          <span class="sep">×</span>
          <input type="number" class="wiz-reps" value="${s.reps}" placeholder="reps" inputmode="numeric">
        </div>`).join('');
      return `
        <div style="font-family:var(--font-body);font-weight:600;font-size:15px;margin-bottom:12px;">${exo?exo.name:''}</div>
        <div class="wiz-sets" id="wiz-sets">${rows}</div>
        <button class="small" onclick="wizAddSet()">+ Ajouter une série</button>
        ${last ? `<div class="wiz-prev">Dernière séance : ${last.sets.map(s=>s.poids+'×'+s.reps).join(', ')}</div>` : ''}
        <div class="wiz-hint">Entrée valide et passe à la suite.</div>`;
    },
    collect(){
      const rows = [...document.querySelectorAll('#wiz-sets .wiz-set-row')];
      const sets = rows.map(r=>({
        poids: parseFloat(r.querySelector('.wiz-poids').value),
        reps:  parseInt(r.querySelector('.wiz-reps').value, 10)
      })).filter(s=>!isNaN(s.poids) && !isNaN(s.reps) && s.reps>0);
      if(sets.length===0){ showToast('Renseigne au moins une série complète'); return false; }
      const existing = blocks.find(b=>b.exoId===picked);
      if(existing) existing.sets = sets;
      else blocks.push({exoId:picked, sets});
      picked = null;
    }
  };

  const noteStep = {
    title:'Une note ?',
    render(){
      const valeur = (existingSeance && existingSeance.note) ? existingSeance.note : (noteSeance || '');
      return '<div class="wiz-field">' +
        '<label>Note de séance (facultatif)</label>' +
        '<textarea id="wiz-note" class="wiz-textarea" maxlength="280" rows="4" ' +
        'placeholder="ex : jambes lourdes mais PR au squat, bonne séance"></textarea>' +
        '<div class="wiz-hint">Si tu partages tes séances, tes amis verront cette note et pourront y réagir. ' +
        '280 caractères maximum.</div></div>';
    },
    after(){
      const ta = document.getElementById('wiz-note');
      if(ta) ta.value = (existingSeance && existingSeance.note) ? existingSeance.note : (noteSeance || '');
    },
    collect(){
      const ta = document.getElementById('wiz-note');
      noteSeance = ta ? ta.value.trim().slice(0,280) : '';
    }
  };

  const recap = {
    title:'Récapitulatif',
    render(){
      if(blocks.length===0) return `<p class="recap-empty">Aucun exercice ajouté.</p>`;
      const rows = blocks.map(b=>{
        const exo = exercices.find(e=>e.id===b.exoId);
        const vol = b.sets.reduce((t,s)=>t+s.poids*s.reps,0);
        return `<div class="recap-row">
          <span class="recap-label">${exo?exo.name:'—'}<br>
            <small style="font-family:var(--font-mono);font-size:10.5px;opacity:.7;">
              ${b.sets.map(s=>s.poids+'×'+s.reps).join(', ')}</small></span>
          <span class="recap-value">${vol}<span class="unit">kg vol.</span></span>
        </div>`;
      }).join('');
      const bloc = noteSeance
        ? `<div class="wiz-prev" style="margin-top:12px;">📝 ${noteSeance.replace(/</g,'&lt;')}</div>` : '';
      return `<div class="recap">${rows}</div>${bloc}
        <button class="small" style="margin-top:12px;" onclick="wizBackToPick()">+ Ajouter un autre exercice</button>`;
    },
    collect(){
      if(blocks.length===0){ showToast('Ajoute au moins un exercice'); return false; }
    }
  };

  return {
    type:'seance', steps:[dateStep, pickStep, setsStep, noteStep, recap], index:0,
    get saveLabel(){ return performances.find(p=>p.date===dateChoisie) ? 'Mettre a jour la seance' : 'Enregistrer la seance'; },
    get blocks(){ return blocks; },
    async finish(){
      const dejaLa = performances.find(p=>p.date===dateChoisie);
      if(dejaLa){
        dejaLa.exercices = blocks;
        dejaLa.note = noteSeance || null;
      } else {
        performances.push({
          id: crypto.randomUUID(), weekKey: isoWeekKey(new Date(dateChoisie)),
          date: dateChoisie, note: noteSeance || null, exercices: blocks
        });
      }
      await save('performances', performances);
      renderSeanceRecap(); renderPerfHistory(); renderPerfWeekSelect();
      renderPerfChart(); renderHome();
      showToast('Seance enregistree');
    }
  };
}

function wizAddSet(){
  const holder = document.getElementById('wiz-sets');
  if(!holder) return;
  const i = holder.children.length + 1;
  const div = document.createElement('div');
  div.className = 'wiz-set-row';
  div.innerHTML = `<span class="idx">#${i}</span>
    <input type="number" step="0.5" class="wiz-poids" placeholder="kg" inputmode="decimal">
    <span class="sep">×</span>
    <input type="number" class="wiz-reps" placeholder="reps" inputmode="numeric">`;
  holder.appendChild(div);
  div.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); wizNext(); } });
  });
  div.querySelector('.wiz-poids').focus();
}

function wizBackToPick(){
  if(!wiz) return;
  wiz.index = 1;
  renderWizStep();
}

// ============================================================
//  RÉCAPITULATIFS AFFICHÉS DANS LES BLOCS
// ============================================================
function recapHTML(fields, obj){
  return `<div class="recap">` + fields.map(f=>{
    const v = obj ? obj[f.key] : null;
    return `<div class="recap-row">
      <span class="recap-label">${f.label}</span>
      <span class="recap-value${v==null?' empty-val':''}">${v==null?'—':v+`<span class="unit">${f.unit}</span>`}</span>
    </div>`;
  }).join('') + `</div>`;
}

function renderMensuRecap(){
  const wk = isoWeekKey(new Date());
  const entry = mensurations.find(m=>m.weekKey===wk);
  const el = document.getElementById('mensu-recap');
  const btn = document.getElementById('mensu-btn');
  if(!el || !btn) return;
  if(entry){
    el.innerHTML = recapHTML(MENSU_FIELDS, entry) +
      (entry.hasPhoto
        ? `<button class="small" style="margin-top:10px;" onclick="showPhoto('${entry.weekKey}')">📷 Voir la photo de la semaine</button>`
        : `<div class="wiz-hint" style="margin-top:10px;">Aucune photo cette semaine — tu peux en ajouter une en modifiant tes mesures.</div>`);
    btn.textContent = 'Modifier mes mesures';
  } else {
    el.innerHTML = `<p class="recap-empty">Aucune mesure enregistrée pour cette semaine.</p>`;
    btn.textContent = 'Ajouter mes mesures';
  }
}

function renderObjMensuRecap(){
  const el = document.getElementById('obj-mensu-recap');
  const btn = document.getElementById('obj-mensu-btn');
  if(!el || !btn) return;
  const data = {...objectifs.mensu, poidsCible: objectifs.suivi.poids ?? null};
  const any = OBJ_FIELDS.some(f=>data[f.key]!=null);
  if(any){
    el.innerHTML = recapHTML(OBJ_FIELDS, data);
    btn.textContent = 'Modifier mes objectifs';
  } else {
    el.innerHTML = `<p class="recap-empty">Aucun objectif défini. C'est facultatif, mais ça affiche ta progression sur les graphiques.</p>`;
    btn.textContent = 'Définir mes objectifs';
  }
}

function renderSuiviRecap(){
  const wk = isoWeekKey(new Date());
  const entry = suivi.find(s=>s.weekKey===wk);
  const el = document.getElementById('suivi-recap');
  const btn = document.getElementById('suivi-btn');
  const info = document.getElementById('suivi-week-info');
  if(info) info.textContent = `Semaine en cours : ${weekLabel(wk)}`;
  if(!el || !btn) return;
  if(entry){
    el.innerHTML = recapHTML(SUIVI_FIELDS, entry) +
      (entry.bonusDimanche ? `<div class="wiz-prev">📅 Bilan fait le dimanche — bonus obtenu</div>` : '');
    btn.textContent = 'Modifier mon suivi';
  } else {
    el.innerHTML = `<p class="recap-empty">Aucun suivi enregistré pour cette semaine.</p>`;
    btn.textContent = 'Ajouter mon suivi';
  }
}

function renderSeanceRecap(){
  const wk = isoWeekKey(new Date());
  const today = todayStr();
  const weekSeances = performances.filter(p=>p.weekKey===wk).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const todaySeance = performances.find(p=>p.date===today);
  const el = document.getElementById('seance-recap');
  const btn = document.getElementById('seance-btn');
  if(!el || !btn) return;

  if(weekSeances.length){
    el.innerHTML = '<div class="recap">' + weekSeances.map(function(se){
      const vol = se.exercices.reduce((t,b)=>t+b.sets.reduce((x,s)=>x+s.poids*s.reps,0),0);
      const names = se.exercices.map(function(b){
        const e = exercices.find(x=>x.id===b.exoId); return e?e.name:'-';
      }).join(', ');
      const isToday = se.date===today;
      return '<div class="recap-row">' +
        '<span class="recap-label">' + se.date +
          (isToday ? ' <strong style="color:var(--accent-2);">- aujourd\'hui</strong>' : '') +
          '<br><small style="font-family:var(--font-mono);font-size:10.5px;opacity:.7;">' + names + '</small>' +
          (se.note ? '<br><small class="seance-note">&#128221; ' + String(se.note).replace(/</g,'&lt;') + '</small>' : '') +
        '</span>' +
        '<span style="display:flex;align-items:center;gap:12px;">' +
          '<span class="recap-value">' + vol + '<span class="unit">kg vol.</span></span>' +
          '<button class="del-btn" onclick="deleteSeance(\'' + se.id + '\')" title="Supprimer cette seance">&#10005;</button>' +
        '</span></div>';
    }).join('') + '</div>';
  } else {
    el.innerHTML = '<p class="recap-empty">Aucune seance enregistree cette semaine.</p>';
  }

  btn.textContent = todaySeance ? 'Modifier / ajouter une seance' : 'Ajouter une seance';
}

// Supprimer une seance annule l'XP et les records qu'elle avait rapportes,
// puisque tout est recalcule a partir des donnees restantes.
async function deleteSeance(id){
  const se = performances.find(p=>p.id===id);
  if(!se) return;
  const ok = await confirmer('Supprimer cette séance ?',
    "L'XP et les records qu'elle a rapportés seront annulés.\n\nCette action est définitive.", 'Supprimer');
  if(!ok) return;
  performances = performances.filter(p=>p.id!==id);
  await save('performances', performances);
  renderSeanceRecap(); renderPerfHistory(); renderPerfWeekSelect();
  renderPerfChart(); renderHome();
  showToast('Seance supprimee');
}

// ============================================================
//  MODALES GENERIQUES
// ============================================================
// Remplacent alert() et confirm(), qui affichaient des boites
// systeme grises en rupture avec le reste du site.
let dialogResolve = null;

function fermerDialog(valeur){
  document.getElementById('dialog-modal').style.display = 'none';
  if(dialogResolve){ dialogResolve(valeur); dialogResolve = null; }
}

function afficherInfo(titre, texte){
  document.getElementById('dialog-titre').textContent = titre;
  document.getElementById('dialog-texte').textContent = texte;
  document.getElementById('dialog-actions').innerHTML =
    '<button class="primary" onclick="fermerDialog(true)">Fermer</button>';
  document.getElementById('dialog-modal').style.display = 'flex';
  return new Promise(function(res){ dialogResolve = res; });
}

function confirmer(titre, texte, labelOk){
  document.getElementById('dialog-titre').textContent = titre;
  document.getElementById('dialog-texte').textContent = texte;
  document.getElementById('dialog-actions').innerHTML =
    '<button class="small" onclick="fermerDialog(false)">Annuler</button>' +
    '<button class="primary" onclick="fermerDialog(true)">' + (labelOk || 'Confirmer') + '</button>';
  document.getElementById('dialog-modal').style.display = 'flex';
  return new Promise(function(res){ dialogResolve = res; });
}

// ============================================================
//  ETAT DE LA CONNEXION
// ============================================================
// En salle, le reseau passe mal. Mieux vaut prevenir clairement
// que laisser croire qu'une donnee a ete enregistree.
function majConnexion(){
  const horsLigne = !navigator.onLine;
  document.getElementById('offline-banner')?.classList.toggle('visible', horsLigne);
  document.body.classList.toggle('offline', horsLigne);
}
window.addEventListener('online',  function(){ majConnexion(); showToast('Connexion retablie'); });
window.addEventListener('offline', majConnexion);
majConnexion();

// ---- Aide contextuelle ----
function toggleHelp(id){
  document.getElementById(id)?.classList.toggle('open');
}

// ============================================================
//  PARTAGE DE PROFIL
// ============================================================
function profileURL(){
  // Adresse lisible plutot qu'un identifiant technique.
  // Le prefixe #/ evite d'avoir a configurer le serveur.
  return window.location.origin + window.location.pathname +
         '#/u/' + encodeURIComponent(pseudo || '');
}

function openShareProfile(){
  document.getElementById('share-profile-modal').style.display = 'flex';
  drawProfileCard();
}
function closeShareProfile(){
  document.getElementById('share-profile-modal').style.display = 'none';
}

async function copyProfileLink(){
  try{
    await navigator.clipboard.writeText(profileURL());
    showToast('Lien copie OK');
  }catch(e){ showToast('Copie impossible'); }
}

function drawProfileCard(){
  const W = 900, H = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stats = computeHomeStats();
  const info = computeLevelInfo(computeTotalXP());

  ctx.fillStyle = '#0E0F11'; ctx.fillRect(0,0,W,H);
  let g = ctx.createRadialGradient(W*0.15,0,40,W*0.15,0,700);
  g.addColorStop(0,'rgba(255,75,43,0.34)'); g.addColorStop(1,'rgba(255,75,43,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  g = ctx.createRadialGradient(W*0.9,H*0.28,40,W*0.9,H*0.28,600);
  g.addColorStop(0,'rgba(76,201,240,0.16)'); g.addColorStop(1,'rgba(76,201,240,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.fillStyle = '#F4F3EE';
  ctx.font = '400 46px "Bebas Neue", sans-serif';
  ctx.fillText('FONTE', 70, 100);
  ctx.fillStyle = '#FF4B2B';
  ctx.fillText('.', 70 + ctx.measureText('FONTE').width, 100);

  ctx.font = '54px sans-serif';
  ctx.fillText(avatar, 70, 250);
  ctx.fillStyle = '#F4F3EE';
  ctx.font = '400 92px "Bebas Neue", sans-serif';
  ctx.fillText((pseudo || 'Anonyme').toUpperCase(), 70, 350);

  ctx.fillStyle = '#4CC9F0';
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.fillText('NIVEAU ' + info.level + ' - ' + rankName(info.level).toUpperCase(), 70, 400);

  const cells = [
    [stats.weeks,  'SEMAINES SUIVIES'],
    [stats.exos,   'EXERCICES SUIVIS'],
    [stats.volume, 'KG CETTE SEMAINE'],
    [stats.streak, "SEMAINES D'AFFILEE"]
  ];
  cells.forEach(function(c,i){
    const x = 70 + (i%2)*420, y = 500 + Math.floor(i/2)*130;
    ctx.fillStyle = '#FF4B2B';
    ctx.font = '400 64px "Bebas Neue", sans-serif';
    ctx.fillText(String(c[0]), x, y);
    ctx.fillStyle = '#8D9096';
    ctx.font = '400 19px "IBM Plex Mono", monospace';
    ctx.fillText(c[1], x, y+30);
  });

  const recs = exercices.map(function(e){
    const entries = getExoEntries(e.id);
    if(!entries.length) return null;
    let mx = 0;
    entries.forEach(function(en){ en.sets.forEach(function(st){ if(st.poids>mx) mx=st.poids; }); });
    return {name:e.name, poids:mx};
  }).filter(Boolean).sort(function(a,b){return b.poids-a.poids;}).slice(0,4);

  let y = 830;
  if(recs.length){
    ctx.fillStyle = '#8D9096';
    ctx.font = '400 19px "IBM Plex Mono", monospace';
    ctx.fillText('RECORDS PERSONNELS', 70, y);
    y += 46;
    recs.forEach(function(r){
      ctx.fillStyle = '#F4F3EE';
      ctx.font = '600 26px Inter, sans-serif';
      ctx.fillText(r.name.slice(0,26), 70, y);
      ctx.fillStyle = '#4CC9F0';
      ctx.font = '400 40px "Bebas Neue", sans-serif';
      const t = r.poids + ' KG';
      ctx.fillText(t, W - 290 - ctx.measureText(t).width, y+4);
      y += 52;
    });
  }

  function showCard(cv){
    const holder = document.getElementById('share-card-holder');
    holder.innerHTML = '';
    holder.appendChild(cv);
    window.__profileCard = cv;
  }

  try{
    const qr = new QRious({value: profileURL(), size: 190, background:'#F4F3EE', foreground:'#0E0F11', level:'M'});
    const img = new Image();
    img.onload = function(){
      ctx.fillStyle = '#F4F3EE';
      ctx.fillRect(W-260, H-260, 190, 190);
      ctx.drawImage(img, W-260, H-260, 190, 190);
      ctx.fillStyle = '#8D9096';
      ctx.font = '400 18px "IBM Plex Mono", monospace';
      ctx.fillText('SCANNE POUR VOIR MON PROFIL', 70, H-190);
      ctx.fillText('Un compte FONTE est requis.', 70, H-155);
      showCard(canvas);
    };
    img.src = qr.toDataURL();
  }catch(e){
    console.error('QR indisponible', e);
    showCard(canvas);
  }
}

function downloadProfileCard(){
  const cv = window.__profileCard;
  if(!cv){ showToast('Carte pas encore prete'); return; }
  cv.toBlob(function(blob){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fonte-' + (pseudo||'profil').toLowerCase().replace(/\s+/g,'-') + '.jpg';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    showToast('Carte telechargee OK');
  }, 'image/jpeg', 0.92);
}

// ============================================================
//  PAGE DE PROFIL
// ============================================================
let vueAvantProfil = 'accueil';
let profilCourant = null;

function dateCourte(iso){
  if(!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'});
}
function anciennete(iso){
  if(!iso) return '';
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if(jours < 1)  return "depuis aujourd'hui";
  if(jours < 7)  return 'depuis ' + jours + ' jour' + (jours>1?'s':'');
  if(jours < 31){ const sem = Math.floor(jours/7); return 'depuis ' + sem + ' semaine' + (sem>1?'s':''); }
  const mois = Math.floor(jours/30);
  if(mois < 12) return 'depuis ' + mois + ' mois';
  const ans = Math.floor(mois/12);
  return 'depuis ' + ans + ' an' + (ans>1?'s':'');
}

function ouvrirVueProfil(){
  const actif = document.querySelector('nav.tabs button.active');
  if(actif) vueAvantProfil = actif.dataset.view;
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('nav-avatar')?.classList.remove('active');
  document.getElementById('view-profil').classList.add('active');
  positionNavSlider();
  window.scrollTo({top:0, behavior:'smooth'});
}

function quitterProfil(){
  nettoyerAdresseProfil();
  const btn = document.querySelector('nav.tabs button[data-view="' + vueAvantProfil + '"]')
           || document.querySelector('nav.tabs button[data-view="accueil"]');
  btn.click();
}

async function openProfile(cle, parPseudo){
  ouvrirVueProfil();
  const el = document.getElementById('profil-content');
  el.innerHTML = '<div class="card"><p class="recap-empty">Chargement du profil...</p></div>';

  try{
    const res = parPseudo
      ? await db.rpc('get_profile_par_pseudo', {p: cle})
      : await db.rpc('get_profile', {target: cle});
    if(res.error) throw res.error;
    const d = res.data;
    if(!d){
      el.innerHTML = '<div class="card"><p class="recap-empty">Ce profil n\'existe pas ou n\'est plus disponible.</p></div>';
      return;
    }
    profilCourant = d.id;
    if(d.pseudo) history.replaceState(null, '', window.location.pathname + '#/u/' + encodeURIComponent(d.pseudo));

    const streak = d.streak || 0;
    let html = '<div class="card profil-hero">' +
      '<div class="profil-avatar-xl">' + (d.avatar || '&#128170;') + '</div>' +
      '<div class="profil-ident">' +
        '<h1 class="profil-nom">' + String(d.pseudo||'Anonyme').replace(/</g,'&lt;') + '</h1>' +
        '<div class="profil-tags">' +
          (streak>0
            ? '<span class="profil-tag actif">&#128293; ' + streak + ' semaine' + (streak>1?'s':'') + " d'affilee</span>"
            : '<span class="profil-tag">Aucune serie en cours</span>') +
          (d.relation==='ami' && d.ami_depuis
            ? '<span class="profil-tag ami">&#129309; Amis ' + anciennete(d.ami_depuis) + '</span>' : '') +
        '</div>' +
        (d.relation==='ami' && d.ami_depuis
          ? '<div class="profil-depuis">Ami depuis le ' + dateCourte(d.ami_depuis) + '</div>' : '') +
      '</div>' +
      '<div class="profil-action">' + boutonRelation(d) + '</div>' +
    '</div>';

    if(d.detail){
      html += '<div class="card"><h2>Statistiques</h2><div class="pub-stats">' +
        '<div><span class="pub-stat-num">' + d.semaines + '</span><span class="pub-stat-lab">Semaines suivies</span></div>' +
        '<div><span class="pub-stat-num">' + d.exercices + '</span><span class="pub-stat-lab">Exercices suivis</span></div>' +
        '<div><span class="pub-stat-num">' + Math.round(d.volume) + '</span><span class="pub-stat-lab">Kg cette semaine</span></div>' +
        '<div><span class="pub-stat-num">' + streak + '</span><span class="pub-stat-lab">Semaines d\'affilee</span></div>' +
      '</div></div>';

      const seances = d.seances || [];
      if(d.partage_seances){
        html += '<div class="card"><h2>Seances de la semaine</h2>';
        html += seances.length
          ? seances.map(function(se){ return blocSeance(se, d.relation === 'ami'); }).join('')
          : '<p class="recap-empty">Aucune seance enregistree cette semaine.</p>';
        html += '</div>';
      } else if(d.relation !== 'moi'){
        html += '<div class="card"><h2>Seances de la semaine</h2>' +
          '<p class="recap-empty">Cette personne ne partage pas ses seances.</p></div>';
      }

      if(d.relation === 'ami'){
        html += '<div class="card"><h2>Encourager</h2>' +
          '<p class="block-intro">Un signe pour lui dire que tu suis sa progression. Un par ami et par semaine.</p>' +
          pickerEncouragement(d.id) + '</div>';
      }

      const recs = d.records || [];
      html += '<div class="card"><h2>Records personnels</h2>' +
        (recs.length
          ? '<div class="recap">' + recs.map(function(r){
              return '<div class="recap-row"><span class="recap-label">' +
                String(r.exercice).replace(/</g,'&lt;') +
                '</span><span class="recap-value">' + r.poids + '<span class="unit">kg</span></span></div>';
            }).join('') + '</div>'
          : '<p class="recap-empty">Aucun record enregistre pour l\'instant.</p>') + '</div>';
    } else {
      html += '<div class="card"><h2>Profil prive</h2>' +
        '<p class="block-intro">Deviens ami avec cette personne pour voir ses statistiques, ses records ' +
        'et, si elle le partage, ses seances de la semaine.</p>' +
        '<p class="recap-empty">Ses mensurations et son suivi hebdomadaire resteront prives dans tous les cas.</p></div>';
    }

    el.innerHTML = html;
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="card"><p class="recap-empty">Impossible de charger ce profil.</p></div>';
  }
}

// Une seance affichee sur le profil d'un ami, avec sa note
// et les reactions. On ne peut que reagir, jamais commenter.
const REACTIONS = ['\u{1F4AA}','\u{1F525}','\u{1F44F}','\u{1F680}','\u{1F62E}'];

function blocSeance(se, peutReagir){
  const compte = se.reactions || {};
  const totaux = Object.keys(compte).map(function(sg){
    return '<span class="reac-compte">' + sg + ' ' + compte[sg] + '</span>';
  }).join('');

  let boutons = '';
  if(peutReagir){
    boutons = REACTIONS.map(function(sg){
      return '<button class="reac-btn' + (se.ma_reaction===sg?' choisi':'') + '" ' +
        'onclick="reagirSeance(\'' + se.id + '\',\'' + sg + '\')" title="Reagir">' + sg + '</button>';
    }).join('');
    if(se.ma_reaction){
      boutons += '<button class="reac-btn" onclick="retirerReaction(\'' + se.id + '\')" title="Retirer ma reaction">\u2715</button>';
    }
  }

  // Detail serie par serie, replie par defaut pour ne pas noyer la page
  const blocs = se.blocs || [];
  const detailId = 'det-' + se.id;
  const detail = blocs.length
    ? '<div class="seance-detail" id="' + detailId + '" style="display:none;">' +
        blocs.map(function(b){
          const chips = (b.series||[]).map(function(x){
            return '<span class="set-chip">' + x.poids + 'kg\u00D7' + x.reps + '</span>';
          }).join('');
          return '<div class="seance-exo">' +
            '<span><span class="seance-exo-nom">' + String(b.nom).replace(/</g,'&lt;') + '</span>' +
            '<span class="seance-exo-series">' + chips + '</span></span>' +
            '<span class="seance-exo-vol">' + Math.round(b.volume) + ' kg</span>' +
          '</div>';
        }).join('') +
      '</div>'
    : '';

  const resume = blocs.length
    ? blocs.map(function(b){ return b.nom; }).join(', ')
    : (se.exercices || []).join(', ');

  return '<div class="seance-bloc">' +
    '<div class="seance-entete">' +
      '<span class="recap-label">' + se.date +
        '<br><small style="font-family:var(--font-mono);font-size:10.5px;opacity:.7;">' +
        String(resume).replace(/</g,'&lt;') + '</small></span>' +
      '<span class="recap-value">' + Math.round(se.volume) + '<span class="unit">kg vol.</span></span>' +
    '</div>' +
    (se.note ? '<div class="seance-note">\u{1F4DD} ' + String(se.note).replace(/</g,'&lt;') + '</div>' : '') +
    (blocs.length
      ? '<button class="seance-toggle" onclick="basculerDetail(\'' + detailId + '\', this)">Voir le detail des series</button>'
      : '') +
    detail +
    ((totaux || boutons) ? '<div class="reac-row">' + totaux + boutons + '</div>' : '') +
  '</div>';
}

function basculerDetail(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  const ouvert = el.style.display !== 'none';
  el.style.display = ouvert ? 'none' : 'block';
  btn.textContent = ouvert ? 'Voir le detail des series' : 'Masquer le detail';
}

async function reagirSeance(seanceId, signe){
  try{
    const res = await db.rpc('reagir_seance', {seance: seanceId, signe: signe});
    if(res.error) throw res.error;
    showToast('Reaction envoyee ' + signe);
    if(profilCourant) openProfile(profilCourant);
  }catch(e){ showToast(e.message || 'Reaction impossible'); }
}

async function retirerReaction(seanceId){
  try{
    const res = await db.rpc('retirer_reaction', {seance: seanceId});
    if(res.error) throw res.error;
    showToast('Reaction retiree');
    if(profilCourant) openProfile(profilCourant);
  }catch(e){ showToast(e.message || 'Action impossible'); }
}

function boutonRelation(d){
  if(d.relation === 'inconnu')
    return '<button class="primary" onclick="demanderAmiDepuisProfil(\'' + d.id + '\')">Ajouter en ami</button>';
  if(d.relation === 'demande_envoyee')
    return '<button class="ghost" onclick="retirerAmiDepuisProfil(\'' + d.id + '\')">Annuler la demande</button>';
  if(d.relation === 'demande_recue')
    return '<button class="primary" onclick="accepterAmiDepuisProfil(\'' + d.id + '\')">Accepter sa demande</button>';
  if(d.relation === 'ami')
    return '<button class="ghost" onclick="retirerAmiDepuisProfil(\'' + d.id + '\')">Retirer des amis</button>';
  return '';
}

async function demanderAmiDepuisProfil(id){ await demanderAmi(id); openProfile(id); }
async function accepterAmiDepuisProfil(id){ await accepterAmi(id); openProfile(id); }
async function retirerAmiDepuisProfil(id){ await retirerAmi(id); openProfile(id); }

function checkProfileLink(){
  const h = window.location.hash;
  const parPseudo = h.match(/^#\/u\/(.+)$/);
  if(parPseudo){ openProfile(decodeURIComponent(parPseudo[1]), true); return; }
  const parId = h.match(/^#u=([0-9a-f-]{36})$/i);
  if(parId && parId[1] !== currentUser.id) openProfile(parId[1]);
}

// ============================================================
//  ENCOURAGEMENTS
// ============================================================
// Pas de texte libre : un signe parmi quatre. Le geste social
// existe, sans les risques d'une messagerie (harcelement,
// moderation, blocage) qu'on ne pourrait pas assumer.
const SIGNES = ['\u{1F4AA}','\u{1F525}','\u{1F44F}','\u{1F680}'];
let encData = {recus:[], envoyes:{}};

let activiteVue = 0;

function cleActiviteVue(){ return 'fonte-activite-vue:' + (currentUser ? currentUser.id : ''); }

// Reactions et encouragements sont regroupes : deux listes
// separees allongeaient l'accueil sans rien apporter de plus.
async function chargerActivite(){
  const el = document.getElementById('activite-sociale');
  if(!el) return;
  let reactions = [];
  try{
    const rr = await db.rpc('mes_reactions');
    const re = await db.rpc('mes_encouragements');
    if(rr.error) throw rr.error;
    if(re.error) throw re.error;
    reactions = rr.data || [];
    encData = re.data || {recus:[], envoyes:{}};
  }catch(e){
    console.error('Activite indisponible', e);
    el.style.display = 'none'; return;
  }

  const items = reactions.map(function(r){
      return {date:r.date, signe:r.signe, pseudo:r.pseudo,
              texte:'a reagi a ta seance du ' + r.seance_date};
    }).concat((encData.recus||[]).map(function(e){
      return {date:e.date, signe:e.signe, pseudo:e.pseudo, texte:"t'encourage cette semaine"};
    })).sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });

  if(!items.length){ el.style.display = 'none'; majPastilleActivite(0); return; }

  try{ activiteVue = parseInt(localStorage.getItem(cleActiviteVue()) || '0', 10); }catch(e){ activiteVue = 0; }
  const nouveaux = items.filter(function(i){ return new Date(i.date).getTime() > activiteVue; }).length;
  majPastilleActivite(nouveaux);

  el.style.display = 'block';
  el.innerHTML = '<h2>Activite' +
      (nouveaux ? ' <span class="tab-badge">' + nouveaux + '</span>' : '') + '</h2>' +
    '<div class="enc-list">' + items.map(function(i){
      const neuf = new Date(i.date).getTime() > activiteVue;
      return '<div class="enc-row' + (neuf ? ' neuf' : '') + '">' +
        '<span class="enc-signe">' + i.signe + '</span>' +
        '<span class="enc-texte"><strong>' + String(i.pseudo).replace(/</g,'&lt;') +
        '</strong> ' + i.texte + '.</span></div>';
    }).join('') + '</div>' +
    (nouveaux ? '<button class="small" style="margin-top:14px;" onclick="marquerActiviteLue()">Marquer comme lu</button>' : '');
}

function majPastilleActivite(n){
  ['tab-badge-accueil','burger-badge-accueil'].forEach(function(id){
    const b = document.getElementById(id);
    if(!b) return;
    b.textContent = n;
    b.style.display = n ? 'inline-flex' : 'none';
  });
}

function marquerActiviteLue(){
  activiteVue = Date.now();
  try{ localStorage.setItem(cleActiviteVue(), String(activiteVue)); }catch(e){}
  chargerActivite();
}

async function encourager(id, signe){
  try{
    const res = await db.rpc('encourager', {target: id, signe: signe});
    if(res.error) throw res.error;
    encData.envoyes[id] = signe;
    showToast('Encouragement envoye ' + signe);
    majPickerEnc(id);
  }catch(e){ showToast(e.message || 'Envoi impossible'); }
}

function majPickerEnc(id){
  const envoye = (encData.envoyes || {})[id];
  document.querySelectorAll('.enc-btn[data-cible="' + id + '"]').forEach(function(b){
    b.classList.toggle('choisi', b.dataset.signe === envoye);
  });
  const info = document.getElementById('enc-envoye-' + id);
  if(info) info.textContent = envoye ? 'Tu l\'as encourage cette semaine ' + envoye : '';
}

function pickerEncouragement(id){
  const envoye = (encData.envoyes || {})[id];
  return '<div class="enc-picker">' + SIGNES.map(function(sg){
    return '<button class="enc-btn' + (sg===envoye?' choisi':'') + '" data-cible="' + id +
      '" data-signe="' + sg + '" onclick="encourager(\'' + id + '\',\'' + sg + '\')">' + sg + '</button>';
  }).join('') + '</div>' +
  '<div class="enc-envoye" id="enc-envoye-' + id + '">' +
    (envoye ? 'Tu l\'as encourage cette semaine ' + envoye : '') + '</div>';
}

// ============================================================
//  AMIS
// ============================================================
let amisData = {amis:[], attente:[], envoyes:[], actifs_semaine:0};

async function chargerAmis(){
  try{
    const res = await db.rpc('mes_amis');
    if(res.error) throw res.error;
    amisData = res.data || {amis:[], attente:[], envoyes:[], actifs_semaine:0};
  }catch(e){
    console.error('Chargement des amis impossible', e);
    return;
  }
  renderAmis();
  renderAmisBadge();
  chargerFil();
  chargerActivite();
}

function renderAmisBadge(){
  const n = (amisData.attente||[]).length;
  ['tab-badge-amis','burger-badge-amis'].forEach(function(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = n;
    el.style.display = n ? 'inline-flex' : 'none';
  });
}

function personRow(p, actions, meta){
  return '<div class="person-row">' +
    '<div class="person-avatar" onclick="openProfile(\'' + p.id + '\')">' + (p.avatar||'&#128170;') + '</div>' +
    '<div class="person-info">' +
      '<div class="person-name" onclick="openProfile(\'' + p.id + '\')">' +
        String(p.pseudo||'').replace(/</g,'&lt;') + '</div>' +
      (meta ? '<div class="person-meta">' + meta + '</div>' : '') +
    '</div>' +
    '<div class="person-actions">' + actions + '</div>' +
  '</div>';
}

function renderAmis(){
  // Demandes recues
  const reqCard = document.getElementById('amis-requests-card');
  const reqEl = document.getElementById('amis-requests');
  if((amisData.attente||[]).length){
    reqCard.style.display = 'block';
    reqEl.innerHTML = amisData.attente.map(function(p){
      return personRow(p,
        '<button class="accent" onclick="accepterAmi(\'' + p.id + '\')">Accepter</button>' +
        '<button onclick="retirerAmi(\'' + p.id + '\')">Refuser</button>',
        'Souhaite devenir ton ami');
    }).join('');
  } else {
    reqCard.style.display = 'none';
  }

  // Liste d'amis
  const listEl = document.getElementById('amis-list');
  if((amisData.amis||[]).length){
    listEl.innerHTML = amisData.amis.map(function(p){
      const streak = p.streak || 0;
      const meta = (p.actif_semaine
          ? '<span class="actif">&#9679; entraine cette semaine</span>'
          : 'pas encore actif cette semaine') +
        (streak > 0 ? ' &middot; ' + streak + ' semaine' + (streak>1?'s':'') + " d'affilee" : '') +
        (p.ami_depuis ? ' &middot; ami ' + anciennete(p.ami_depuis) : '');
      return personRow(p,
        '<button onclick="openProfile(\'' + p.id + '\')">Voir</button>' +
        '<button onclick="retirerAmi(\'' + p.id + '\')">Retirer</button>',
        meta);
    }).join('');
  } else {
    listEl.innerHTML = '<p class="recap-empty">Aucun ami pour l\'instant. Cherche quelqu\'un par son pseudo ci-dessus, ou partage ta carte de profil.</p>';
  }

  // Demandes envoyees
  const sentCard = document.getElementById('amis-sent-card');
  const sentEl = document.getElementById('amis-sent');
  if((amisData.envoyes||[]).length){
    sentCard.style.display = 'block';
    sentEl.innerHTML = amisData.envoyes.map(function(p){
      return personRow(p,
        '<button onclick="retirerAmi(\'' + p.id + '\')">Annuler</button>',
        'En attente de reponse');
    }).join('');
  } else {
    sentCard.style.display = 'none';
  }
}

// ============================================================
//  FIL D'ACTUALITE DES AMIS
// ============================================================
// Remplace le decompte anonyme : on voit ce que les amis ont
// fait, avec la possibilite de reagir sans quitter l'accueil.
async function chargerFil(){
  const el = document.getElementById('fil-amis');
  if(!el) return;
  const tous = amisData.amis || [];
  if(tous.length === 0){ el.style.display = 'none'; return; }

  let fil = [];
  try{
    const res = await db.rpc('fil_amis');
    if(res.error) throw res.error;
    fil = res.data || [];
  }catch(e){ console.error('Fil indisponible', e); }

  const actifs = tous.filter(function(a){ return a.actif_semaine; });
  const inactifs = tous.filter(function(a){ return !a.actif_semaine; });
  el.style.display = 'block';

  let html = '<h2>Tes amis cette semaine</h2><p class="block-intro">' +
    (actifs.length === 0
      ? "Personne n'a encore bouge cette semaine. A toi d'ouvrir le bal."
      : (actifs.length === tous.length
          ? '<strong>Tout le monde</strong> s\'est entraine cette semaine.'
          : '<strong>' + actifs.length + ' sur ' + tous.length + '</strong> se ' +
            (actifs.length > 1 ? 'sont entraines' : 'est entraine') + ' cette semaine.')) +
    '</p>';

  if(fil.length){
    html += fil.map(function(f){
      const noms = (f.exercices||[]).join(', ');
      const compte = f.reactions || {};
      const totaux = Object.keys(compte).map(function(sg){
        return '<span class="reac-compte">' + sg + ' ' + compte[sg] + '</span>';
      }).join('');
      const boutons = REACTIONS.map(function(sg){
        return '<button class="reac-btn' + (f.ma_reaction===sg?' choisi':'') +
          '" onclick="reagirDepuisFil(\'' + f.seance_id + '\',\'' + sg + '\')" title="Reagir">' + sg + '</button>';
      }).join('');
      return '<div class="fil-item">' +
        '<button class="fil-auteur" onclick="openProfile(\'' + f.auteur_id + '\')">' +
          '<span class="fil-avatar">' + (f.avatar || '&#128170;') + '</span>' +
          '<span class="fil-nom">' + String(f.pseudo).replace(/</g,'&lt;') + '</span></button>' +
        '<div class="fil-corps"><div class="seance-entete">' +
            '<span class="recap-label">' + f.date +
              '<br><small style="font-family:var(--font-mono);font-size:10.5px;opacity:.7;">' +
              String(noms).replace(/</g,'&lt;') + '</small></span>' +
            '<span class="recap-value">' + Math.round(f.volume) + '<span class="unit">kg vol.</span></span>' +
          '</div>' +
          (f.note ? '<div class="seance-note">&#128221; ' + String(f.note).replace(/</g,'&lt;') + '</div>' : '') +
          '<div class="reac-row">' + totaux + boutons + '</div>' +
        '</div></div>';
    }).join('');
  } else if(actifs.length){
    html += '<p class="recap-empty">Tes amis actifs ne partagent pas le detail de leurs seances.</p>' +
      '<div class="ami-grid">' + actifs.map(function(a){
        return '<button class="ami-carte" onclick="openProfile(\'' + a.id + '\')">' +
          '<span class="ami-carte-avatar">' + (a.avatar || '&#128170;') + '</span>' +
          '<span class="ami-carte-nom">' + String(a.pseudo).replace(/</g,'&lt;') + '</span></button>';
      }).join('') + '</div>';
  }

  if(inactifs.length){
    html += '<div class="ami-inactifs">Pas encore actifs : ' +
      inactifs.map(function(a){
        return '<button class="ami-lien" onclick="openProfile(\'' + a.id + '\')">' +
          String(a.pseudo).replace(/</g,'&lt;') + '</button>';
      }).join(', ') + '</div>';
  }
  el.innerHTML = html;
}

async function reagirDepuisFil(seanceId, signe){
  try{
    const res = await db.rpc('reagir_seance', {seance: seanceId, signe: signe});
    if(res.error) throw res.error;
    showToast('Reaction envoyee ' + signe);
    chargerFil();
  }catch(e){ showToast(e.message || 'Reaction impossible'); }
}

// ---- Recherche ----
async function chercherAmis(){
  const q = document.getElementById('amis-search').value.trim();
  const el = document.getElementById('amis-search-results');
  if(q.length < 2){ el.innerHTML = '<p class="recap-empty">Saisis au moins 2 caracteres.</p>'; return; }
  el.innerHTML = '<p class="recap-empty">Recherche en cours...</p>';
  try{
    const res = await db.rpc('chercher_utilisateurs', {q: q});
    if(res.error) throw res.error;
    const list = res.data || [];
    if(!list.length){
      el.innerHTML = '<p class="recap-empty">Aucun compte ne correspond a ce pseudo.</p>';
      return;
    }
    el.innerHTML = list.map(function(p){
      let actions;
      if(p.relation === 'ami') actions = '<span class="etat">Deja ami</span>';
      else if(p.relation === 'demande_envoyee') actions = '<span class="etat">Demande envoyee</span>';
      else if(p.relation === 'demande_recue')
        actions = '<button class="accent" onclick="accepterAmi(\'' + p.id + '\')">Accepter</button>';
      else actions = '<button class="accent" onclick="demanderAmi(\'' + p.id + '\')">Ajouter</button>';
      return personRow(p, actions, null);
    }).join('');
  }catch(e){
    console.error(e);
    el.innerHTML = '<p class="recap-empty">Recherche impossible pour le moment.</p>';
  }
}

// ---- Actions ----
async function demanderAmi(id){
  try{
    const res = await db.rpc('demander_ami', {target: id});
    if(res.error) throw res.error;
    showToast(res.data && res.data.relation === 'ami' ? 'Vous etes desormais amis' : 'Demande envoyee');
    await chargerAmis();
    chercherAmis();
  }catch(e){ showToast(e.message || 'Action impossible'); }
}

async function accepterAmi(id){
  try{
    const res = await db.rpc('accepter_ami', {demandeur: id});
    if(res.error) throw res.error;
    showToast('Demande acceptee');
    await chargerAmis();
  }catch(e){ showToast(e.message || 'Action impossible'); }
}

async function retirerAmi(id){
  try{
    const res = await db.rpc('retirer_ami', {autre: id});
    if(res.error) throw res.error;
    showToast('Relation supprimee');
    await chargerAmis();
    const sr = document.getElementById('amis-search-results');
    if(sr && sr.innerHTML.trim()) chercherAmis();
  }catch(e){ showToast(e.message || 'Action impossible'); }
}

function openDeleteAccountModal(){
  document.getElementById('delete-account-confirm').value = '';
  document.getElementById('delete-account-btn').disabled = true;
  document.getElementById('delete-account-modal').style.display = 'flex';
}
function closeDeleteAccountModal(){
  document.getElementById('delete-account-modal').style.display = 'none';
}
function checkDeleteAccountInput(){
  const val = document.getElementById('delete-account-confirm').value.trim().toUpperCase();
  document.getElementById('delete-account-btn').disabled = (val !== 'SUPPRIMER');
}

async function confirmDeleteAccount(){
  const btn = document.getElementById('delete-account-btn');
  btn.disabled = true;
  btn.textContent = 'Suppression…';

  try{
    // Les photos ne partent pas en cascade : on les efface d'abord,
    // sinon elles resteraient orphelines dans le stockage.
    const {data: files} = await db.storage.from('photos').list(currentUser.id);
    if(files && files.length){
      await db.storage.from('photos').remove(files.map(f=>`${currentUser.id}/${f.name}`));
    }

    // Puis le compte lui-même ; la cascade emporte toutes les données
    const {error} = await db.rpc('delete_own_account');
    if(error) throw error;

    await db.auth.signOut();
    showToast('Compte supprime');
    // On recharge sur l'ecran de connexion, sans le fragment d'URL
    window.location.replace(window.location.pathname);

  }catch(e){
    console.error('Suppression du compte impossible', e);
    btn.disabled = false;
    btn.textContent = 'Supprimer mon compte';
    showToast('⚠️ La suppression a échoué — réessaie');
  }
}

async function setPartageSeances(actif){
  try{
    const res = await db.rpc('set_partage_seances', {actif: actif});
    if(res.error) throw res.error;
    partageSeances = actif;
    renderPartageBtns();
    showToast(actif ? 'Tes seances sont visibles par tes amis' : 'Tes seances sont privees');
  }catch(e){ showToast(e.message || 'Enregistrement impossible'); }
}

function renderPartageBtns(){
  document.querySelectorAll('.theme-btn[data-partage]').forEach(function(b){
    b.classList.toggle('active', (b.dataset.partage === 'oui') === partageSeances);
  });
}

async function changePassword(){
  const input = document.getElementById('settings-password');
  const pwd = input.value;
  if(pwd.length < 8){ showToast('Le mot de passe doit faire au moins 8 caractères'); return; }
  try{
    const {error} = await db.auth.updateUser({password: pwd});
    if(error) throw error;
    input.value = '';
    showToast('Mot de passe modifié ✓');
  }catch(e){
    showToast('⚠️ ' + translateAuthError(e.message));
  }
}


// ============================================================
//  SAUVEGARDE
// ============================================================
// La signature save(clé, valeur) est conservée pour que les ~40
// appels existants dans le code restent inchangés. Chaque clé est
// routée vers la table correspondante. On synchronise la collection
// entière (suppression des lignes disparues + insertion/mise à jour) :
// c'est un peu plus de trafic qu'une écriture ciblée, mais toujours
// cohérent, et sans risque de divergence entre l'écran et la base.

async function save(key, value){
  if(!currentUser){ showToast('⚠️ Session expirée — reconnecte-toi'); return false; }
  try{
    switch(key){
      case 'pseudo':            await syncPseudo(); break;
      case 'exercices':         await syncExercices(); break;
      case 'mensurations':      await syncMensurations(); break;
      case 'performances':      await syncPerformances(); break;
      case 'suivi':             await syncSuivi(); break;
      case 'objectifs':         await syncObjectifs(); break;
      case 'reminderSettings':
      case 'reminderDismissed': await syncReminder(); break;
      default: console.warn('Clé de sauvegarde inconnue :', key);
    }
    checkXPGain();
    return true;
  }catch(e){
    console.error('Erreur de sauvegarde', key, e);
    showToast('⚠️ Sauvegarde impossible — vérifie ta connexion');
    return false;
  }
}

const uid = () => currentUser.id;
function check({error}){ if(error) throw error; }

// ============================================================
//  SYNCHRONISATION DIFFERENTIELLE
// ============================================================
// Avant, modifier un seul chiffre renvoyait toute la collection
// a la base. Correct, mais inutilement lourd : avec deux ans
// d'historique et un reseau faible en salle, ca devient lent.
// On garde une empreinte de ce qui a ete envoye, et on ne
// transmet que les lignes reellement nouvelles ou modifiees.
const empreintes = {};

async function appliquer(table, lignes){
  const avant = empreintes[table] || {};
  const apres = {};
  const aEcrire = [];
  lignes.forEach(function(l){
    const json = JSON.stringify(l);
    apres[l.id] = json;
    if(avant[l.id] !== json) aEcrire.push(l);
  });
  const aSupprimer = Object.keys(avant).filter(function(id){ return !(id in apres); });
  if(aSupprimer.length) check(await db.from(table).delete().in('id', aSupprimer));
  if(aEcrire.length)    check(await db.from(table).upsert(aEcrire));
  empreintes[table] = apres;
}

function lignesExercices(){
  return exercices.map(function(e){
    return {id:e.id, user_id:uid(), name:e.name, objectif:e.objectif == null ? null : e.objectif};
  });
}
function lignesMensurations(){
  return mensurations.map(function(m){
    return {id:m.id, user_id:uid(), date:m.date, week_key:m.weekKey,
      pec:m.pec == null ? null : m.pec, bras:m.bras == null ? null : m.bras,
      epaule:m.epaule == null ? null : m.epaule, jambe:m.jambe == null ? null : m.jambe,
      taille:m.taille == null ? null : m.taille, note:m.note == null ? null : m.note,
      photo_path: m.hasPhoto ? (uid() + '/' + m.weekKey + '.jpg') : null};
  });
}
function lignesSuivi(){
  return suivi.map(function(s){
    return {id:s.id, user_id:uid(), date:s.date, week_key:s.weekKey,
      calories:s.calories == null ? null : s.calories,
      poids:s.poids == null ? null : s.poids,
      taille:s.taille == null ? null : s.taille,
      bonus_dimanche: !!s.bonusDimanche, note:s.note == null ? null : s.note};
  });
}
function lignesSeances(){
  return performances.map(function(p){
    return {id:p.id, user_id:uid(), date:p.date, week_key:p.weekKey,
            note:p.note == null ? null : p.note};
  });
}

// Ce qui vient d'etre charge est deja synchronise : inutile de
// le renvoyer a la premiere ecriture.
function initEmpreintes(){
  const emp = function(lignes){
    const o = {};
    lignes.forEach(function(l){ o[l.id] = JSON.stringify(l); });
    return o;
  };
  empreintes.exercices    = emp(lignesExercices());
  empreintes.mensurations = emp(lignesMensurations());
  empreintes.suivi        = emp(lignesSuivi());
  empreintes.seances      = emp(lignesSeances());
  const ser = {};
  performances.forEach(function(p){ ser[p.id] = JSON.stringify(p.exercices); });
  empreintes.series = ser;
}

async function syncPseudo(){
  check(await db.from('profiles').upsert({id: uid(), pseudo, updated_at: new Date().toISOString()}));
}
async function syncExercices(){    await appliquer('exercices', lignesExercices()); }
async function syncMensurations(){ await appliquer('mensurations', lignesMensurations()); }
async function syncSuivi(){        await appliquer('suivi', lignesSuivi()); }

async function syncPerformances(){
  await appliquer('seances', lignesSeances());
  // Les series ne sont reecrites que pour les seances modifiees :
  // inutile de toucher aux semaines passees.
  const avant = empreintes.series || {};
  const apres = {};
  const aRefaire = [];
  performances.forEach(function(p){
    const json = JSON.stringify(p.exercices);
    apres[p.id] = json;
    if(avant[p.id] !== json) aRefaire.push(p);
  });
  if(aRefaire.length){
    check(await db.from('series').delete().in('seance_id', aRefaire.map(function(p){ return p.id; })));
    const rows = [];
    aRefaire.forEach(function(p){
      p.exercices.forEach(function(bloc){
        bloc.sets.forEach(function(set, i){
          rows.push({user_id:uid(), seance_id:p.id, exercice_id:bloc.exoId,
                     position:i+1, poids:set.poids, reps:set.reps});
        });
      });
    });
    if(rows.length) check(await db.from('series').insert(rows));
  }
  empreintes.series = apres;
}

async function syncObjectifs(){
  check(await db.from('objectifs').upsert({
    user_id: uid(), mensu: objectifs.mensu || {}, suivi: objectifs.suivi || {},
    updated_at: new Date().toISOString()
  }));
}

async function syncReminder(){
  check(await db.from('reminder_settings').upsert({
    user_id: uid(),
    day: jourVersNum(reminderSettings.day),
    dismissed_week: reminderDismissedWeek ?? null
  }));
}

// ---- Tabs ----
// ---- Menu burger (petits écrans) ----
function toggleBurger(){
  const menu = document.getElementById('burger-menu');
  const btn = document.getElementById('nav-burger');
  const open = menu.classList.toggle('open');
  btn.classList.toggle('open', open);
  if(open) syncBurgerActive();
}
function closeBurger(){
  document.getElementById('burger-menu').classList.remove('open');
  document.getElementById('nav-burger').classList.remove('open');
}
function syncBurgerActive(){
  const current = document.querySelector('nav.tabs button.active')?.dataset.view;
  document.querySelectorAll('.burger-item[data-burger-view]').forEach(b=>{
    b.classList.toggle('active', b.dataset.burgerView===current);
  });
}
document.querySelectorAll('.burger-item[data-burger-view]').forEach(item=>{
  item.addEventListener('click', ()=>{
    document.querySelector(`nav.tabs button[data-view="${item.dataset.burgerView}"]`)?.click();
    closeBurger();
  });
});

function positionNavSlider(){
  const slider = document.getElementById('nav-slider');
  const active = document.querySelector('nav.tabs button.active');
  if(!slider) return;
  if(!active){ slider.style.opacity = '0'; return; }
  slider.style.opacity = '';
  slider.style.left = active.offsetLeft + 'px';
  slider.style.width = active.offsetWidth + 'px';
  const nav = active.parentElement;
  if(nav.scrollWidth > nav.clientWidth){
    nav.scrollTo({left: active.offsetLeft - (nav.clientWidth - active.offsetWidth)/2, behavior:'smooth'});
  }
}
// Quitter un profil autrement que par le bouton Retour doit aussi
// nettoyer l'adresse, sinon actualiser la page rouvre le profil.
function nettoyerAdresseProfil(){
  if(/^#\/u\//.test(window.location.hash) || /^#u=/.test(window.location.hash)){
    history.replaceState(null, '', window.location.pathname);
  }
  profilCourant = null;
}

document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    nettoyerAdresseProfil();
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('nav-avatar')?.classList.remove('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
    positionNavSlider();
    if(btn.dataset.view==='accueil') renderHome();
    if(btn.dataset.view==='mensurations') renderCompareSelects();
    if(btn.dataset.view==='analyse'){ renderRecordsTab(); renderCorrelations(); }
    if(btn.dataset.view==='amis') chargerAmis();
  });
});
window.addEventListener('resize', positionNavSlider);
window.addEventListener('load', positionNavSlider);
setTimeout(positionNavSlider, 60);

// ---- Jauge d'objectif ----
function goalProgressHTML(baseline, current, goal, unit){
  if(goal==null) return '';
  let pct;
  if(goal===baseline){ pct = current>=goal?100:0; }
  else { pct = ((current-baseline)/(goal-baseline))*100; }
  pct = Math.max(0, Math.min(100, pct));
  const reached = pct>=99.5;
  const remaining = Math.abs(goal-current).toFixed(1);
  const caption = reached ? 'Objectif atteint 🎯' : `reste ${remaining} ${unit} pour l'objectif (${goal} ${unit})`;
  return `<div class="goal-progress">
    <div class="goal-bar"><div class="goal-fill ${reached?'reached':''}" style="width:${pct.toFixed(0)}%"></div></div>
    <div class="goal-caption"><span class="pct">${pct.toFixed(0)}% du parcours</span><span>${caption}</span></div>
  </div>`;
}

// ---- Rappel hebdomadaire programmé ----
async function saveReminderSettings(){
  const raw = document.getElementById('reminder-day-select').value;
  reminderSettings = {day: raw === '' ? null : raw};
  const ok = await save('reminderSettings', reminderSettings);
  if(ok) showToast(reminderSettings.day === null ? 'Rappel desactive' : 'Rappel enregistre');
}

function checkWeeklyReminder(){
  if(!reminderSettings.day) return;
  const todayName = DAY_NAMES[new Date().getDay()];
  if(todayName !== reminderSettings.day) return;
  const wk = isoWeekKey(new Date());
  if(reminderDismissedWeek === wk) return;
  const already = suivi.some(s=>s.weekKey===wk);
  if(already) return;
  document.getElementById('reminder-modal').style.display = 'flex';
}

function dismissReminder(){
  reminderDismissedWeek = isoWeekKey(new Date());
  save('reminderDismissed', {week: reminderDismissedWeek});
  document.getElementById('reminder-modal').style.display = 'none';
}

function goToSuiviFromReminder(){
  dismissReminder();
  document.querySelector('nav.tabs button[data-view="suivi"]').click();
}

// ---- Statistiques du hero + streak ----
function computeHomeStats(){
  const weekSet = new Set([...mensurations.map(m=>m.weekKey), ...performances.map(p=>p.weekKey), ...suivi.map(s=>s.weekKey)]);
  const curWk = isoWeekKey(new Date());
  const seanceNow = performances.find(p=>p.weekKey===curWk);
  let volume = 0;
  if(seanceNow){ seanceNow.exercices.forEach(b=>b.sets.forEach(s=>volume+=s.poids*s.reps)); }
  let streak = 0;
  let cursor = new Date();
  while(true){
    const k = isoWeekKey(cursor);
    if(weekSet.has(k)){ streak++; cursor.setDate(cursor.getDate()-7); } else break;
  }
  return {weeks: weekSet.size, exos: exercices.length, volume: Math.round(volume), streak};
}

function renderHero(){
  const stats = computeHomeStats();
  document.querySelectorAll('.profile-stat-num').forEach(el=>{
    animateCount(el, stats[el.dataset.key] || 0);
  });
  const badge = document.getElementById('streak-badge');
  if(stats.streak>0){
    badge.style.display = 'inline-flex';
    document.getElementById('streak-count').textContent = stats.streak;
  } else {
    badge.style.display = 'none';
  }

  const chip = document.getElementById('hero-streak-chip');
  if(chip){
    if(stats.streak>0){
      chip.style.display = 'inline-block';
      chip.textContent = `🔥 ${stats.streak} semaine${stats.streak>1?'s':''} d'affilée`;
    } else {
      chip.style.display = 'none';
    }
  }

  const weightBlock = document.getElementById('hero-weight-block');
  const weeksWithWeight = sortByWeek(suivi.filter(s=>s.poids!=null));
  if(weeksWithWeight.length>0){
    weightBlock.style.display = 'flex';
    const target = weeksWithWeight[weeksWithWeight.length-1].poids;
    const numEl = document.getElementById('hero-weight-num');
    const startTime = performance.now();
    const duration = 900;
    function step(now){
      const p = Math.min((now-startTime)/duration, 1);
      const eased = 1-Math.pow(1-p,3);
      numEl.textContent = (target*eased).toFixed(1);
      if(p<1) requestAnimationFrame(step); else numEl.textContent = target.toFixed(1);
    }
    requestAnimationFrame(step);
  } else {
    weightBlock.style.display = 'none';
  }
}

function renderReminder(){
  const container = document.getElementById('home-reminder');
  const weekSet = new Set([...mensurations.map(m=>m.weekKey), ...performances.map(p=>p.weekKey), ...suivi.map(s=>s.weekKey)]);
  if(weekSet.size===0){ container.innerHTML=''; return; }
  const curWk = isoWeekKey(new Date());
  if(weekSet.has(curWk)){ container.innerHTML=''; return; }
  const lastKey = [...weekSet].sort()[weekSet.size-1];
  container.innerHTML = `<div class="reminder-banner">⚠️ Rien d'enregistré cette semaine (${weekLabel(curWk)}). Dernière activité : ${weekLabel(lastKey)}.</div>`;
}

// ---- Résumé mensuel automatique ----
function computeMonthlySummary(){
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const inMonth = e => e.date && e.date.startsWith(monthPrefix);
  const lines = [];

  const mensuMonth = sortByWeek(mensurations.filter(inMonth));
  ['pec','bras','epaule','jambe','taille'].forEach(f=>{
    const vals = mensuMonth.filter(m=>m[f]!=null);
    if(vals.length>=2){
      const diff = +(vals[vals.length-1][f]-vals[0][f]).toFixed(1);
      if(diff!==0) lines.push([fieldLabels[f], `${diff>0?'+':''}${diff} cm`]);
    }
  });

  const suiviMonth = sortByWeek(suivi.filter(inMonth));
  [['poids','Poids','kg'],['taille','Tour de taille','cm']].forEach(([f,label,unit])=>{
    const vals = suiviMonth.filter(s=>s[f]!=null);
    if(vals.length>=2){
      const diff = +(vals[vals.length-1][f]-vals[0][f]).toFixed(1);
      if(diff!==0) lines.push([label, `${diff>0?'+':''}${diff} ${unit}`]);
    }
  });

  let bestExo=null, bestDiff=0;
  exercices.forEach(exo=>{
    const entries = getExoEntries(exo.id).filter(e=>e.date.startsWith(monthPrefix));
    if(entries.length>=2){
      const first = Math.max(...entries[0].sets.map(s=>s.poids));
      const last = Math.max(...entries[entries.length-1].sets.map(s=>s.poids));
      const diff = +(last-first).toFixed(1);
      if(diff>bestDiff){ bestDiff=diff; bestExo=exo.name; }
    }
  });
  if(bestExo) lines.push([bestExo, `+${bestDiff} kg`]);

  return lines;
}

function renderMonthlySummary(){
  const el = document.getElementById('monthly-summary');
  const lines = computeMonthlySummary();
  if(lines.length===0){ el.style.display='none'; return; }
  const monthName = new Date().toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
  el.style.display = 'block';
  el.innerHTML = `<h2>Résumé — ${monthName}</h2>${lines.map(([label,val])=>`<div class="stat-row"><span>${label}</span><span class="val">${val}</span></div>`).join('')}`;
}

// ---- Records / badges ----
function renderMilestoneTrack(containerId, value, thresholds){
  const el = document.getElementById(containerId);
  let html = '<div class="milestone-track">';
  thresholds.forEach((t,i)=>{
    const unlocked = value>=t;
    html += `<div class="milestone-node ${unlocked?'unlocked':''}">${t}</div>`;
    if(i<thresholds.length-1){
      html += `<div class="milestone-connector ${unlocked?'unlocked':''}"></div>`;
    }
  });
  html += '</div>';
  el.innerHTML = html;
}

function getAvailableYears(){
  const years = new Set();
  [...mensurations, ...performances, ...suivi].forEach(e=>years.add(parseInt(e.weekKey.split('-W')[0])));
  years.add(new Date().getFullYear());
  return [...years].sort((a,b)=>b-a);
}

function isoWeeksInYear(year){
  // Le 28 décembre appartient toujours à la dernière semaine ISO de l'année.
  const wk = isoWeekKey(new Date(year, 11, 28));
  return parseInt(wk.split('-W')[1]);
}

function computeWeekActivityLevel(wk){
  let level = 0;
  if(mensurations.some(m=>m.weekKey===wk)) level++;
  if(performances.some(p=>p.weekKey===wk)) level++;
  if(suivi.some(s=>s.weekKey===wk)) level++;
  return level;
}

function populateHeatmapYearSelect(){
  const sel = document.getElementById('heatmap-year-select');
  const years = getAvailableYears();
  const prev = sel.value;
  sel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value = years.map(String).includes(prev) ? prev : String(new Date().getFullYear());
}

function renderHeatmap(){
  const sel = document.getElementById('heatmap-year-select');
  const year = parseInt(sel.value) || new Date().getFullYear();
  const totalWeeks = isoWeeksInYear(year);
  const el = document.getElementById('heatmap-grid');
  let activeCount = 0;
  let html = '';
  for(let w=1; w<=totalWeeks; w++){
    const wk = `${year}-W${String(w).padStart(2,'0')}`;
    const level = computeWeekActivityLevel(wk);
    if(level>0) activeCount++;
    html += `<div class="heat-cell level-${level}" title="${weekLabel(wk)} — ${level}/3 catégories renseignées"></div>`;
  }
  el.innerHTML = html;
  document.getElementById('heatmap-summary').textContent = `${activeCount} / ${totalWeeks} semaines actives en ${year}`;
}

function renderRecordsTab(){
  populateHeatmapYearSelect();
  renderHeatmap();
  const stats = computeHomeStats();
  renderMilestoneTrack('track-weeks', stats.weeks, [5,10,25,50,100]);
  renderMilestoneTrack('track-streak', stats.streak, [2,4,8,12,26,52]);

  const el = document.getElementById('pr-grid');
  if(exercices.length===0){
    el.innerHTML = '<p class="empty">Ajoute des exercices et enregistre des séances pour débloquer des records.</p>';
    return;
  }
  el.innerHTML = `<div class="pr-grid">${exercices.map(exo=>{
    const entries = getExoEntries(exo.id);
    if(entries.length===0){
      return `<div class="pr-card"><div class="pr-trophy">🔒</div><div class="pr-name">${exo.name}</div><div class="pr-value" style="color:var(--ink-soft);font-size:15px;">Pas encore de séance</div></div>`;
    }
    let maxEver=0, maxWeekKey=null;
    entries.forEach(e=>{ const m=Math.max(...e.sets.map(s=>s.poids)); if(m>=maxEver){maxEver=m; maxWeekKey=e.weekKey;} });
    const lastEntry = entries[entries.length-1];
    const lastMax = Math.max(...lastEntry.sets.map(s=>s.poids));
    const fresh = lastEntry.weekKey===maxWeekKey && lastMax===maxEver;
    return `<div class="pr-card ${fresh?'fresh':''}">
      <div class="pr-trophy">${fresh?'🏆':'🥇'}</div>
      <div class="pr-name">${exo.name}</div>
      <div class="pr-value">${maxEver} <span style="font-size:14px;">kg</span></div>
      <div class="sem-info" style="margin:6px 0 0;">${weekLabel(maxWeekKey)}</div>
      ${fresh?`<div class="pr-fresh-tag">Nouveau record !</div>`:''}
    </div>`;
  }).join('')}</div>`;
}

// ---- Corrélations (calories / poids / volume) ----
function computeWeeklyVolumeMap(){
  const map = {};
  performances.forEach(se=>{
    let vol = 0;
    se.exercices.forEach(b=>b.sets.forEach(s=>vol+=s.poids*s.reps));
    map[se.weekKey] = (map[se.weekKey]||0) + vol;
  });
  return map;
}

function buildCorrelationRows(){
  const volMap = computeWeeklyVolumeMap();
  const weeksAll = [...new Set([...suivi.map(s=>s.weekKey), ...Object.keys(volMap)])].sort();
  return weeksAll.map(wk=>{
    const s = suivi.find(x=>x.weekKey===wk);
    return {
      weekKey: wk, label: weekShort(wk),
      poids: s ? s.poids : null,
      calories: s ? s.calories : null,
      volume: volMap[wk] ?? null,
    };
  });
}

function drawDualChart(holderId, rows, fieldA, fieldB, labelA, labelB){
  const holder = document.getElementById(holderId);
  const ptsA = rows.filter(r=>r[fieldA]!=null);
  const ptsB = rows.filter(r=>r[fieldB]!=null);
  if(ptsA.length<2 || ptsB.length<2){
    holder.innerHTML = `<p class="empty">Pas encore assez de données pour comparer ${labelA} et ${labelB}.</p>`;
    return;
  }
  const w=800,h=190,padL=10,padR=10,padT=14,padB=26;
  const n = rows.length;
  const stepX = (w-padL-padR)/((n-1)||1);
  const xFor = i => padL + i*stepX;

  function normalize(field){
    const vals = rows.map(r=>r[field]).filter(v=>v!=null);
    const min=Math.min(...vals), max=Math.max(...vals);
    const range = (max-min) || 1;
    return rows.map(r=> r[field]==null ? null : padT + (1-(r[field]-min)/range)*(h-padT-padB));
  }
  const yA = normalize(fieldA);
  const yB = normalize(fieldB);

  function pathFor(ys){
    let d='', started=false;
    ys.forEach((y,i)=>{
      if(y==null){ started=false; return; }
      d += (started?' L ':'M ') + xFor(i)+','+y;
      started=true;
    });
    return d;
  }

  const bands = '';

  const dotsA = yA.map((y,i)=> y==null?'':`<circle cx="${xFor(i)}" cy="${y}" r="3" fill="var(--accent)"></circle>`).join('');
  const dotsB = yB.map((y,i)=> y==null?'':`<circle cx="${xFor(i)}" cy="${y}" r="3" fill="var(--accent-2)"></circle>`).join('');
  const labels = rows.map((r,i)=>`<text class="chart-label" x="${xFor(i)}" y="${h-6}" text-anchor="middle">${r.label}</text>`).join('');

  holder.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:10px;font-family:var(--font-mono);font-size:11px;color:var(--ink-soft);flex-wrap:wrap;">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--accent);border-radius:50%;margin-right:5px;"></span>${labelA}</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--accent-2);border-radius:50%;margin-right:5px;"></span>${labelB}</span>
    </div>
    <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      ${bands}
      <path d="${pathFor(yA)}" fill="none" stroke="var(--accent)" stroke-width="2.5"></path>
      <path d="${pathFor(yB)}" fill="none" stroke="var(--accent-2)" stroke-width="2.5"></path>
      ${dotsA}${dotsB}${labels}
    </svg>
    <p style="font-family:var(--font-mono);font-size:10.5px;color:var(--ink-soft);margin-top:6px;">Échelles indexées séparément pour comparer les tendances, pas les valeurs absolues.</p>`;
}

function renderCorrelations(){
  const rows = buildCorrelationRows();
  if(rows.length<2){
    ['corr-calories-volume','corr-poids-volume'].forEach(id=>{
      document.getElementById(id).innerHTML = '<p class="empty">Ajoute quelques semaines de suivi et de séances pour voir apparaître des tendances ici.</p>';
    });
    return;
  }
  drawDualChart('corr-calories-volume', rows, 'calories', 'volume', 'Calories', 'Volume soulevé');
  drawDualChart('corr-poids-volume', rows, 'poids', 'volume', 'Poids', 'Volume soulevé');

}

// ---- ACCUEIL ----
// ---- Séance suggérée ----
function renderSuggestedSeance(){
  const el = document.getElementById('suggested-seance');
  if(exercices.length===0){ el.style.display='none'; return; }
  const wk = isoWeekKey(new Date());
  const already = performances.some(p=>p.weekKey===wk);
  if(already){
    el.style.display='block';
    el.innerHTML = `<h2>Séance du jour</h2><p style="font-family:var(--font-body);font-size:14px;color:var(--ink-soft);margin:0;">Séance déjà enregistrée cette semaine. 💪</p>`;
    return;
  }
  const past = sortByWeek(performances);
  if(past.length===0){ el.style.display='none'; return; }
  const last = past[past.length-1];
  const names = last.exercices.map(b=>{ const exo=exercices.find(e=>e.id===b.exoId); return exo?exo.name:null; }).filter(Boolean);
  if(names.length===0){ el.style.display='none'; return; }
  el.style.display='block';
  el.innerHTML = `
    <h2>Séance du jour <span class="tag">suggestion</span></h2>
    <p style="font-family:var(--font-body);font-size:13.5px;color:var(--ink-soft);margin:0 0 14px;">Basée sur ta dernière séance (${weekLabel(last.weekKey)}) :</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">${names.map(n=>`<span class="set-chip" style="font-size:13px;padding:6px 12px;">${n}</span>`).join('')}</div>
    <button class="primary" onclick="startSuggestedSeance()">Commencer cette séance</button>`;
}

function startSuggestedSeance(){
  const wk = isoWeekKey(new Date());
  const past = sortByWeek(performances).filter(p=>p.weekKey!==wk);
  if(past.length===0) return;
  const last = past[past.length-1];
  const exoIds = last.exercices.map(b=>b.exoId).filter(id=>exercices.some(e=>e.id===id));
  if(exoIds.length===0) return;

  document.querySelector('nav.tabs button[data-view="performances"]').click();

  // On ouvre l'assistant de séance déjà rempli avec les exercices de
  // la dernière séance, charges comprises : il n'y a plus qu'à ajuster.
  startWizard('seance');
  if(!wiz) return;
  exoIds.forEach(exoId=>{
    const block = last.exercices.find(b=>b.exoId===exoId);
    wiz.blocks.push({exoId, sets: block.sets.map(s=>({poids:s.poids, reps:s.reps}))});
  });
  wiz.index = 3; // directement au récapitulatif
  renderWizStep();
  showToast('Séance reprise — ajuste tes charges 💪');
}

function renderHome(){
  renderPseudo();
  renderHero();
  renderLevel();
  renderNextMilestone();
  renderSuggestedSeance();
  renderReminder();
  renderMonthlySummary();
  const el = document.getElementById('home-content');
  if(mensurations.length===0 && performances.length===0 && suivi.length===0){
    el.innerHTML = `<div class="hero-empty"><div class="big">Ton carnet est vide</div>Ajoute ta première mesure, séance ou semaine de suivi pour voir ton résumé ici.</div>`;
    return;
  }
  let cards = '';

  if(mensurations.length>0){
    const weeks = sortByWeek(mensurations);
    const last = weeks[weeks.length-1];
    let rows = ['pec','bras','epaule','jambe','taille'].filter(f=>last[f]!=null).map(f=>{
      const g = objectifs.mensu[f];
      const delta = g!=null ? `<span class="delta">obj. ${g} cm</span>` : '';
      return `<div class="stat-row"><span>${fieldLabels[f]}</span><span class="val">${last[f]} <span style="font-size:12px;">cm</span>${delta}</span></div>`;
    }).join('');
    cards += `<div class="home-card"><h3><span class="icon">${ICONS.ruler}</span>Mensurations</h3><div class="sem-info">${weekLabel(last.weekKey)}</div>${rows}</div>`;
  } else {
    cards += `<div class="home-card"><h3><span class="icon">${ICONS.ruler}</span>Mensurations</h3><p class="empty">Pas encore de mesure enregistrée.</p></div>`;
  }

  if(suivi.length>0){
    const weeks = sortByWeek(suivi);
    const last = weeks[weeks.length-1];
    let rows = '';
    if(last.poids!=null){
      const g = objectifs.suivi.poids;
      rows += `<div class="stat-row"><span>Poids</span><span class="val">${last.poids} <span style="font-size:12px;">kg</span>${g!=null?`<span class="delta">obj. ${g} kg</span>`:''}</span></div>`;
    }
    if(last.taille!=null){
      const g = objectifs.suivi.taille;
      rows += `<div class="stat-row"><span>Tour de taille</span><span class="val">${last.taille} <span style="font-size:12px;">cm</span>${g!=null?`<span class="delta">obj. ${g} cm</span>`:''}</span></div>`;
    }
    if(last.calories!=null) rows += `<div class="stat-row"><span>Calories / jour</span><span class="val">${last.calories}</span></div>`;
    cards += `<div class="home-card"><h3><span class="icon">${ICONS.scale}</span>Suivi hebdo</h3><div class="sem-info">${weekLabel(last.weekKey)}</div>${rows}</div>`;
  } else {
    cards += `<div class="home-card"><h3><span class="icon">${ICONS.scale}</span>Suivi hebdo</h3><p class="empty">Pas encore de suivi enregistré.</p></div>`;
  }

  if(exercices.length>0){
    let rows = exercices.map(exo=>{
      const entries = getExoEntries(exo.id);
      if(entries.length===0) return `<div class="stat-row"><span>${exo.name}</span><span class="val" style="font-size:14px;color:var(--ink-soft);">—</span></div>`;
      const last = entries[entries.length-1];
      const maxPoids = Math.max(...last.sets.map(s=>s.poids));
      const g = exo.objectif;
      return `<div class="stat-row"><span>${exo.name} <span style="color:var(--ink-soft);font-size:11px;">(${weekShort(last.weekKey)})</span></span><span class="val">${maxPoids} <span style="font-size:12px;">kg</span>${g!=null?`<span class="delta">obj. ${g} kg</span>`:''}</span></div>`;
    }).join('');
    cards += `<div class="home-card"><h3><span class="icon">${ICONS.dumbbell}</span>Performances</h3><div class="sem-info">${exercices.length} exercice(s) suivi(s)</div>${rows}</div>`;
  } else {
    cards += `<div class="home-card"><h3><span class="icon">${ICONS.dumbbell}</span>Performances</h3><p class="empty">Aucun exercice ajouté.</p></div>`;
  }

  el.innerHTML = `<div class="home-grid">${cards}</div>`;
}

// ---- Export JSON ----
function openExportModal(){
  const data = {pseudo, mensurations, exercices, performances, suivi, objectifs, exportDate: todayStr()};
  document.getElementById('export-text').value = JSON.stringify(data, null, 2);
  document.getElementById('export-modal').style.display = 'flex';
}
function closeExportModal(){
  document.getElementById('export-modal').style.display = 'none';
}
function copyExport(){
  const text = document.getElementById('export-text').value;
  navigator.clipboard.writeText(text)
    .then(()=>showToast('JSON copié ✓'))
    .catch(()=>showToast('Copie impossible — sélectionne le texte manuellement'));
}
function downloadExport(){
  try{
    const text = document.getElementById('export-text').value;
    const blob = new Blob([text], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fonte-export-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Téléchargement lancé ✓');
  }catch(e){
    showToast('Téléchargement indisponible — utilise "Copier"');
  }
}

// ---- Import de données ----
function openImportModal(){
  document.getElementById('import-text').value = '';
  document.getElementById('import-file').value = '';
  document.getElementById('import-modal').style.display = 'flex';
}
function closeImportModal(){
  document.getElementById('import-modal').style.display = 'none';
}

function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('import-text').value = ev.target.result; };
  reader.onerror = () => showToast('Impossible de lire ce fichier');
  reader.readAsText(file);
}

function mergeImportedData(data){
  const idRemap = {};
  (data.exercices||[]).forEach(imp=>{
    const key = (imp.name||'').trim().toLowerCase();
    if(!key) return;
    let existing = exercices.find(e=>e.name.trim().toLowerCase()===key);
    if(existing){
      idRemap[imp.id] = existing.id;
      if(existing.objectif==null && imp.objectif!=null) existing.objectif = imp.objectif;
    } else {
      const newId = crypto.randomUUID();
      exercices.push({id:newId, name:imp.name, objectif: imp.objectif ?? null});
      idRemap[imp.id] = newId;
    }
  });

  (data.mensurations||[]).forEach(imp=>{
    if(!imp.weekKey) return;
    let existing = mensurations.find(m=>m.weekKey===imp.weekKey);
    if(existing){
      ['pec','bras','epaule','jambe','taille'].forEach(f=>{ if(imp[f]!=null) existing[f]=imp[f]; });
      if(imp.note) existing.note = imp.note;
    } else {
      mensurations.push({
        id: crypto.randomUUID(), date: imp.date||todayStr(), weekKey: imp.weekKey,
        pec: imp.pec??null, bras: imp.bras??null, epaule: imp.epaule??null, jambe: imp.jambe??null, taille: imp.taille??null,
        bonusDimanche: !!imp.bonusDimanche, note: imp.note??null, hasPhoto:false,
      });
    }
  });

  (data.performances||[]).forEach(imp=>{
    if(!imp.weekKey) return;
    const remappedBlocks = (imp.exercices||[])
      .map(b=>({exoId: idRemap[b.exoId]||b.exoId, sets:b.sets||[]}))
      .filter(b=>exercices.some(e=>e.id===b.exoId) && b.sets.length>0);
    if(remappedBlocks.length===0) return;
    let existing = performances.find(p=>p.weekKey===imp.weekKey);
    if(existing){
      remappedBlocks.forEach(b=>{
        const eb = existing.exercices.find(x=>x.exoId===b.exoId);
        if(eb) eb.sets = eb.sets.concat(b.sets); else existing.exercices.push(b);
      });
      if(imp.note) existing.note = imp.note;
    } else {
      performances.push({id: crypto.randomUUID(), weekKey: imp.weekKey, date: imp.date||todayStr(), note: imp.note??null, exercices: remappedBlocks});
    }
  });

  (data.suivi||[]).forEach(imp=>{
    if(!imp.weekKey) return;
    suivi.push({
      id: crypto.randomUUID(), date: imp.date||todayStr(), weekKey: imp.weekKey,
      calories: imp.calories??null, poids: imp.poids??null, taille: imp.taille??null,
      bonusDimanche: !!imp.bonusDimanche, note: imp.note??null,
    });
  });

  if(data.objectifs){
    if(data.objectifs.mensu){
      Object.keys(data.objectifs.mensu).forEach(k=>{ if(data.objectifs.mensu[k]!=null) objectifs.mensu[k]=data.objectifs.mensu[k]; });
    }
    if(data.objectifs.suivi){
      Object.keys(data.objectifs.suivi).forEach(k=>{ if(data.objectifs.suivi[k]!=null) objectifs.suivi[k]=data.objectifs.suivi[k]; });
    }
  }
}

function replaceAllData(data){
  mensurations = (data.mensurations||[]).map(m=>({...m, hasPhoto:false}));
  exercices = (data.exercices||[]).map(e=>({...e}));
  performances = migratePerformances(data.performances||[]);
  suivi = data.suivi||[];
  objectifs = data.objectifs || {mensu:{}, suivi:{}};
  if(!objectifs.mensu) objectifs.mensu = {};
  if(!objectifs.suivi) objectifs.suivi = {};
  if(typeof data.pseudo === 'string'){ pseudo = data.pseudo; save('pseudo', pseudo); }
}

function refreshAfterImport(){
  // Import : tout a ete remplace, l'empreinte n'a plus de sens.
  Object.keys(empreintes).forEach(function(k){ delete empreintes[k]; });
  renderObjMensuRecap();
  renderMensuRecap();
  renderSuiviRecap();
  renderSeanceRecap();
  renderHome();
  renderMensuHistory();
  renderMensuChart();
  renderExoList();
  renderPerfChartSelect();
  renderPerfHistory();
  renderPerfWeekSelect();
  renderCompareSelects();
  renderSuiviHistory();
  renderSuiviChart();
}


async function runImport(mode){
  const raw = document.getElementById('import-text').value.trim();
  if(!raw){ showToast('Colle ou charge un fichier JSON d\'abord'); return; }
  let data;
  try{ data = JSON.parse(raw); }
  catch(e){ showToast('JSON invalide — vérifie le fichier'); return; }
  if(!data || typeof data!=='object' || (!data.mensurations && !data.performances && !data.suivi && !data.exercices)){
    showToast('Ce fichier ne ressemble pas à un export valide');
    return;
  }
  if(mode==='replace'){
    const ok = await confirmer('Remplacer toutes tes données ?',
      "Tes données actuelles seront écrasées par celles du fichier importé.\n\nCette action est définitive.",
      'Importer');
    if(!ok) return;
    replaceAllData(data);
  } else {
    mergeImportedData(data);
  }
  // Ordre imposé : les séries référencent les exercices et les séances,
  // qui doivent donc exister en base avant elles.
  await save('exercices', exercices);
  await save('performances', performances);
  await Promise.all([
    save('mensurations', mensurations),
    save('suivi', suivi),
    save('objectifs', objectifs),
  ]);
  closeImportModal();
  refreshAfterImport();
  showToast(mode==='replace' ? 'Données remplacées ✓' : 'Données fusionnées ✓');
}

// ---- Système de niveau / XP ----
function weekKeyToMonday(weekKey){
  const [y,w] = weekKey.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y,0,4));
  const jan4Day = (jan4.getUTCDay()+6)%7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate()-jan4Day);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (w-1)*7);
  return target;
}

function computeStreakXP(){
  const allWeeks = [...new Set([...mensurations.map(m=>m.weekKey), ...performances.map(p=>p.weekKey), ...suivi.map(s=>s.weekKey)])];
  const sorted = allWeeks.sort((a,b)=>weekKeyToMonday(a)-weekKeyToMonday(b));
  let xp = 0;
  for(let i=1;i<sorted.length;i++){
    const diffDays = (weekKeyToMonday(sorted[i]) - weekKeyToMonday(sorted[i-1])) / 86400000;
    if(diffDays===7) xp += 10; // semaine qui prolonge une série sans coupure
  }
  return xp;
}

function computeVolumeXP(){
  const weekVol = {};
  performances.forEach(se=>{
    let vol = 0;
    se.exercices.forEach(b=>b.sets.forEach(s=>vol += s.poids*s.reps));
    weekVol[se.weekKey] = (weekVol[se.weekKey]||0) + vol;
  });
  let xp = 0;
  Object.values(weekVol).forEach(vol=>{
    xp += Math.min(250, Math.floor(vol/10)); // plafond hebdomadaire pour ne pas écraser la régularité
  });
  return xp;
}

// Décompose l'XP par source, pour pouvoir détecter précisément
// ce qui a rapporté quoi après une action.
function computeXPBreakdown(){
  let records = 0;
  exercices.forEach(exo=>{
    const entries = getExoEntries(exo.id);
    if(entries.length===0) return;
    let max = Math.max(...entries[0].sets.map(s=>s.poids));
    for(let i=1;i<entries.length;i++){
      const m = Math.max(...entries[i].sets.map(s=>s.poids));
      if(m>max){ max=m; records+=50; }
    }
  });

  const weeksM = new Set(mensurations.map(m=>m.weekKey));
  const weeksP = new Set(performances.map(p=>p.weekKey));
  const weeksS = new Set(suivi.map(s=>s.weekKey));
  let combo = 0;
  new Set([...weeksM, ...weeksP, ...weeksS]).forEach(wk=>{
    if(weeksM.has(wk) && weeksP.has(wk) && weeksS.has(wk)) combo += 30;
  });

  return {
    seances:      performances.length * 15,
    streak:       computeStreakXP(),
    volume:       computeVolumeXP(),
    records,
    mensurations: mensurations.length * 8,
    suiviHebdo:   new Set(suivi.map(s=>s.weekKey)).size * 8,
    bonusDimanche: suivi.filter(s=>s.bonusDimanche).length * BONUS_DIMANCHE,
    combo
  };
}

const XP_LABELS = {
  seances:      'Séance enregistrée',
  streak:       'Semaine d\'affilée 🔥',
  volume:       'Volume soulevé',
  records:      'Nouveau record 🏆',
  mensurations: 'Mensurations relevées',
  suiviHebdo:   'Suivi hebdo complété',
  bonusDimanche: 'Bilan du dimanche 📅',
  combo:        'Semaine complète 🎯'
};

let lastXPBreakdown = null;

// Compare la répartition d'XP avant/après et affiche une
// notification par source ayant progressé.
function checkXPGain(){
  const now = computeXPBreakdown();
  if(lastXPBreakdown){
    Object.keys(now).forEach(k=>{
      const delta = now[k] - lastXPBreakdown[k];
      if(delta > 0) pushXPNotif(delta, XP_LABELS[k]);
    });
  }
  lastXPBreakdown = now;
}

let xpNotifId = 0;
function pushXPNotif(amount, label){
  const stack = document.getElementById('xp-stack');
  if(!stack) return;
  const id = 'xpn-' + (++xpNotifId);
  const el = document.createElement('div');
  el.className = 'xp-notif';
  el.id = id;
  el.innerHTML = `
    <div class="xp-notif-amount">+${amount} XP</div>
    <div class="xp-notif-label">${label}</div>
    <button class="xp-notif-close" onclick="dismissXPNotif('${id}')" aria-label="Fermer">✕</button>`;
  stack.prepend(el);
  // Au-delà de 6, on retire les plus anciennes pour ne pas envahir l'écran
  while(stack.children.length > 6) stack.lastElementChild.remove();
}

function dismissXPNotif(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('leaving');
  setTimeout(()=>el.remove(), 220);
}

function computeTotalXP(){
  let xp = 0;
  xp += performances.length * 15;
  xp += computeStreakXP();
  xp += computeVolumeXP();

  exercices.forEach(exo=>{
    const entries = getExoEntries(exo.id);
    if(entries.length===0) return;
    let max = Math.max(...entries[0].sets.map(s=>s.poids)); // baseline : ne compte pas comme un record
    for(let i=1;i<entries.length;i++){
      const m = Math.max(...entries[i].sets.map(s=>s.poids));
      if(m>max){ max=m; xp+=50; }
    }
  });

  xp += mensurations.length*8;
  xp += new Set(suivi.map(s=>s.weekKey)).size * 8;
  xp += suivi.filter(s=>s.bonusDimanche).length * BONUS_DIMANCHE; // une seule fois par semaine, même si plusieurs entrées existent

  const weeksM = new Set(mensurations.map(m=>m.weekKey));
  const weeksP = new Set(performances.map(p=>p.weekKey));
  const weeksS = new Set(suivi.map(s=>s.weekKey));
  const allWeeks = new Set([...weeksM, ...weeksP, ...weeksS]);
  allWeeks.forEach(wk=>{ if(weeksM.has(wk) && weeksP.has(wk) && weeksS.has(wk)) xp+=30; });

  return xp;
}

function cumulativeXpForLevel(L){ return 10*L*(L+1); }

function computeLevelInfo(xp){
  let level = 0;
  while(cumulativeXpForLevel(level+1) <= xp) level++;
  const floorXp = cumulativeXpForLevel(level);
  const ceilXp = cumulativeXpForLevel(level+1);
  return { level, xp, progress: (xp-floorXp)/(ceilXp-floorXp), xpToNext: ceilXp-xp };
}

function rankName(level){
  if(level<5) return 'Débutant';
  if(level<10) return 'Bronze';
  if(level<20) return 'Argent';
  if(level<35) return 'Or';
  if(level<55) return 'Platine';
  if(level<80) return 'Diamant';
  return 'Légende';
}

function renderLevel(){
  const xp = computeTotalXP();
  const info = computeLevelInfo(xp);
  document.getElementById('hero-level-rank').textContent = rankName(info.level);
  document.getElementById('hero-xp-total').textContent = `${xp} XP`;
  document.getElementById('hero-xp-next').textContent = `${info.xpToNext} XP avant le niveau ${info.level+1}`;
  document.getElementById('hero-xp-fill').style.width = Math.round(info.progress*100) + '%';
  animateCount(document.getElementById('hero-level-num'), info.level, 700);
}

// ---- Pseudo ----
function renderPseudo(){
  const el = document.getElementById('hero-pseudo');
  if(el) el.textContent = pseudo || 'Ton carnet';
}

// ---- Prochain jalon ----
function goalPct(baseline, current, goal){
  let pct;
  if(goal===baseline){ pct = current>=goal?100:0; }
  else { pct = ((current-baseline)/(goal-baseline))*100; }
  return Math.max(0, Math.min(100, pct));
}

function computeNextMilestone(){
  const candidates = [];
  const weeksM = sortByWeek(mensurations);
  ['pec','bras','epaule','jambe','taille'].forEach(f=>{
    const g = objectifs.mensu[f]; if(g==null) return;
    const vals = weeksM.filter(m=>m[f]!=null); if(vals.length===0) return;
    const baseline=vals[0][f], current=vals[vals.length-1][f];
    if(isGoalReached(baseline,current,g)) return;
    candidates.push({label:fieldLabels[f], baseline, current, goal:g, unit:'cm', pct:goalPct(baseline,current,g), remaining:Math.abs(g-current)});
  });
  const weeksS = sortByWeek(suivi);
  [['poids','Poids','kg'],['taille','Tour de taille','cm']].forEach(([f,label,unit])=>{
    const g = objectifs.suivi[f]; if(g==null) return;
    const vals = weeksS.filter(s=>s[f]!=null); if(vals.length===0) return;
    const baseline=vals[0][f], current=vals[vals.length-1][f];
    if(isGoalReached(baseline,current,g)) return;
    candidates.push({label, baseline, current, goal:g, unit, pct:goalPct(baseline,current,g), remaining:Math.abs(g-current)});
  });
  exercices.forEach(exo=>{
    if(exo.objectif==null) return;
    const entries = getExoEntries(exo.id); if(entries.length===0) return;
    const baseline=Math.max(...entries[0].sets.map(s=>s.poids));
    const current=Math.max(...entries[entries.length-1].sets.map(s=>s.poids));
    if(isGoalReached(baseline,current,exo.objectif)) return;
    candidates.push({label:exo.name, baseline, current, goal:exo.objectif, unit:'kg', pct:goalPct(baseline,current,exo.objectif), remaining:Math.abs(exo.objectif-current)});
  });
  if(candidates.length===0) return null;
  candidates.sort((a,b)=>b.pct-a.pct);
  return candidates[0];
}

// Le jalon suivi peut etre choisi : le carnet imposait
// l'exercice le plus proche de son objectif, pas forcement
// celui qui interesse.
let jalonChoisi = null;

function cleJalon(){ return 'fonte-jalon:' + (currentUser ? currentUser.id : ''); }

function chargerJalonChoisi(){
  try{ jalonChoisi = localStorage.getItem(cleJalon()) || null; }catch(e){ jalonChoisi = null; }
}

function choisirJalon(id){
  jalonChoisi = id || null;
  try{
    if(jalonChoisi) localStorage.setItem(cleJalon(), jalonChoisi);
    else localStorage.removeItem(cleJalon());
  }catch(e){}
  renderNextMilestone();
}

function jalonPourExercice(exoId){
  const exo = exercices.find(function(e){ return e.id === exoId; });
  if(!exo || exo.objectif == null) return null;
  const entries = getExoEntries(exo.id);
  if(!entries.length) return null;
  const baseline = Math.max.apply(null, entries[0].sets.map(function(x){ return x.poids; }));
  const current  = Math.max.apply(null, entries[entries.length-1].sets.map(function(x){ return x.poids; }));
  if(current >= exo.objectif) return null;
  return {label: exo.name, baseline: baseline, current: current,
          goal: exo.objectif, unit: 'kg', remaining: exo.objectif - current};
}

function renderNextMilestone(){
  const el = document.getElementById('next-milestone');
  if(!el) return;

  const candidats = exercices.filter(function(e){
    return e.objectif != null && jalonPourExercice(e.id);
  });
  if(!candidats.length){ el.style.display = 'none'; return; }

  if(jalonChoisi && !candidats.some(function(c){ return c.id === jalonChoisi; })) jalonChoisi = null;
  const m = jalonChoisi ? jalonPourExercice(jalonChoisi) : computeNextMilestone();
  if(!m){ el.style.display = 'none'; return; }

  const options = candidats.map(function(c){
    return '<option value="' + c.id + '"' + (jalonChoisi === c.id ? ' selected' : '') + '>' +
      String(c.name).replace(/</g,'&lt;') + '</option>';
  }).join('');

  el.style.display = 'block';
  el.innerHTML =
    '<div class="jalon-entete">' +
      '<h2 style="border:none;margin:0;padding:0;">Prochain jalon</h2>' +
      (candidats.length > 1
        ? '<select class="jalon-select" onchange="choisirJalon(this.value)">' +
            '<option value=""' + (jalonChoisi ? '' : ' selected') + '>Le plus proche</option>' +
            options + '</select>'
        : '') +
    '</div>' +
    '<p style="font-family:var(--font-body);font-size:14px;color:var(--ink);margin:0 0 12px;">' +
      m.label + ' &mdash; encore <strong style="color:var(--accent-2);">' +
      m.remaining.toFixed(1) + ' ' + m.unit + '</strong> pour atteindre ton objectif (' +
      m.goal + ' ' + m.unit + ')</p>' +
    goalProgressHTML(m.baseline, m.current, m.goal, m.unit);
}

function isGoalReached(baseline, current, goal){
  if(goal===baseline) return current>=goal;
  const pct = ((current-baseline)/(goal-baseline))*100;
  return pct>=99.5;
}



async function deleteMensuration(id){
  const m = mensurations.find(x=>x.id===id);
  const ok = await confirmer('Supprimer cette mesure ?',
    'La mesure de la semaine ' + (m ? weekLabel(m.weekKey) : '') +
    " sera definitivement effacee, ainsi que l'XP qu'elle a rapporte.", 'Supprimer');
  if(!ok) return;
  mensurations = mensurations.filter(m=>m.id!==id);
  save('mensurations', mensurations);
  renderMensuHistory(); renderMensuChart(); renderMensuRecap();
  renderCompareSelects(); renderHome();
  showToast('Mesure supprimee');
}

function renderMensuHistory(){
  const el = document.getElementById('mensu-history');
  if(mensurations.length===0){el.innerHTML='<p class="empty">Aucune mesure enregistrée pour l\'instant.</p>';return;}
  const weeks = sortByWeek(mensurations).slice().reverse();
  let rows = weeks.map(m=>`
    <tr>
      <td><span class="sem-badge">${weekShort(m.weekKey)}</span>${m.date}${m.hasPhoto?` <button class="note-icon" onclick="showPhoto('${m.weekKey}')" title="Voir la photo">📷</button>`:''}${m.note?` <button class="note-icon" onclick="showNote(getMensuNote('${m.id}'))" title="Voir la note">📝</button>`:''}</td>
      <td>${m.pec ?? '—'}</td><td>${m.bras ?? '—'}</td><td>${m.epaule ?? '—'}</td><td>${m.jambe ?? '—'}</td><td>${m.taille ?? '—'}</td>
      <td><button class="del-btn" onclick="deleteMensuration('${m.id}')">✕</button></td>
    </tr>`).join('');
  el.innerHTML = `<table><thead><tr><th>Semaine</th><th>Pec.</th><th>Bras</th><th>Épaule</th><th>Jambe</th><th>Taille</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderMensuChart(){
  const field = document.getElementById('mensu-chart-select').value;
  const weeks = sortByWeek(mensurations.filter(m=>m[field]!=null));
  const goal = objectifs.mensu[field];
  drawChart('mensu-chart-holder', weeks.map(m=>({label:weekShort(m.weekKey), value:m[field]})), 'cm', goal);
  const goalEl = document.getElementById('mensu-goal');
  if(goal!=null && weeks.length>0){
    goalEl.innerHTML = goalProgressHTML(weeks[0][field], weeks[weeks.length-1][field], goal, 'cm');
  } else { goalEl.innerHTML=''; }
}

// ---- Exercices ----
function editExoGoal(id){
  const exo = exercices.find(e=>e.id===id);
  if(!exo) return;
  const val = prompt(`Objectif de poids pour "${exo.name}" (kg, laisser vide pour aucun) :`, exo.objectif ?? '');
  if(val===null) return;
  exo.objectif = parseFloat(val)||null;
  save('exercices', exercices);
  renderExoList(); renderHome(); renderPerfChart();
  showToast('Objectif mis à jour ✓');
}

async function deleteExercice(id){
  const exo = exercices.find(e=>e.id===id);
  const nb = getExoEntries(id).length;
  const ok = await confirmer('Supprimer cet exercice ?',
    (exo ? '« ' + exo.name + ' »' : 'Cet exercice') +
    (nb ? ' et ses ' + nb + ' passage' + (nb>1?'s':'') + ' enregistre' + (nb>1?'s':'') : '') +
    " seront definitivement effaces, ainsi que l'XP et les records associes.", 'Supprimer');
  if(!ok) return;
  exercices = exercices.filter(e=>e.id!==id);
  performances.forEach(se=>{ se.exercices = se.exercices.filter(b=>b.exoId!==id); });
  performances = performances.filter(se=>se.exercices.length>0);
  save('exercices', exercices); save('performances', performances);
  renderExoList(); renderPerfChartSelect(); renderPerfHistory();
  renderPerfWeekSelect(); renderSeanceRecap(); renderHome();
}

function renderExoList(){
  const el = document.getElementById('exo-list');
  if(exercices.length===0){el.innerHTML='<p class="empty">Aucun exercice pour l\'instant — ajoute ton premier exercice ci-dessus.</p>';return;}
  el.innerHTML = exercices.map(e=>`
    <div class="exo-row">
      <span class="exo-name">${e.name}</span>
      <span class="exo-goal">${e.objectif!=null?'Objectif : '+e.objectif+' kg':'Pas d\'objectif'}</span>
      <div class="exo-actions">
        <button class="small" onclick="editExoGoal('${e.id}')">Objectif</button>
        <button class="del-btn" onclick="deleteExercice('${e.id}')">✕</button>
      </div>
    </div>`).join('');
}

function renderPerfChartSelect(){
  const sel = document.getElementById('perf-chart-select');
  const prev = sel.value;
  sel.innerHTML = exercices.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  if(prev && exercices.some(e=>e.id===prev)) sel.value = prev;
  renderPerfChart();
}

function renderPerfChart(){
  const exoId = document.getElementById('perf-chart-select').value;
  const metric = document.getElementById('perf-metric-select').value;
  const exo = exercices.find(e=>e.id===exoId);
  const entries = getExoEntries(exoId);
  const points = entries.map(e=>{
    const value = metric==='max' ? Math.max(...e.sets.map(s=>s.poids)) : e.sets.reduce((sum,s)=>sum+s.poids*s.reps,0);
    return {label:weekShort(e.weekKey), value};
  });
  const goal = (metric==='max' && exo) ? exo.objectif : null;
  drawChart('perf-chart-holder', points, metric==='max'?'kg':'vol.', goal);
  const goalEl = document.getElementById('perf-goal');
  if(goal!=null && points.length>0){
    goalEl.innerHTML = goalProgressHTML(points[0].value, points[points.length-1].value, goal, 'kg');
  } else { goalEl.innerHTML=''; }
}

function renderPerfHistory(){
  const el = document.getElementById('perf-history');
  const exoId = document.getElementById('perf-chart-select').value;
  const exo = exercices.find(e=>e.id===exoId);
  if(!exo){el.innerHTML='<p class="empty">Ajoute un exercice pour voir son historique.</p>';return;}
  const entries = getExoEntries(exoId).slice().reverse();
  if(entries.length===0){el.innerHTML=`<p class="empty">Aucune performance enregistrée pour ${exo.name}.</p>`;return;}
  let rows = entries.map(e=>{
    const chips = e.sets.map(s=>`<span class="set-chip">${s.poids}kg×${s.reps}</span>`).join('');
    const volume = e.sets.reduce((sum,s)=>sum+s.poids*s.reps,0);
    const note = getSeanceNote(e.seanceId);
    return `<tr>
      <td><span class="sem-badge">${weekShort(e.weekKey)}</span>${e.date}${note?` <button class="note-icon" onclick="showNote(getSeanceNote('${e.seanceId}'))" title="Voir la note de la séance">📝</button>`:''}</td>
      <td class="sets-cell">${chips}</td>
      <td>${volume}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table><thead><tr><th>Semaine</th><th>Séries</th><th>Volume</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPerfWeekSelect(){
  const sel = document.getElementById('perf-week-select');
  const prev = sel.value;
  const keys = sortByWeek(performances).map(p=>p.weekKey).reverse();
  const uniqueKeys = [...new Set(keys)];
  sel.innerHTML = uniqueKeys.map(k=>`<option value="${k}">${weekLabel(k)}</option>`).join('');
  if(uniqueKeys.includes(prev)) sel.value = prev;
}

function renderPerfWeekView(){
  const el = document.getElementById('perf-week-list');
  const sel = document.getElementById('perf-week-select');
  const wk = sel.value;
  if(!wk || exercices.length===0){ el.innerHTML = '<p class="empty">Pas encore de séance enregistrée.</p>'; return; }

  let rows = exercices.map(exo=>{
    const entries = getExoEntries(exo.id);
    const idx = entries.findIndex(e=>e.weekKey===wk);
    if(idx===-1){
      return `<div class="week-row"><span class="wr-name">${exo.name}</span><span class="wr-val" style="color:var(--ink-soft);font-size:14px;">—</span></div>`;
    }
    const entry = entries[idx];
    const maxPoids = Math.max(...entry.sets.map(s=>s.poids));
    const prevEntry = idx>0 ? entries[idx-1] : null;
    let pill = '<span class="delta-pill flat">1ère fois</span>';
    if(prevEntry){
      const prevMax = Math.max(...prevEntry.sets.map(s=>s.poids));
      const diff = +(maxPoids-prevMax).toFixed(1);
      if(diff>0) pill = `<span class="delta-pill up">▲ +${diff} kg vs ${weekShort(prevEntry.weekKey)}</span>`;
      else if(diff<0) pill = `<span class="delta-pill down">▼ ${diff} kg vs ${weekShort(prevEntry.weekKey)}</span>`;
      else pill = `<span class="delta-pill flat">= vs ${weekShort(prevEntry.weekKey)}</span>`;
    }
    const goalHTML = exo.objectif!=null ? `<div class="wr-goal">${goalProgressHTML(Math.max(...entries[0].sets.map(s=>s.poids)), maxPoids, exo.objectif, 'kg')}</div>` : '';
    return `<div class="week-row">
      <span class="wr-name">${exo.name}</span>
      <span class="wr-val">${maxPoids} <span style="font-size:12px;">kg</span></span>
      ${pill}
      ${goalHTML}
    </div>`;
  }).join('');
  el.innerHTML = rows;
}

// ---- Suivi hebdo ----
async function deleteSuivi(id){
  const e = suivi.find(x=>x.id===id);
  const ok = await confirmer('Supprimer ce suivi ?',
    'Le suivi de la semaine ' + (e ? weekLabel(e.weekKey) : '') +
    " sera definitivement efface, ainsi que l'XP qu'il a rapporte.", 'Supprimer');
  if(!ok) return;
  suivi = suivi.filter(s=>s.id!==id);
  save('suivi', suivi);
  renderSuiviHistory(); renderSuiviChart(); renderHome();
}

function renderSuiviHistory(){
  const el = document.getElementById('suivi-history');
  if(suivi.length===0){el.innerHTML='<p class="empty">Aucune donnée enregistrée pour l\'instant.</p>';return;}
  const weeks = sortByWeek(suivi).slice().reverse();
  let rows = weeks.map(s=>`
    <tr>
      <td><span class="sem-badge">${weekShort(s.weekKey)}</span>${s.date}${s.note?` <button class="note-icon" onclick="showNote(getSuiviNote('${s.id}'))" title="Voir la note">📝</button>`:''}</td>
      <td>${s.calories ?? '—'}</td><td>${s.poids ?? '—'}</td><td>${s.taille ?? '—'}</td>
      <td><button class="del-btn" onclick="deleteSuivi('${s.id}')">✕</button></td>
    </tr>`).join('');
  el.innerHTML = `<table><thead><tr><th>Semaine</th><th>Calories</th><th>Poids</th><th>Taille</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSuiviChart(){
  const field = document.getElementById('suivi-chart-select').value;
  const units = {poids:'kg', taille:'cm', calories:'kcal'};
  const weeks = sortByWeek(suivi.filter(s=>s[field]!=null));
  const goal = field==='calories' ? null : objectifs.suivi[field];
  drawChart('suivi-chart-holder', weeks.map(s=>({label:weekShort(s.weekKey), value:s[field]})), units[field], goal);
  const goalEl = document.getElementById('suivi-goal');
  if(goal!=null && weeks.length>0){
    goalEl.innerHTML = goalProgressHTML(weeks[0][field], weeks[weeks.length-1][field], goal, units[field]);
  } else { goalEl.innerHTML=''; }
}

// ---- Graphique SVG générique ----
function drawChart(holderId, points, unit, goal){
  const holder = document.getElementById(holderId);
  if(points.length===0){holder.innerHTML='<p class="empty">Pas encore assez de données pour afficher un graphique.</p>';return;}
  if(points.length===1){
    holder.innerHTML = `<p class="empty">Une seule mesure pour l'instant : ${points[0].value} ${unit} (${points[0].label}). Ajoute une autre semaine pour voir la progression.</p>`;
    return;
  }
  const w = 800, h = 170, padL = 40, padR = 10, padT = 12, padB = 24;
  const values = points.map(p=>p.value);
  let min = Math.min(...values), max = Math.max(...values);
  if(goal!=null){ min = Math.min(min, goal); max = Math.max(max, goal); }
  if(min===max){min-=1;max+=1;}
  const pad10 = (max-min)*0.1;
  min -= pad10; max += pad10;
  const range = max-min;
  const stepX = (w-padL-padR)/(points.length-1);
  const xFor = i => padL + i*stepX;
  const yFor = v => padT + (1-(v-min)/range)*(h-padT-padB);

  const linePoints = points.map((p,i)=>`${xFor(i)},${yFor(p.value)}`).join(' ');
  const dots = points.map((p,i)=>`<circle class="chart-dot" cx="${xFor(i)}" cy="${yFor(p.value)}" r="3.5"></circle>`).join('');
  const labels = points.map((p,i)=>`<text class="chart-label" x="${xFor(i)}" y="${h-4}" text-anchor="middle">${p.label}</text>`).join('');
  const gridTop = `<line class="chart-grid" x1="${padL}" y1="${padT}" x2="${w-padR}" y2="${padT}"></line>`;
  const gridBottom = `<line class="chart-grid" x1="${padL}" y1="${h-padB}" x2="${w-padR}" y2="${h-padB}"></line>`;
  const maxLabel = `<text class="chart-label" x="0" y="${padT+4}">${max.toFixed(1)}</text>`;
  const minLabel = `<text class="chart-label" x="0" y="${h-padB+4}">${min.toFixed(1)}</text>`;
  let goalLine = '';
  if(goal!=null){
    const gy = yFor(goal);
    goalLine = `<line class="chart-goal" x1="${padL}" y1="${gy}" x2="${w-padR}" y2="${gy}"></line><text class="chart-goal-label" x="${w-padR}" y="${gy-4}" text-anchor="end">objectif ${goal}</text>`;
  }

  holder.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${gridTop}${gridBottom}${maxLabel}${minLabel}${goalLine}
    <polyline class="chart-line" points="${linePoints}"></polyline>
    ${dots}${labels}
  </svg>`;
}

// Le chargement est déclenché par db.auth.onAuthStateChange,
// une fois l'utilisateur authentifié.
