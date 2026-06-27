// Digital Human Studio — Frontend

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  user: null,
  page: 'login',
  digitalHumans: [],
  jobs: [],
  workerHealth: null,
  selectedDH: null,
  pollTimer: null,
};

function uid() { return state.user?.id || ''; }

// ── API helper ─────────────────────────────────────────────────────────────
function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', 'x-user-id': uid(), ...(opts.headers || {}) },
  }).then(r => r.text().then(text => {
    let d;
    try { d = JSON.parse(text); } catch { throw new Error('Server returned unexpected response. Try again.'); }
    if (d.error) throw new Error(d.error);
    return d;
  }));
}

function uploadFile(path, file, extraFields = {}) {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  return fetch(path, { method: 'POST', headers: { 'x-user-id': uid() }, body: form })
    .then(r => r.json().then(d => { if (d.error) throw new Error(d.error); return d; }));
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Router ─────────────────────────────────────────────────────────────────
function navigate(page, params = {}) {
  state.page = page;
  state.params = params;
  clearInterval(state.pollTimer);
  render();
}

function render() {
  const app = document.getElementById('app');
  if (!state.user) { app.innerHTML = renderAuth(); bindAuth(); return; }
  app.innerHTML = renderShell();
  bindShell();
  renderPage();
}

// ── Auth ───────────────────────────────────────────────────────────────────
function renderAuth() {
  return `
<div id="toasts"></div>
<div class="auth-wrap">
  <div class="auth-card">
    <div class="auth-logo">
      <h1>Digital Human Studio</h1>
      <p>AI-powered digital human generator</p>
    </div>
    <div id="auth-form">${renderLoginForm()}</div>
  </div>
</div>`;
}

function renderLoginForm() {
  return `
<form id="login-form">
  <div class="form-group"><label>Email</label><input type="email" id="login-email" placeholder="you@example.com" required></div>
  <div class="form-group"><label>Password</label><input type="password" id="login-password" placeholder="••••••••" required></div>
  <button type="submit" class="btn btn-primary btn-full btn-lg" id="login-btn">Sign In</button>
</form>
<div class="auth-switch">Don't have an account? <a href="#" id="show-signup">Create account</a></div>`;
}

function renderSignupForm() {
  return `
<form id="signup-form">
  <div class="form-group"><label>Full Name</label><input type="text" id="signup-name" placeholder="Your name" required></div>
  <div class="form-group"><label>Email</label><input type="email" id="signup-email" placeholder="you@example.com" required></div>
  <div class="form-group"><label>Password <span>(min. 6 chars)</span></label><input type="password" id="signup-password" required></div>
  <button type="submit" class="btn btn-primary btn-full btn-lg" id="signup-btn">Create Account</button>
</form>
<div class="auth-switch">Already have an account? <a href="#" id="show-login">Sign in</a></div>`;
}

function bindAuth() {
  document.getElementById('toasts');
  document.addEventListener('submit', async e => {
    if (e.target.id === 'login-form') {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('login-email').value, password: document.getElementById('login-password').value }) });
        state.user = user;
        navigate('dashboard');
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; }
    }
    if (e.target.id === 'signup-form') {
      e.preventDefault();
      const btn = document.getElementById('signup-btn');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const { user } = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: document.getElementById('signup-name').value, email: document.getElementById('signup-email').value, password: document.getElementById('signup-password').value }) });
        state.user = user;
        navigate('dashboard');
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Create Account'; }
    }
  });
  document.addEventListener('click', e => {
    if (e.target.id === 'show-signup') { e.preventDefault(); document.getElementById('auth-form').innerHTML = renderSignupForm(); }
    if (e.target.id === 'show-login') { e.preventDefault(); document.getElementById('auth-form').innerHTML = renderLoginForm(); }
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', icon: '⬛', label: 'Dashboard', section: null },
  { id: 'my-humans', icon: '🧑', label: 'My Digital Humans', section: 'CREATE' },
  { id: 'create-human', icon: '✨', label: 'Create Digital Human', section: null },
  { id: 'generate', icon: '🎬', label: 'Generate Video', section: 'GENERATE' },
  { id: 'ai-ads', icon: '📢', label: 'AI Ads', section: null },
  { id: 'ai-presenter', icon: '🎤', label: 'AI Presenter', section: null },
  { id: 'ai-influencer', icon: '⭐', label: 'AI Influencer', section: null },
  { id: 'jobs', icon: '📋', label: 'Video Jobs', section: 'HISTORY' },
  { id: 'api-keys', icon: '🔑', label: 'API Keys', section: 'DEVELOPER' },
  { id: 'workers', icon: '⚙️', label: 'Worker Status', section: null },
  { id: 'credits', icon: '💳', label: 'Credits & Billing', section: 'ACCOUNT' },
  { id: 'admin', icon: '🛡️', label: 'Admin Panel', section: null, adminOnly: true },
];

function renderShell() {
  const user = state.user;
  const navItems = NAV_ITEMS.filter(n => !n.adminOnly || user.role === 'admin');
  let lastSection = null;
  const navHtml = navItems.map(n => {
    let out = '';
    if (n.section && n.section !== lastSection) {
      out += `<div class="nav-section">${n.section}</div>`;
      lastSection = n.section;
    }
    out += `<div class="nav-item${state.page === n.id ? ' active' : ''}" data-page="${n.id}">
      <span class="icon">${n.icon}</span> ${n.label}
    </div>`;
    return out;
  }).join('');

  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `
<div id="toasts"></div>
<div class="shell">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <h2>Digital Human Studio</h2>
      <span>AI Video Platform</span>
    </div>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-footer">
      <div class="user-pill">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <div class="name">${escHtml(user.name)}</div>
          <div class="role">${user.plan} plan</div>
        </div>
        <div class="credit-badge">${user.credits} cr</div>
      </div>
      <button class="btn btn-ghost btn-sm btn-full" id="logout-btn" style="margin-top:8px">Sign Out</button>
    </div>
  </aside>
  <div class="main">
    <div class="topbar">
      <div class="topbar-title">${getPageTitle()}</div>
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" data-page="generate">+ New Video</button>
      </div>
    </div>
    <div class="page" id="page-content"></div>
  </div>
</div>`;
}

function getPageTitle() {
  const titles = { dashboard: 'Dashboard', 'my-humans': 'My Digital Humans', 'create-human': 'Create Digital Human', generate: 'Generate Video', 'ai-ads': 'AI Ad Videos', 'ai-presenter': 'AI Presenter', 'ai-influencer': 'AI Influencer', jobs: 'Video Jobs', 'api-keys': 'API Keys', workers: 'Worker Status', credits: 'Credits & Billing', admin: 'Admin Panel' };
  return titles[state.page] || 'Digital Human Studio';
}

function bindShell() {
  document.addEventListener('click', e => {
    const pageEl = e.target.closest('[data-page]');
    if (pageEl) { navigate(pageEl.dataset.page); return; }
    if (e.target.id === 'logout-btn') { state.user = null; navigate('login'); }
  });
}

function renderPage() {
  const el = document.getElementById('page-content');
  if (!el) return;
  const pages = {
    dashboard: pageDashboard, 'my-humans': pageMyHumans, 'create-human': pageCreateHuman,
    generate: pageGenerate, 'ai-ads': pageAIAds, 'ai-presenter': pageAIPresenter,
    'ai-influencer': pageAIInfluencer, jobs: pageJobs, 'api-keys': pageAPIKeys,
    workers: pageWorkers, credits: pageCredits, admin: pageAdmin,
  };
  const fn = pages[state.page];
  if (fn) fn(el);
  else { el.innerHTML = `<div class="empty-state"><div class="icon">🚧</div><h3>Coming Soon</h3><p>This feature is being built.</p></div>`; }
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function pageDashboard(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const [dhRes, jobsRes] = await Promise.all([
      api('/api/digital-humans'),
      api('/api/jobs'),
    ]);
    state.digitalHumans = dhRes.digitalHumans || [];
    state.jobs = jobsRes.jobs || [];
    const completed = state.jobs.filter(j => j.status === 'complete').length;
    const inProgress = state.jobs.filter(j => j.status === 'processing' || j.status === 'queued').length;
    el.innerHTML = `
<div class="grid-4 mb-6">
  <div class="stat-card accent"><div class="stat-label">Digital Humans</div><div class="stat-value">${state.digitalHumans.length}</div><div class="stat-sub">Ready to generate</div></div>
  <div class="stat-card"><div class="stat-label">Videos Generated</div><div class="stat-value">${completed}</div><div class="stat-sub">Completed</div></div>
  <div class="stat-card"><div class="stat-label">In Queue</div><div class="stat-value">${inProgress}</div><div class="stat-sub">Processing now</div></div>
  <div class="stat-card"><div class="stat-label">Credits Left</div><div class="stat-value">${state.user.credits}</div><div class="stat-sub">${state.user.plan} plan</div></div>
</div>
${state.digitalHumans.length === 0 ? `
<div class="card" style="text-align:center;padding:48px">
  <div style="font-size:3rem;margin-bottom:16px">🧑‍💻</div>
  <h3 style="margin-bottom:8px">Create your first Digital Human</h3>
  <p class="text-muted" style="margin-bottom:24px">Upload your face and voice to start generating AI videos</p>
  <button class="btn btn-primary btn-lg" data-page="create-human">Create Digital Human</button>
</div>` : `
<div class="flex items-center justify-between mb-4">
  <div><div class="section-title">Your Digital Humans</div></div>
  <button class="btn btn-ghost btn-sm" data-page="my-humans">View all</button>
</div>
<div class="dh-grid">
  ${state.digitalHumans.slice(0, 4).map(renderDHCard).join('')}
  <div class="dh-add-card" data-page="create-human"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>New Digital Human</span></div>
</div>`}

${state.jobs.length > 0 ? `
<div class="flex items-center justify-between mb-4 mt-6">
  <div class="section-title">Recent Jobs</div>
  <button class="btn btn-ghost btn-sm" data-page="jobs">View all</button>
</div>
<div class="job-list">${state.jobs.slice(0, 3).map(renderJobCard).join('')}</div>` : ''}
`;
  } catch (e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── My Digital Humans ──────────────────────────────────────────────────────
async function pageMyHumans(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const { digitalHumans } = await api('/api/digital-humans');
    state.digitalHumans = digitalHumans;
    el.innerHTML = `
<div class="flex items-center justify-between mb-6">
  <div><div class="section-title">My Digital Humans</div><div class="section-sub">Manage your AI personas</div></div>
  <button class="btn btn-primary" data-page="create-human">+ New Digital Human</button>
</div>
${digitalHumans.length === 0 ? `<div class="empty-state"><div class="icon">🧑</div><h3>No digital humans yet</h3><p>Create your first digital human to start generating videos</p><button class="btn btn-primary" style="margin-top:16px" data-page="create-human">Create Digital Human</button></div>` : `
<div class="dh-grid">
  ${digitalHumans.map(renderDHCard).join('')}
  <div class="dh-add-card" data-page="create-human"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>New Digital Human</span></div>
</div>`}`;
    // Bind DH card clicks
    el.querySelectorAll('.dh-card').forEach(card => {
      card.addEventListener('click', () => { state.selectedDH = card.dataset.id; navigate('view-human'); });
    });
    el.querySelectorAll('.btn-danger').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete this Digital Human? This cannot be undone.')) return;
        try {
          await api(`/api/digital-humans/${btn.dataset.id}`, { method: 'DELETE' });
          toast('Digital Human deleted.', 'success');
          pageMyHumans(el);
        } catch(err) { toast(err.message, 'error'); }
      });
    });
  } catch (e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

function renderDHCard(dh) {
  const statusBadge = dh.status === 'ready' ? 'badge-green' : dh.status === 'taken_down' ? 'badge-red' : 'badge-yellow';
  const typeIcons = { self: '🧑', male: '👨', female: '👩', brand: '🏢', presenter: '🎤', teacher: '📚', salesperson: '💼', influencer: '⭐', support: '🎧' };
  return `<div class="dh-card" data-id="${dh.id}">
  <div class="dh-avatar"><span class="dh-avatar-placeholder">${typeIcons[dh.type] || '🧑'}</span></div>
  <div class="dh-card-body">
    <div class="dh-card-name">${escHtml(dh.name)}</div>
    <div class="dh-card-type">${dh.type} · ${dh.defaultVoice?.split('/').pop() || 'Default voice'}</div>
    <div class="dh-card-footer">
      <span class="badge ${statusBadge}">${dh.status}</span>
      <button class="btn btn-danger btn-sm" data-id="${dh.id}" onclick="event.stopPropagation()">Delete</button>
    </div>
  </div>
</div>`;
}

// ── Create Digital Human wizard ────────────────────────────────────────────
function pageCreateHuman(el) {
  let step = 1, dhData = { type: 'self', consentType: 'self' }, createdDH = null;

  function draw() {
    el.innerHTML = `
<div class="section-title mb-4">Create Digital Human</div>
<div class="steps">
  ${[['1','Identity'],['2','Consent'],['3','Face & Voice'],['4','Done']].map(([n, label], i) => {
    const s = i + 1;
    const cls = step > s ? 'done' : step === s ? 'active' : '';
    return `<div class="step ${cls}">
      <div class="step-dot">${step > s ? '✓' : n}</div>
      <div class="step-label">${label}</div>
      ${i < 3 ? '<div class="step-line"></div>' : ''}
    </div>`;
  }).join('')}
</div>
<div class="card" style="max-width:640px">
  ${step === 1 ? drawStep1() : step === 2 ? drawStep2() : step === 3 ? drawStep3() : drawStep4()}
</div>`;
    bindStepEvents();
  }

  function drawStep1() {
    return `
<h3 style="margin-bottom:4px">Identity</h3>
<p class="text-muted text-sm mb-6">Choose the type of digital human you want to create</p>
<div class="form-group"><label>Name your Digital Human</label>
  <input type="text" id="dh-name" placeholder="e.g. My Brand Avatar" value="${escHtml(dhData.name||'')}"></div>
<div class="form-group"><label>Type</label></div>
<div class="type-grid mb-6">
  ${[['self','🧑','My Digital Twin','Your own likeness'],['male','👨','Male Person','Custom male'],['female','👩','Female Person','Custom female'],['presenter','🎤','Presenter','Announce & present'],['teacher','📚','Teacher','Educate & train'],['salesperson','💼','Salesperson','Sell products'],['influencer','⭐','Influencer','Social media'],['brand','🏢','Brand Ambassador','Company persona']].map(([val,icon,label,desc]) => `
  <div class="type-card${dhData.type===val?' selected':''}" data-type="${val}">
    <div class="type-icon">${icon}</div>
    <div class="type-label">${label}</div>
    <div class="type-desc">${desc}</div>
  </div>`).join('')}
</div>
<div class="form-group"><label>Default Voice Style</label>
  <select id="dh-voice">
    <option value="en_US-amy-medium">Amy (US English, neutral)</option>
    <option value="en_US-lessac-medium">Lessac (US English, warm)</option>
    <option value="en_GB-alba-medium">Alba (British English)</option>
    <option value="en_US-ljspeech-medium">LJSpeech (US, clear)</option>
  </select></div>
<button class="btn btn-primary" id="step1-next">Continue →</button>`;
  }

  function drawStep2() {
    return `
<h3 style="margin-bottom:4px">Consent & Permissions</h3>
<p class="text-muted text-sm mb-6">This is required before we can create a digital human</p>
<div class="consent-box">
  <h4>⚠️ Important Consent Notice</h4>
  <p>Creating a Digital Human means generating AI video content using a face and voice identity. You must confirm that you have the right to use this identity.</p>
</div>
<div class="form-group"><label>Consent Type</label>
  <select id="consent-type">
    <option value="self">This is me — I am the person who will appear in these videos</option>
    <option value="licensed">I have written permission to use this person's likeness</option>
    <option value="synthetic">This is a fully synthetic/fictional person (no real human)</option>
  </select></div>
<div class="form-group"><label>Consent Note <span>(optional)</span></label>
  <textarea id="consent-note" placeholder="Describe your consent or authorization here..."></textarea></div>
<div class="checkbox-group mb-6">
  <input type="checkbox" id="consent-check">
  <label for="consent-check">I confirm I own or have written permission to use the face and voice I will upload. I agree not to use this for deception, fraud, impersonation, or any harmful purpose. I understand that all generated videos are stored and my usage is logged.</label>
</div>
<div class="flex gap-2">
  <button class="btn btn-ghost" id="step-back">← Back</button>
  <button class="btn btn-primary" id="step2-next" disabled>Continue →</button>
</div>`;
  }

  function drawStep3() {
    return `
<h3 style="margin-bottom:4px">Upload Face & Voice</h3>
<p class="text-muted text-sm mb-6">${createdDH ? `Digital Human "<b>${escHtml(createdDH.name)}</b>" created. Upload assets to activate.` : 'Upload a face photo and optionally a voice sample.'}</p>
${createdDH ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
<div>
  <label style="display:block;font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:8px">Face Photo or Video</label>
  <div class="upload-zone" id="face-drop">
    <div class="icon">🖼️</div>
    <p class="primary">Click to upload</p>
    <p>Photo (JPG, PNG) or video (MP4, MOV)</p>
    <p>Max 200MB</p>
    <input type="file" id="face-file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov" style="display:none">
  </div>
  <div id="face-status" style="margin-top:8px;font-size:.8rem;color:var(--text3)"></div>
</div>
<div>
  <label style="display:block;font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:8px">Voice Sample <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
  <div class="upload-zone" id="voice-drop">
    <div class="icon">🎙️</div>
    <p class="primary">Click to upload</p>
    <p>WAV, MP3, M4A (3–30 seconds recommended)</p>
    <input type="file" id="voice-file" accept=".wav,.mp3,.m4a,.ogg,.flac" style="display:none">
  </div>
  <div id="voice-status" style="margin-top:8px;font-size:.8rem;color:var(--text3)"></div>
</div>
</div>
<div class="flex gap-2 mt-6">
  <button class="btn btn-ghost" id="skip-to-4">Skip for now</button>
  <button class="btn btn-primary" id="step3-done">Done — View Digital Human →</button>
</div>` : '<div class="loader" style="margin:40px auto"></div>'}`;
  }

  function drawStep4() {
    return `
<div style="text-align:center;padding:32px 0">
  <div style="font-size:3rem;margin-bottom:16px">🎉</div>
  <h3 style="margin-bottom:8px">Digital Human Created!</h3>
  <p class="text-muted mb-6">${createdDH ? `"${escHtml(createdDH.name)}" is ready to use` : 'Your digital human is ready'}</p>
  <div class="flex gap-2" style="justify-content:center">
    <button class="btn btn-primary btn-lg" data-page="generate">Generate a Video Now</button>
    <button class="btn btn-ghost" data-page="my-humans">View All Digital Humans</button>
  </div>
</div>`;
  }

  function bindStepEvents() {
    // Type select
    el.querySelectorAll('.type-card').forEach(c => {
      c.addEventListener('click', () => {
        el.querySelectorAll('.type-card').forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        dhData.type = c.dataset.type;
      });
    });

    // Step 1 next
    const s1next = document.getElementById('step1-next');
    if (s1next) s1next.addEventListener('click', () => {
      const name = document.getElementById('dh-name')?.value.trim();
      if (!name) { toast('Please enter a name for your digital human.', 'error'); return; }
      dhData.name = name;
      dhData.defaultVoice = document.getElementById('dh-voice')?.value || 'en_US-amy-medium';
      step = 2; draw();
    });

    // Consent check
    const chk = document.getElementById('consent-check');
    const s2btn = document.getElementById('step2-next');
    if (chk && s2btn) {
      chk.addEventListener('change', () => { s2btn.disabled = !chk.checked; });
    }

    // Back
    const backBtn = document.getElementById('step-back');
    if (backBtn) backBtn.addEventListener('click', () => { step--; draw(); });

    // Step 2 next — create DH
    const s2next = document.getElementById('step2-next');
    if (s2next) s2next.addEventListener('click', async () => {
      dhData.consentType = document.getElementById('consent-type')?.value || 'self';
      dhData.consentNote = document.getElementById('consent-note')?.value || '';
      dhData.consentConfirmed = true;
      s2next.disabled = true; s2next.textContent = 'Creating…';
      try {
        const res = await api('/api/digital-humans', { method: 'POST', body: JSON.stringify(dhData) });
        createdDH = res.digitalHuman;
        state.digitalHumans = [createdDH, ...state.digitalHumans];
        step = 3; draw();
      } catch(e) { toast(e.message, 'error'); s2next.disabled = false; s2next.textContent = 'Continue →'; }
    });

    // Face upload
    const faceZone = document.getElementById('face-drop');
    const faceFile = document.getElementById('face-file');
    if (faceZone && faceFile) {
      faceZone.addEventListener('click', () => faceFile.click());
      faceFile.addEventListener('change', async () => {
        if (!faceFile.files[0]) return;
        const st = document.getElementById('face-status');
        st.textContent = 'Uploading…';
        try {
          await uploadFile(`/api/digital-humans/${createdDH.id}/upload-face`, faceFile.files[0]);
          st.textContent = '✅ Face uploaded successfully';
          st.style.color = 'var(--green)';
        } catch(e) { st.textContent = '❌ ' + e.message; st.style.color = 'var(--red)'; }
      });
    }

    // Voice upload
    const voiceZone = document.getElementById('voice-drop');
    const voiceFile = document.getElementById('voice-file');
    if (voiceZone && voiceFile) {
      voiceZone.addEventListener('click', () => voiceFile.click());
      voiceFile.addEventListener('change', async () => {
        if (!voiceFile.files[0]) return;
        const st = document.getElementById('voice-status');
        st.textContent = 'Uploading…';
        try {
          await uploadFile(`/api/digital-humans/${createdDH.id}/upload-voice`, voiceFile.files[0]);
          st.textContent = '✅ Voice uploaded successfully';
          st.style.color = 'var(--green)';
        } catch(e) { st.textContent = '❌ ' + e.message; st.style.color = 'var(--red)'; }
      });
    }

    const skipBtn = document.getElementById('skip-to-4');
    if (skipBtn) skipBtn.addEventListener('click', () => { step = 4; draw(); });
    const doneBtn = document.getElementById('step3-done');
    if (doneBtn) doneBtn.addEventListener('click', () => { step = 4; draw(); });
  }

  draw();
}

// ── Generate Video ─────────────────────────────────────────────────────────
async function pageGenerate(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const { digitalHumans } = await api('/api/digital-humans');
    state.digitalHumans = digitalHumans;

    if (digitalHumans.length === 0) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:2.5rem;margin-bottom:16px">🧑</div><h3>No Digital Humans Yet</h3><p class="text-muted mb-4">Create a digital human first before generating videos.</p><button class="btn btn-primary btn-lg" data-page="create-human">Create Digital Human</button></div>`;
      return;
    }

    const MODES = [
      { id: 'talking_head', icon: '💬', name: 'Talking Head', desc: 'Script to face video', cost: 5 },
      { id: 'presenter',    icon: '🎤', name: 'Presenter',    desc: 'Present content professionally', cost: 8 },
      { id: 'ad_video',     icon: '📢', name: 'Ad Video',     desc: 'Promotional / sales video', cost: 10 },
      { id: 'influencer',   icon: '⭐', name: 'AI Influencer',desc: 'Social media style video', cost: 8 },
      { id: 'intro',        icon: '▶️', name: 'Intro Clip',   desc: 'YouTube / TikTok intro', cost: 3 },
      { id: 'outro',        icon: '⏹️', name: 'Outro Clip',   desc: 'Call-to-action ending', cost: 3 },
      { id: 'podcast',      icon: '🎙️', name: 'Podcast Host', desc: 'Talk-show hosting style', cost: 6 },
      { id: 'course',       icon: '📚', name: 'Course Video', desc: 'Educational / teaching', cost: 8 },
    ];

    let selectedMode = 'talking_head';
    let selectedDH = digitalHumans[0]?.id || '';

    function draw() {
      el.innerHTML = `
<div class="flex gap-4" style="align-items:flex-start">
  <!-- Left: config -->
  <div style="flex:1;min-width:0">
    <div class="card mb-4">
      <div class="section-title mb-2">Choose Mode</div>
      <div class="mode-grid">${MODES.map(m => `
        <div class="mode-card${selectedMode===m.id?' selected':''}" data-mode="${m.id}">
          <div class="mode-icon">${m.icon}</div>
          <div class="mode-name">${m.name}</div>
          <div class="mode-cost">Cost: <span>${m.cost} credits</span></div>
        </div>`).join('')}
      </div>
    </div>
    <div class="card mb-4">
      <div class="section-title mb-4">Choose Digital Human</div>
      <div class="dh-grid" id="dh-select-grid">
        ${digitalHumans.map(dh => `<div class="dh-card${selectedDH===dh.id?' selected':''}" data-dh="${dh.id}" style="cursor:pointer">
          <div class="dh-avatar"><span class="dh-avatar-placeholder">🧑</span></div>
          <div class="dh-card-body"><div class="dh-card-name">${escHtml(dh.name)}</div><div class="dh-card-type">${dh.type}</div></div>
        </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="section-title mb-4">Video Content</div>
      <div class="form-group">
        <label>Script <span>(spoken text — or enter a topic to auto-write)</span></label>
        <textarea id="gen-script" rows="5" placeholder="Enter your script here, or describe a topic and click Auto-Write…"></textarea>
      </div>
      <div class="form-group">
        <label>Topic / Prompt <span>(optional — for AI script generation)</span></label>
        <input type="text" id="gen-prompt" placeholder="e.g. Introduce my digital marketing agency">
        <button class="btn btn-ghost btn-sm" id="auto-write-btn" style="margin-top:8px">✨ Auto-Write Script</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Duration</label>
          <select id="gen-dur">
            <option value="15">15 seconds</option>
            <option value="30" selected>30 seconds</option>
            <option value="45">45 seconds</option>
            <option value="60">60 seconds</option>
          </select>
        </div>
        <div class="form-group"><label>Format</label>
          <select id="gen-format">
            <option value="9:16">9:16 Portrait (TikTok/Reels/Shorts)</option>
            <option value="16:9">16:9 Landscape (YouTube)</option>
            <option value="1:1">1:1 Square (Instagram)</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Tone</label>
        <select id="gen-tone">
          <option value="professional">Professional</option>
          <option value="casual">Casual & Friendly</option>
          <option value="energetic">High Energy</option>
          <option value="calm">Calm & Trustworthy</option>
          <option value="motivational">Motivational</option>
          <option value="luxury">Luxury & Premium</option>
        </select>
      </div>
      <button class="btn btn-primary btn-lg btn-full" id="gen-submit">🎬 Generate Video</button>
    </div>
  </div>
  <!-- Right: live cost -->
  <div style="width:260px;flex-shrink:0">
    <div class="card mb-4">
      <div class="section-title mb-3">Generation Cost</div>
      <div style="font-size:2rem;font-weight:800;color:var(--accent2)" id="cost-display">${MODES.find(m=>m.id===selectedMode)?.cost || 5} cr</div>
      <p class="text-muted text-sm">You have <strong style="color:var(--text1)">${state.user.credits}</strong> credits</p>
    </div>
    <div class="card">
      <div class="section-title mb-3">What to expect</div>
      <ul style="color:var(--text3);font-size:.8rem;line-height:2;list-style:none">
        <li>✅ Face-synced lip movement</li>
        <li>✅ AI voice generation</li>
        <li>✅ Word-level captions</li>
        <li>✅ 9:16 portrait format</li>
        <li>⏱️ ~2–5 min generation time</li>
        <li>🔧 Requires FFmpeg & workers</li>
      </ul>
    </div>
  </div>
</div>`;
      bindGenEvents();
    }

    function bindGenEvents() {
      el.querySelectorAll('.mode-card').forEach(c => {
        c.addEventListener('click', () => {
          el.querySelectorAll('.mode-card').forEach(x => x.classList.remove('selected'));
          c.classList.add('selected');
          selectedMode = c.dataset.mode;
          const cost = MODES.find(m => m.id === selectedMode)?.cost || 5;
          const cd = document.getElementById('cost-display');
          if (cd) cd.textContent = `${cost} cr`;
        });
      });
      el.querySelectorAll('.dh-card').forEach(c => {
        c.addEventListener('click', () => {
          el.querySelectorAll('[data-dh]').forEach(x => x.classList.remove('selected'));
          c.classList.add('selected');
          selectedDH = c.dataset.dh;
        });
      });

      const autoBtn = document.getElementById('auto-write-btn');
      if (autoBtn) autoBtn.addEventListener('click', async () => {
        const prompt = document.getElementById('gen-prompt')?.value.trim();
        if (!prompt) { toast('Enter a topic first.', 'error'); return; }
        autoBtn.disabled = true; autoBtn.textContent = '✨ Writing…';
        const dur = Number(document.getElementById('gen-dur')?.value || 30);
        const words = Math.round(dur * 2.5);
        const script = `Welcome. Today I want to talk to you about ${prompt}. This is something that can genuinely change how you think about your work. Here is what you need to know. ${prompt} is more important than ever in 2026. Let me break it down for you simply and clearly. By the end of this video, you will have everything you need. Stay with me.`.split(' ').slice(0, words).join(' ') + '.';
        const scriptEl = document.getElementById('gen-script');
        if (scriptEl) scriptEl.value = script;
        autoBtn.disabled = false; autoBtn.textContent = '✨ Auto-Write Script';
        toast('Script generated! Edit as needed.', 'success');
      });

      const submitBtn = document.getElementById('gen-submit');
      if (submitBtn) submitBtn.addEventListener('click', async () => {
        if (!selectedDH) { toast('Select a digital human first.', 'error'); return; }
        const script = document.getElementById('gen-script')?.value.trim();
        const prompt = document.getElementById('gen-prompt')?.value.trim();
        if (!script && !prompt) { toast('Enter a script or topic to generate.', 'error'); return; }
        const fmt = document.getElementById('gen-format')?.value || '9:16';
        const dims = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] }[fmt];
        submitBtn.disabled = true; submitBtn.textContent = '⏳ Submitting…';
        try {
          const res = await api('/api/videos/generate', { method: 'POST', body: JSON.stringify({
            digitalHumanId: selectedDH, mode: selectedMode, script, prompt,
            durationSec: Number(document.getElementById('gen-dur')?.value || 30),
            tone: document.getElementById('gen-tone')?.value || 'professional',
            outputW: dims[0], outputH: dims[1],
          })});
          toast('Video job started! Redirecting to jobs…', 'success');
          setTimeout(() => navigate('jobs'), 1200);
        } catch(e) { toast(e.message, 'error'); submitBtn.disabled = false; submitBtn.textContent = '🎬 Generate Video'; }
      });
    }
    draw();
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── AI Ads ─────────────────────────────────────────────────────────────────
async function pageAIAds(el) {
  const { digitalHumans } = await api('/api/digital-humans').catch(() => ({ digitalHumans: [] }));
  el.innerHTML = `
<div class="section-title mb-2">AI Ad Videos</div>
<div class="section-sub">Generate product ads and promotional videos using your digital human</div>
<div class="grid-2">
  <div class="card">
    <div style="font-size:2rem;margin-bottom:12px">📦</div>
    <div class="font-bold mb-2">Product Ad</div>
    <p class="text-muted text-sm mb-4">Your digital human presents a product with a persuasive script</p>
    ${digitalHumans.length ? `<div class="form-group"><label>Digital Human</label>
      <select id="ad-dh">${digitalHumans.map(dh=>`<option value="${dh.id}">${escHtml(dh.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Product / Service</label><input type="text" id="ad-product" placeholder="e.g. Premium fitness supplements"></div>
    <div class="form-group"><label>Key Message</label><textarea id="ad-msg" rows="3" placeholder="What makes this product special?"></textarea></div>
    <button class="btn btn-primary" id="make-ad-btn">Generate Ad Video (10 cr)</button>` : '<button class="btn btn-ghost" data-page="create-human">Create Digital Human First</button>'}
  </div>
  <div class="card">
    <div style="font-size:2rem;margin-bottom:12px">🌐</div>
    <div class="font-bold mb-2">Coming Soon</div>
    <p class="text-muted text-sm mb-4">URL to ad — paste a product URL and we'll scrape the content and generate an ad automatically</p>
    <div class="badge badge-yellow">Phase 2</div>
  </div>
</div>`;

  const makeAdBtn = document.getElementById('make-ad-btn');
  if (makeAdBtn) makeAdBtn.addEventListener('click', async () => {
    const dhId = document.getElementById('ad-dh')?.value;
    const product = document.getElementById('ad-product')?.value.trim();
    const msg = document.getElementById('ad-msg')?.value.trim();
    if (!dhId || !product) { toast('Select a digital human and enter the product.', 'error'); return; }
    makeAdBtn.disabled = true; makeAdBtn.textContent = 'Submitting…';
    try {
      await api('/api/videos/generate', { method: 'POST', body: JSON.stringify({ digitalHumanId: dhId, mode: 'ad_video', prompt: `Create a persuasive 30-second ad for: ${product}. Key message: ${msg}` }) });
      toast('Ad job queued!', 'success');
      setTimeout(() => navigate('jobs'), 1000);
    } catch(e) { toast(e.message, 'error'); makeAdBtn.disabled = false; makeAdBtn.textContent = 'Generate Ad Video (10 cr)'; }
  });
}

// ── AI Presenter / Influencer ──────────────────────────────────────────────
async function pageAIPresenter(el) {
  el.innerHTML = `<div class="section-title mb-2">AI Presenter</div><div class="section-sub">Generate professional presenter videos from scripts, slides, or articles</div>
<div class="grid-2">
  <div class="card"><div style="font-size:2rem;margin-bottom:12px">📄</div><div class="font-bold mb-2">Script to Presenter</div><p class="text-muted text-sm mb-3">Type or paste a script and generate a presenter video</p><button class="btn btn-primary" data-page="generate">Go to Generator</button></div>
  <div class="card"><div style="font-size:2rem;margin-bottom:12px">🔮</div><div class="font-bold mb-2">Coming in Phase 2</div><p class="text-muted text-sm mb-3">PDF/Slides to presenter, Blog to video, URL to video, Real-time teleprompter</p><div class="badge badge-yellow">Phase 2</div></div>
</div>`;
}

async function pageAIInfluencer(el) {
  el.innerHTML = `<div class="section-title mb-2">AI Influencer</div><div class="section-sub">Create authentic social media content with your digital human</div>
<div class="grid-2">
  <div class="card"><div style="font-size:2rem;margin-bottom:12px">📱</div><div class="font-bold mb-2">TikTok/Reels Style</div><p class="text-muted text-sm mb-3">Generate trending social content in portrait format</p><button class="btn btn-primary" data-page="generate">Generate Now</button></div>
  <div class="card"><div style="font-size:2rem;margin-bottom:12px">🔮</div><div class="font-bold mb-2">Phase 2 Features</div><p class="text-muted text-sm mb-3">Trend-aware content, auto hashtags, scheduling, engagement hooks</p><div class="badge badge-yellow">Phase 2</div></div>
</div>`;
}

// ── Jobs ───────────────────────────────────────────────────────────────────
async function pageJobs(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  const load = async () => {
    try {
      const { jobs } = await api('/api/jobs');
      state.jobs = jobs;
      const hasActive = jobs.some(j => j.status === 'processing' || j.status === 'queued');
      el.innerHTML = `
<div class="flex items-center justify-between mb-6">
  <div><div class="section-title">Video Jobs</div><div class="section-sub">${jobs.length} total job${jobs.length!==1?'s':''}</div></div>
  ${hasActive ? '<span class="badge badge-blue">🔄 Processing…</span>' : ''}
</div>
${jobs.length === 0 ? `<div class="empty-state"><div class="icon">📋</div><h3>No jobs yet</h3><p>Generate a video to see jobs here</p><button class="btn btn-primary" style="margin-top:16px" data-page="generate">Generate Video</button></div>` : `<div class="job-list">${jobs.map(renderJobCard).join('')}</div>`}`;

      // Bind job actions
      el.querySelectorAll('[data-retry]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try { await api(`/api/jobs/${btn.dataset.retry}/retry`, { method: 'POST' }); toast('Job retrying…', 'success'); load(); } catch(e) { toast(e.message, 'error'); }
        });
      });
      el.querySelectorAll('[data-delete-job]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this job?')) return;
          try { await api(`/api/jobs/${btn.dataset.deleteJob}`, { method: 'DELETE' }); toast('Job deleted.', 'success'); load(); } catch(e) { toast(e.message, 'error'); }
        });
      });

      if (hasActive) { state.pollTimer = setTimeout(load, 4000); }
    } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
  };
  load();
}

function renderJobCard(job) {
  const dh = state.digitalHumans.find(h => h.id === job.digitalHumanId);
  const statusBadge = { complete: 'badge-green', failed: 'badge-red', processing: 'badge-blue', queued: 'badge-yellow' }[job.status] || 'badge-gray';
  const pct = job.progress || 0;
  const fillClass = job.status === 'complete' ? 'complete' : job.status === 'failed' ? 'failed' : '';
  return `<div class="job-card">
  <div class="job-card-header">
    <div class="job-card-title">${escHtml(dh?.name || 'Digital Human')} — ${job.mode?.replace(/_/g,' ') || 'video'}</div>
    <span class="badge ${statusBadge}">${job.status}</span>
  </div>
  <div class="job-card-meta">Stage: ${job.stage || '—'} · ${new Date(job.createdAt).toLocaleString()}</div>
  <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${pct}%"></div></div>
  ${job.error ? `<div class="error-box">${escHtml(job.error)}</div>` : ''}
  <div class="job-actions">
    ${job.status === 'complete' && job.outputPath ? `<a href="${job.outputPath}" download class="btn btn-success btn-sm">⬇ Download</a>
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('vid-${job.id}').style.display='block';this.style.display='none'">▶ Preview</button>` : ''}
    ${job.status === 'failed' ? `<button class="btn btn-primary btn-sm" data-retry="${job.id}">↺ Retry</button>` : ''}
    <button class="btn btn-danger btn-sm" data-delete-job="${job.id}">✕ Delete</button>
  </div>
  ${job.status === 'complete' && job.outputPath ? `<div id="vid-${job.id}" style="display:none;margin-top:12px"><video src="${job.outputPath}" controls style="width:100%;max-width:360px;border-radius:8px"></video></div>` : ''}
</div>`;
}

// ── Workers ────────────────────────────────────────────────────────────────
async function pageWorkers(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const health = await api('/api/workers/health');
    el.innerHTML = `
<div class="section-title mb-2">Worker Status</div>
<div class="section-sub">Local AI worker health — Runtime: <strong>${health.mode}</strong> · Queue: ${health.queueDepth} · Active: ${health.activeRenders}</div>
<div class="health-grid mb-6">
  ${Object.entries(health.checks || {}).map(([name, info]) => {
    const ok = info.ok === true || (name === 'memory' && info.freeMB !== null) || (name === 'cpu' && info.cores);
    const dot = name === 'gpu' ? (info.available ? 'ok' : 'warn') : (ok ? 'ok' : 'fail');
    const detail = info.version || info.error || (name==='memory' ? `${info.freeMB||'?'} MB free` : name==='cpu' ? `${info.cores||'?'} cores` : name==='gpu' ? info.note : (info.model ? '✓ model found' : ''));
    return `<div class="health-item"><div class="health-item-name"><span class="health-dot ${dot}"></span>${name}</div><div class="health-detail">${escHtml(String(detail||''))}</div></div>`;
  }).join('')}
</div>
<div class="card">
  <div class="section-title mb-3">Setup Instructions</div>
  <div style="font-size:.85rem;line-height:1.8;color:var(--text2)">
    <p><strong>FFmpeg</strong>: brew install ffmpeg-full</p>
    <p><strong>Python 3.9</strong>: Required for AI workers</p>
    <p><strong>Piper TTS</strong>: pip install piper-phonemize — then run: <code>./setup.sh piper</code></p>
    <p><strong>Wav2Lip</strong>: Run <code>./setup.sh wav2lip</code> to clone and set up locally (~2GB)</p>
    <p><strong>MediaPipe</strong>: pip3.9 install mediapipe</p>
    <p><strong>PyTorch</strong>: pip3.9 install torch torchvision (for Wav2Lip/SadTalker)</p>
  </div>
  <button class="btn btn-ghost btn-sm mt-4" id="refresh-health">↻ Refresh</button>
</div>`;
    document.getElementById('refresh-health')?.addEventListener('click', () => pageWorkers(el));
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── API Keys ───────────────────────────────────────────────────────────────
async function pageAPIKeys(el) {
  el.innerHTML = `<div class="loader" style="margin:40px auto"></div>`;
  try {
    const { apiKeys } = await api('/api/api-keys');
    el.innerHTML = `
<div class="flex items-center justify-between mb-6">
  <div><div class="section-title">API Keys</div><div class="section-sub">Use these to call the Digital Human API from ClipForge or other apps</div></div>
  <button class="btn btn-primary" id="create-key-btn">+ Create API Key</button>
</div>
<div class="card mb-4">
  <div class="section-title mb-3">API Endpoints (for ClipForge integration)</div>
  <div style="font-size:.82rem;color:var(--text3);line-height:2">
    <code>POST /api/videos/generate</code> — Generate any video type<br>
    <code>POST /api/clipforge/generate-intro</code> — AI intro clip<br>
    <code>POST /api/clipforge/generate-outro</code> — AI outro clip<br>
    <code>POST /api/clipforge/generate-presenter</code> — Presenter video<br>
    <code>POST /api/clipforge/generate-ad</code> — Ad video<br>
    <code>GET /api/jobs/:id</code> — Check job status<br>
    <code>GET /api/workers/health</code> — Worker health check
  </div>
</div>
${apiKeys.length === 0 ? `<div class="empty-state"><div class="icon">🔑</div><h3>No API keys yet</h3><p>Create an API key to integrate with ClipForge or other platforms</p></div>` : `
<div class="card"><table class="table">
  <thead><tr><th>Name</th><th>Key</th><th>Created</th><th></th></tr></thead>
  <tbody>${apiKeys.map(k => `<tr><td>${escHtml(k.name)}</td><td><code>${escHtml(k.key)}</code></td><td>${new Date(k.createdAt).toLocaleDateString()}</td><td><button class="btn btn-danger btn-sm" data-del-key="${k.id}">Delete</button></td></tr>`).join('')}</tbody>
</table></div>`}`;

    document.getElementById('create-key-btn')?.addEventListener('click', async () => {
      const name = prompt('API key name:', 'ClipForge Integration');
      if (!name) return;
      try {
        const { apiKey } = await api('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
        toast(`Key created: ${apiKey.key}`, 'success');
        pageAPIKeys(el);
      } catch(e) { toast(e.message, 'error'); }
    });
    el.querySelectorAll('[data-del-key]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this API key?')) return;
        try { await api(`/api/api-keys/${btn.dataset.delKey}`, { method: 'DELETE' }); toast('Key deleted.', 'success'); pageAPIKeys(el); } catch(e) { toast(e.message, 'error'); }
      });
    });
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── Credits ────────────────────────────────────────────────────────────────
async function pageCredits(el) {
  try {
    const { credits, plan, transactions } = await api('/api/credits/status');
    el.innerHTML = `
<div class="section-title mb-6">Credits & Billing</div>
<div class="grid-2 mb-6">
  <div class="stat-card accent"><div class="stat-label">Credits Remaining</div><div class="stat-value">${credits}</div><div class="stat-sub">${plan} plan</div></div>
  <div class="card"><div class="section-title mb-3">Plans</div>
    ${[['free','Free','30 cr/mo','$0'],['starter','Starter','200 cr/mo','$19'],['pro','Pro','600 cr/mo','$49'],['enterprise','Enterprise','2000 cr/mo','$149']].map(([id,label,cr,price])=>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <span>${label} — ${cr}</span><span style="color:var(--accent2);font-weight:700">${price}</span>
        ${id===plan?'<span class="badge badge-green">Current</span>':'<button class="btn btn-ghost btn-sm">Upgrade</button>'}
      </div>`).join('')}
  </div>
</div>
<div class="card">
  <div class="section-title mb-3">Credit Cost Reference</div>
  <div class="grid-4" style="gap:8px">
    ${[['Talking Head','5 cr'],['Presenter','8 cr'],['AI Ad','10 cr'],['Influencer','8 cr'],['Podcast','6 cr'],['Course Video','8 cr'],['Intro Clip','3 cr'],['Outro Clip','3 cr']].map(([n,c])=>`<div class="card-sm" style="text-align:center"><div style="font-size:.8rem;font-weight:600">${n}</div><div style="font-size:.75rem;color:var(--accent2);font-weight:700;margin-top:4px">${c}</div></div>`).join('')}
  </div>
</div>
${transactions?.length ? `<div class="card mt-4"><div class="section-title mb-3">Recent Transactions</div><table class="table"><thead><tr><th>Date</th><th>Description</th><th>Credits</th></tr></thead><tbody>${transactions.map(t=>`<tr><td>${new Date(t.createdAt).toLocaleDateString()}</td><td>${escHtml(t.reason||'')}</td><td style="color:${t.amount<0?'var(--red)':'var(--green)'}">${t.amount>0?'+':''}${t.amount}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── Admin ──────────────────────────────────────────────────────────────────
async function pageAdmin(el) {
  if (state.user?.role !== 'admin') { el.innerHTML = `<div class="error-box">Admin access required.</div>`; return; }
  el.innerHTML = `<div class="loader" style="margin:40px auto"></div>`;
  try {
    const [overview, users, jobs, dhs] = await Promise.all([
      api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/jobs'), api('/api/admin/digital-humans'),
    ]);
    el.innerHTML = `
<div class="section-title mb-6">Admin Panel</div>
<div class="grid-4 mb-6">
  <div class="stat-card"><div class="stat-label">Users</div><div class="stat-value">${overview.users}</div></div>
  <div class="stat-card"><div class="stat-label">Digital Humans</div><div class="stat-value">${overview.digitalHumans}</div></div>
  <div class="stat-card"><div class="stat-label">Jobs</div><div class="stat-value">${overview.videoJobs}</div></div>
  <div class="stat-card"><div class="stat-label">Queue</div><div class="stat-value">${overview.queueDepth}</div></div>
</div>
<div class="card mb-4">
  <div class="section-title mb-3">Users</div>
  <table class="table"><thead><tr><th>Name</th><th>Email</th><th>Plan</th><th>Credits</th><th>Role</th><th></th></tr></thead>
  <tbody>${(users.users||[]).map(u=>`<tr>
    <td>${escHtml(u.name||'')}</td><td>${escHtml(u.email)}</td>
    <td><span class="badge badge-purple">${u.plan}</span></td>
    <td>${u.credits}</td>
    <td><span class="badge ${u.role==='admin'?'badge-red':'badge-gray'}">${u.role}</span></td>
    <td><button class="btn btn-ghost btn-sm" data-add-credits="${u.id}">+Credits</button></td>
  </tr>`).join('')}</tbody></table>
</div>
<div class="card mb-4">
  <div class="section-title mb-3">Recent Jobs</div>
  <table class="table"><thead><tr><th>ID</th><th>Mode</th><th>Status</th><th>Created</th></tr></thead>
  <tbody>${(jobs.jobs||[]).slice(0,20).map(j=>`<tr>
    <td style="font-family:monospace;font-size:.72rem">${j.id.slice(0,8)}</td>
    <td>${j.mode||'—'}</td>
    <td><span class="badge ${{ complete:'badge-green',failed:'badge-red',processing:'badge-blue',queued:'badge-yellow' }[j.status]||'badge-gray'}">${j.status}</span></td>
    <td>${new Date(j.createdAt).toLocaleDateString()}</td>
  </tr>`).join('')}</tbody></table>
</div>
<div class="card">
  <div class="section-title mb-3">Digital Humans</div>
  <table class="table"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>User</th><th></th></tr></thead>
  <tbody>${(dhs.digitalHumans||[]).map(dh=>`<tr>
    <td>${escHtml(dh.name)}</td><td>${dh.type}</td>
    <td><span class="badge ${{ready:'badge-green',taken_down:'badge-red',draft:'badge-yellow'}[dh.status]||'badge-gray'}">${dh.status}</span></td>
    <td style="font-size:.75rem;color:var(--text3)">${dh.userId?.slice(0,8)}</td>
    <td>${dh.status!=='taken_down'?`<button class="btn btn-danger btn-sm" data-takedown="${dh.id}">Takedown</button>`:''}</td>
  </tr>`).join('')}</tbody></table>
</div>`;

    el.querySelectorAll('[data-add-credits]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const amt = Number(prompt('Credits to add (use negative to remove):', '50'));
        if (isNaN(amt)) return;
        try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId: btn.dataset.addCredits, creditDelta: amt }) }); toast('Credits updated.', 'success'); pageAdmin(el); } catch(e) { toast(e.message, 'error'); }
      });
    });
    el.querySelectorAll('[data-takedown]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Takedown reason:');
        if (!reason) return;
        try { await api(`/api/admin/digital-humans/${btn.dataset.takedown}/takedown`, { method: 'POST', body: JSON.stringify({ reason }) }); toast('Digital human taken down.', 'success'); pageAdmin(el); } catch(e) { toast(e.message, 'error'); }
      });
    });
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── Utils ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
const toastsDiv = document.createElement('div');
toastsDiv.id = 'toasts';
document.body.appendChild(toastsDiv);
render();
