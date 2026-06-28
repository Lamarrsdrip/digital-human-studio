// Digital Human Studio — Frontend

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  user: null,
  token: localStorage.getItem('dhs_token') || null,
  page: 'login',
  pendingPage: null,
  digitalHumans: [],
  jobs: [],
  workerHealth: null,
  selectedDH: null,
  pollTimer: null,
};

function uid() { return state.user?.id || ''; }

// ── API helper ─────────────────────────────────────────────────────────────
function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  return fetch(path, { ...opts, headers })
    .then(async r => {
      if (r.status === 401) {
        state.user = null; state.token = null;
        localStorage.removeItem('dhs_token');
        render();
        throw new Error('Session expired. Please sign in again.');
      }
      const text = await r.text();
      let d;
      try { d = JSON.parse(text); } catch { throw new Error('Server returned unexpected response. Try again.'); }
      if (d.error) throw new Error(d.error);
      return d;
    });
}

function uploadFile(path, file, extraFields = {}) {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  return fetch(path, { method: 'POST', headers, body: form })
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

// ── Quality level helpers ────────────────────────────────────────────────────
const QUALITY_META = {
  1: { cls: 'quality-1', label: 'Static Fallback ⚠', short: 'Static Fallback' },
  2: { cls: 'quality-2', label: 'Talking Head',       short: 'Talking Head' },
  3: { cls: 'quality-3', label: 'AI Motion',          short: 'AI Motion Video' },
  4: { cls: 'quality-4', label: 'Full Scene AI',      short: 'Full Scene Video' },
  5: { cls: 'quality-5', label: 'Custom GPU',         short: 'Custom GPU Model' },
};
function qualityBadge(level, extra = '') {
  const m = QUALITY_META[level] || QUALITY_META[1];
  return `<span class="quality-level-badge ${m.cls}">Level ${level || 1}: ${m.label}${extra}</span>`;
}

// ── Router ─────────────────────────────────────────────────────────────────
const VALID_PAGES = ['dashboard','my-humans','create-human','create-twin','create-fictional',
  'view-human','generate','ai-ads','ai-presenter','ai-influencer','jobs','api-keys',
  'workers','credits','profile','settings','admin'];

function navigate(page, params = {}) {
  state.page = page;
  state.params = params;
  clearInterval(state.pollTimer);
  // Persist page in URL hash so refresh restores same page
  try {
    if (history.replaceState) history.replaceState(null, '', '#' + page);
    else location.hash = page;
  } catch(e) {}
  render();
}

window.addEventListener('popstate', () => {
  const hash = location.hash.replace('#', '').trim();
  if (hash && state.user && VALID_PAGES.includes(hash)) {
    state.page = hash;
    render();
  }
});

function render() {
  const hp = document.getElementById('homepage');
  const shell = document.getElementById('app-shell');
  const app = document.getElementById('app');

  if (!state.user) {
    // Show homepage, hide shell
    if (hp) { hp.style.display = ''; }
    if (shell) { shell.style.display = 'none'; }
    // If no homepage element, fall back to inline auth
    if (!hp) { app.innerHTML = renderAuth(); bindAuth(); }
    else bindHomepage();
    return;
  }

  // Logged in — hide homepage, show shell
  if (hp) hp.style.display = 'none';
  if (shell) {
    shell.style.display = '';
    shell.innerHTML = renderShellHtml();
    bindShell();
    renderPage();
  } else {
    app.innerHTML = renderShell();
    bindShell();
    renderPage();
  }
}

function showAuthForm(redirectPage = 'dashboard') {
  state.pendingPage = redirectPage;
  const hp = document.getElementById('homepage');
  const shell = document.getElementById('app-shell');
  if (hp) hp.style.display = 'none';
  if (shell) { shell.style.display = ''; shell.innerHTML = renderAuth(); bindAuth(redirectPage); }
}

function bindHomepage() {
  const tryBind = (id, fn) => { const el = document.getElementById(id); if (el && !el._bound) { el._bound = true; el.addEventListener('click', fn); } };

  const goToPage = (page) => {
    if (state.user) { navigate(page); }
    else { showAuthForm(page); }
  };

  tryBind('hp-login-btn', () => showAuthForm('dashboard'));
  tryBind('hp-signup-btn', () => showAuthForm('dashboard'));
  tryBind('hero-login-btn', () => showAuthForm('dashboard'));
  tryBind('hero-start-btn', () => showAuthForm('dashboard'));
  tryBind('cta-start-btn', () => showAuthForm('dashboard'));
  tryBind('plan-free-btn', () => showAuthForm('dashboard'));
  tryBind('plan-starter-btn', () => showAuthForm('dashboard'));
  tryBind('plan-pro-btn', () => showAuthForm('dashboard'));
  tryBind('plan-ent-btn', () => showAuthForm('dashboard'));

  // New 2026 homepage CTAs
  tryBind('hero-camera-btn', () => goToPage('create-twin'));
  tryBind('hero-twin-btn', () => goToPage('create-twin'));
  tryBind('hero-upload-btn', () => goToPage('create-fictional'));
  tryBind('hero-fictional-btn', () => goToPage('create-fictional'));
  tryBind('cta-camera-btn', () => goToPage('create-twin'));
  tryBind('cta-login-btn', () => showAuthForm('dashboard'));
  tryBind('footer-camera-btn', (e) => { e.preventDefault(); goToPage('create-twin'); });
  tryBind('footer-upload-btn', (e) => { e.preventDefault(); goToPage('create-human'); });
  tryBind('footer-gen-btn', (e) => { e.preventDefault(); goToPage('create-fictional'); });

  // data-goto buttons (pricing plan cards, creation path cards)
  document.querySelectorAll('[data-goto]').forEach(btn => {
    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => goToPage(btn.dataset.goto || 'dashboard'));
    }
  });
}

function renderShell() {
  const shell = document.getElementById('app-shell');
  if (shell) {
    shell.style.display = '';
    shell.innerHTML = renderShellHtml();
    return;
  }
  // Fallback for old single-div mode
  const app = document.getElementById('app');
  app.innerHTML = renderShellHtml();
}

// renderShellHtml is defined further below (renamed from old renderShell)

// ── Auth ───────────────────────────────────────────────────────────────────
function renderAuth() {
  return `
<div class="auth-wrap">
  <div class="auth-card">
    <div class="auth-logo">
      <h1>Digital Human OS</h1>
      <p>Create your AI digital twin</p>
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

function bindAuth(redirectPage = 'dashboard') {
  const container = document.getElementById('app-shell') || document.getElementById('app');
  container.addEventListener('submit', async e => {
    if (e.target.id === 'login-form') {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('login-email').value, password: document.getElementById('login-password').value }) });
        if (res.token) { state.token = res.token; localStorage.setItem('dhs_token', res.token); }
        state.user = res.user;
        navigate(state.pendingPage || redirectPage || 'dashboard');
        state.pendingPage = null;
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; }
    }
    if (e.target.id === 'signup-form') {
      e.preventDefault();
      const btn = document.getElementById('signup-btn');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const res = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: document.getElementById('signup-name').value, email: document.getElementById('signup-email').value, password: document.getElementById('signup-password').value }) });
        if (res.token) { state.token = res.token; localStorage.setItem('dhs_token', res.token); }
        state.user = res.user;
        navigate(state.pendingPage || redirectPage || 'dashboard');
        state.pendingPage = null;
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Create Account'; }
    }
  });
  container.addEventListener('click', e => {
    if (e.target.id === 'show-signup') { e.preventDefault(); document.getElementById('auth-form').innerHTML = renderSignupForm(); }
    if (e.target.id === 'show-login') { e.preventDefault(); document.getElementById('auth-form').innerHTML = renderLoginForm(); }
  });
}

// ── Shell ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',        icon: '⬛', label: 'Dashboard',            section: null },
  { id: 'my-humans',        icon: '🧑', label: 'My Digital Humans',    section: 'CREATE' },
  { id: 'create-twin',      icon: '📸', label: 'AI Twin (Camera)',     section: null },
  { id: 'create-human',     icon: '📁', label: 'Upload & Create',      section: null },
  { id: 'create-fictional', icon: '✨', label: 'Gen from Prompt',      section: null },
  { id: 'generate',         icon: '🎬', label: 'Generate Video',       section: 'GENERATE' },
  { id: 'ai-ads',           icon: '📢', label: 'AI Ads',               section: null },
  { id: 'ai-presenter',     icon: '🎤', label: 'AI Presenter',         section: null },
  { id: 'ai-influencer',    icon: '⭐', label: 'AI Influencer',        section: null },
  { id: 'jobs',             icon: '📋', label: 'Video Jobs',           section: 'HISTORY' },
  { id: 'api-keys',         icon: '🔑', label: 'API Keys',             section: 'DEVELOPER' },
  { id: 'workers',          icon: '⚙️', label: 'Worker Status',        section: null },
  { id: 'credits',          icon: '💳', label: 'Credits & Billing',    section: 'ACCOUNT' },
  { id: 'profile',          icon: '👤', label: 'My Profile',           section: null },
  { id: 'settings',         icon: '⚙️', label: 'Settings',             section: 'ACCOUNT' },
  { id: 'admin',            icon: '🛡️', label: 'Admin Panel',          section: null, adminOnly: true },
];

function renderShellHtml() {
  const user = state.user;
  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Primary nav items shown in bottom bar on mobile (max 5 visible)
  const PRIMARY_NAV = [
    { id: 'dashboard',   icon: '🏠', label: 'Home'    },
    { id: 'my-humans',   icon: '🧑', label: 'Humans'  },
    { id: 'create-twin', icon: '📸', label: 'AI Twin' },
    { id: 'generate',    icon: '🎬', label: 'Create'  },
    { id: 'jobs',        icon: '📋', label: 'Jobs'    },
    { id: 'profile',     icon: '👤', label: 'Profile' },
  ];
  if (user.role === 'admin') PRIMARY_NAV.push({ id: 'admin', icon: '🛡️', label: 'Admin' });

  const mobileNavHtml = PRIMARY_NAV.map(n => `
    <div class="nav-item${state.page === n.id ? ' active' : ''}" data-page="${n.id}">
      <span class="icon">${n.icon}</span>${n.label}
    </div>`).join('');

  // Full sidebar nav (desktop only)
  const NAV_ALL = NAV_ITEMS.filter(n => !n.adminOnly || user.role === 'admin');
  let lastSection = null;
  const desktopNavHtml = NAV_ALL.map(n => {
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

  return `
<div id="toasts"></div>
<div class="shell">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <h2>Digital Human OS</h2>
      <span>AI Twin Platform</span>
    </div>
    <!-- Desktop: full nav; Mobile: compact 5-tab nav via CSS -->
    <nav class="sidebar-nav" id="desktop-nav">${desktopNavHtml}</nav>
    <nav class="sidebar-nav" id="mobile-nav" style="display:none">${mobileNavHtml}</nav>
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
        <span class="credit-badge" style="margin-right:4px">${user.credits} cr</span>
        <button class="btn btn-primary btn-sm" data-page="generate">+ Video</button>
        <div class="topbar-avatar" data-page="profile" title="Profile / Sign Out">${initials}</div>
      </div>
    </div>
    <div class="page" id="page-content"></div>
  </div>
</div>`;
}

function getPageTitle() {
  const titles = {
    dashboard: 'Dashboard', 'my-humans': 'My Digital Humans',
    'create-twin': 'Create AI Twin', 'create-human': 'Upload & Create',
    'create-fictional': 'Generate AI Human', 'view-human': 'Digital Human',
    generate: 'Generate Video', 'ai-ads': 'AI Ad Videos', 'ai-presenter': 'AI Presenter',
    'ai-influencer': 'AI Influencer', jobs: 'Video Jobs', 'api-keys': 'API Keys',
    workers: 'Worker Status', credits: 'Credits & Billing', profile: 'My Profile', settings: 'Settings', admin: 'Admin Panel',
  };
  return titles[state.page] || 'Digital Human OS';
}

function bindShell() {
  document.removeEventListener('click', _shellClickHandler);
  document.addEventListener('click', _shellClickHandler);
  _applyNavMode();
  window.removeEventListener('resize', _applyNavMode);
  window.addEventListener('resize', _applyNavMode);
}

function _applyNavMode() {
  const isMobile = window.innerWidth <= 768;
  const desk = document.getElementById('desktop-nav');
  const mob  = document.getElementById('mobile-nav');
  if (!desk || !mob) return;
  desk.style.display = isMobile ? 'none' : '';
  mob.style.display  = isMobile ? '' : 'none';
}
function _shellClickHandler(e) {
  const pageEl = e.target.closest('[data-page]');
  if (pageEl) { navigate(pageEl.dataset.page); return; }
  if (e.target.id === 'logout-btn') {
    state.user = null; state.token = null; localStorage.removeItem('dhs_token');
    const hp = document.getElementById('homepage');
    const shell = document.getElementById('app-shell');
    if (hp) hp.style.display = '';
    if (shell) { shell.style.display = 'none'; shell.innerHTML = ''; }
    bindHomepage();
  }
}

function renderPage() {
  const el = document.getElementById('page-content');
  if (!el) return;
  const pages = {
    dashboard: pageDashboard, 'my-humans': pageMyHumans, 'create-human': pageCreateHuman,
    'create-twin': pageCreateTwin, 'create-fictional': pageCreateFictional,
    'view-human': pageViewHuman,
    generate: pageGenerate, 'ai-ads': pageAIAds, 'ai-presenter': pageAIPresenter,
    'ai-influencer': pageAIInfluencer, jobs: pageJobs, 'api-keys': pageAPIKeys,
    workers: pageWorkers, credits: pageCredits, profile: pageProfile, settings: pageSettings, admin: pageAdmin,
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

<div class="section-title mb-3">Quick Create</div>
<div class="quick-create-row">
  <button class="quick-create-btn" data-page="create-twin">
    <div class="qc-icon">📸</div>
    <div class="qc-label">Capture My Face</div>
    <div class="qc-desc">Camera wizard</div>
  </button>
  <button class="quick-create-btn" data-page="create-human">
    <div class="qc-icon">📁</div>
    <div class="qc-label">Upload Files</div>
    <div class="qc-desc">Photos &amp; voice</div>
  </button>
  <button class="quick-create-btn" data-page="create-fictional">
    <div class="qc-icon">✨</div>
    <div class="qc-label">Generate Human</div>
    <div class="qc-desc">From description</div>
  </button>
</div>

${state.digitalHumans.length === 0 ? `
<div class="card" style="text-align:center;padding:48px">
  <div style="font-size:3rem;margin-bottom:16px">🧑‍💻</div>
  <h3 style="margin-bottom:8px">Create your first Digital Human</h3>
  <p class="text-muted" style="margin-bottom:24px">Use your camera to capture your face and voice in 2 minutes.</p>
  <button class="btn btn-primary btn-lg" data-page="create-twin">📸 Create My AI Twin</button>
  <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-page="create-human">or upload files instead</button></div>
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
  const statusMap = {
    ready:      { cls: 'badge-green',  label: '✓ Ready' },
    draft:      { cls: 'badge-yellow', label: '⚠ Draft' },
    needs_face: { cls: 'badge-red',    label: '📷 Needs face upload' },
    needs_image_provider: { cls: 'badge-orange', label: '🖼 Needs image provider' },
    taken_down: { cls: 'badge-red',    label: '✕ Taken down' },
  };
  const st = statusMap[dh.status] || { cls: 'badge-yellow', label: dh.status };
  const typeIcons = { self: '🧑', male: '👨', female: '👩', brand: '🏢', presenter: '🎤', teacher: '📚', salesperson: '💼', influencer: '⭐', support: '🎧', fictional: '✨' };
  const noFaceWarn = (dh.status === 'needs_face' || dh.status === 'needs_image_provider')
    ? `<div style="font-size:.72rem;color:var(--yellow);margin-top:4px">${dh.status === 'needs_image_provider' ? 'Configure an image provider or upload a face photo to enable video' : 'Upload a face photo to enable video generation'}</div>` : '';
  return `<div class="dh-card" data-id="${dh.id}">
  <div class="dh-avatar"><span class="dh-avatar-placeholder">${typeIcons[dh.type] || '🧑'}</span></div>
  <div class="dh-card-body">
    <div class="dh-card-name">${escHtml(dh.name)}</div>
    <div class="dh-card-type">${dh.type} · ${dh.defaultVoice?.split('/').pop() || 'Default voice'}</div>
    ${noFaceWarn}
    <div class="dh-card-footer">
      <span class="badge ${st.cls}">${st.label}</span>
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
${createdDH ? `<div class="upload-grid">
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
    const [{ digitalHumans }, health] = await Promise.all([
      api('/api/digital-humans'),
      api('/api/workers/health').catch(() => ({})),
    ]);
    state.digitalHumans = digitalHumans;
    const activeLevel = health.activeQualityLevel || 1;

    if (digitalHumans.length === 0) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:2.5rem;margin-bottom:16px">🧑</div><h3>No Digital Humans Yet</h3><p class="text-muted mb-4">Create a digital human first before generating videos.</p><button class="btn btn-primary btn-lg" data-page="create-human">Create Digital Human</button></div>`;
      return;
    }

    const MODES = [
      { id: 'talking_head', icon: '💬', name: 'Talking Head', cost: 5 },
      { id: 'presenter',    icon: '🎤', name: 'Presenter',    cost: 8 },
      { id: 'ad_video',     icon: '📢', name: 'Ad Video',     cost: 10 },
      { id: 'influencer',   icon: '⭐', name: 'Influencer',   cost: 8 },
      { id: 'intro',        icon: '▶️', name: 'Intro Clip',   cost: 3 },
      { id: 'outro',        icon: '⏹️', name: 'Outro',        cost: 3 },
      { id: 'podcast',      icon: '🎙️', name: 'Podcast',      cost: 6 },
      { id: 'course',       icon: '📚', name: 'Course',       cost: 8 },
    ];

    let selectedMode = 'talking_head';
    let advanced = false;
    let lastPlan = null;
    let selectedDH = state.selectedDH && digitalHumans.find(d => d.id === state.selectedDH)
      ? state.selectedDH
      : digitalHumans[0]?.id || '';

    function currentCost() { return MODES.find(m => m.id === selectedMode)?.cost || 5; }
    function blockedStatus(dh) { return dh && (dh.status === 'needs_face' || dh.status === 'needs_image_provider'); }

    function levelBanner() {
      if (activeLevel <= 1) {
        return `<div class="provider-warning mb-4">⚠ ${qualityBadge(1)} You will get a <b>static image + audio</b>, not real AI motion. Configure a video provider in <button class="link-btn" data-page="settings">Settings</button> for real video.</div>`;
      }
      return `<div class="plan-card mb-4" style="display:flex;align-items:center;gap:10px"><span>Active output:</span>${qualityBadge(activeLevel)}<span class="text-muted text-sm">${escHtml((health.qualityLevels?.[activeLevel]?.desc) || '')}</span></div>`;
    }

    function advancedFields() {
      if (!advanced) return '';
      return `
      <div class="form-group"><label>Scene <span>(where it happens)</span></label>
        <input type="text" id="gen-scene" placeholder="e.g. London city street at sunset"></div>
      <div class="form-group"><label>Action <span>(what the human does)</span></label>
        <input type="text" id="gen-action" placeholder="e.g. driving a Ferrari, walking and talking"></div>
      <div class="form-group"><label>Product / Website <span>(optional)</span></label>
        <input type="text" id="gen-product" placeholder="e.g. mybrand.com — luxury watches"></div>
      <div class="form-group"><label>Camera Style</label>
        <select id="gen-camera">
          <option value="cinematic">Cinematic</option>
          <option value="documentary">Documentary</option>
          <option value="studio">Studio</option>
          <option value="social">Social</option>
          <option value="vlog">Vlog</option>
        </select></div>
      <button class="btn btn-ghost" id="plan-ai-btn" style="margin-bottom:12px">🧠 Plan with AI →</button>
      <div id="plan-output"></div>`;
    }

    function draw() {
      const cost = currentCost();
      el.innerHTML = `
${levelBanner()}
<div class="gen-layout">
  <div class="gen-main">

    <div class="card mb-4">
      <div class="gen-step-header">
        <span class="gen-step-num">1</span>
        <span class="section-title" style="margin:0">Choose Mode</span>
        <span class="gen-cost-inline" id="cost-display">${cost} cr</span>
      </div>
      <div class="mode-grid mt-3">
        ${MODES.map(m => `
        <div class="mode-card${selectedMode===m.id?' selected':''}" data-mode="${m.id}">
          <div class="mode-icon">${m.icon}</div>
          <div class="mode-name">${m.name}</div>
          <div class="mode-cost"><span>${m.cost} cr</span></div>
        </div>`).join('')}
      </div>
    </div>

    <div class="card mb-4">
      <div class="gen-step-header">
        <span class="gen-step-num">2</span>
        <span class="section-title" style="margin:0">Choose Avatar</span>
        <button class="btn btn-ghost btn-sm" data-page="create-human">+ New</button>
      </div>
      <div class="dh-picker-row mt-3">
        ${digitalHumans.map(dh => `
        <div class="dh-picker-card${selectedDH===dh.id?' selected':''}${blockedStatus(dh)?' dh-needs-face':''}" data-dh="${dh.id}" title="${blockedStatus(dh)?'No face asset':''}">
          <div class="dh-picker-avatar">${blockedStatus(dh)?'⚠️':'🧑'}</div>
          <div class="dh-picker-name">${escHtml(dh.name)}</div>
          <div class="dh-picker-type" style="font-size:.68rem">${dh.status==='needs_face'?'Needs face':dh.status==='needs_image_provider'?'Needs image':dh.type}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="card gen-form-card">
      <div class="gen-step-header mb-4">
        <span class="gen-step-num">3</span>
        <span class="section-title" style="margin:0">Script & Settings</span>
        <button class="advanced-toggle${advanced?' on':''}" id="adv-toggle">${advanced?'◉ Advanced / Prompt Mode':'○ Advanced / Prompt Mode'}</button>
      </div>
      ${advancedFields()}
      <div class="form-group">
        <label>Your Script <span>(spoken text)</span></label>
        <textarea id="gen-script" rows="5" placeholder="Type what your digital human will say…"></textarea>
      </div>
      <div class="form-group">
        <label>Topic <span>(optional — for Auto-Write)</span></label>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">
          <input type="text" id="gen-prompt" placeholder="e.g. Introduce my marketing agency" style="flex:1;min-width:180px">
          <button class="btn btn-ghost btn-sm" id="auto-write-btn" style="flex-shrink:0;white-space:nowrap">✨ Auto-Write</button>
        </div>
      </div>
      <div class="gen-settings-row">
        <div class="form-group"><label>Duration</label>
          <select id="gen-dur">
            <option value="15">15 sec</option>
            <option value="30" selected>30 sec</option>
            <option value="45">45 sec</option>
            <option value="60">60 sec</option>
          </select>
        </div>
        <div class="form-group"><label>Format</label>
          <select id="gen-format">
            <option value="9:16">9:16 Portrait</option>
            <option value="16:9">16:9 Landscape</option>
            <option value="1:1">1:1 Square</option>
          </select>
        </div>
        <div class="form-group"><label>Tone</label>
          <select id="gen-tone">
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="energetic">Energetic</option>
            <option value="calm">Calm</option>
            <option value="motivational">Motivational</option>
            <option value="luxury">Luxury</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-full gen-btn-desktop" id="gen-submit">🎬 Generate Video (${cost} cr)</button>
    </div>
  </div>

  <div class="gen-sidebar">
    <div class="card mb-4" style="position:sticky;top:16px">
      <div class="section-title mb-3">Cost Summary</div>
      <div style="font-size:2.2rem;font-weight:800;color:var(--accent2);margin-bottom:8px" id="cost-display-desk">${cost} cr</div>
      <p class="text-muted text-sm">You have <strong style="color:var(--text1)">${state.user.credits}</strong> credits</p>
      <div class="mt-3">${qualityBadge(activeLevel)}</div>
      <button class="btn btn-primary btn-lg btn-full mt-4" id="gen-submit-desk">🎬 Generate Video</button>
    </div>
    <div class="card">
      <div class="section-title mb-3">What you get</div>
      <ul style="color:var(--text3);font-size:.82rem;line-height:2.2;list-style:none">
        <li>${activeLevel>=2?'✅':'⚠️'} ${activeLevel>=2?'Lip-synced / motion video':'Static image only'}</li>
        <li>✅ AI voice generation</li>
        <li>✅ Word-level captions</li>
        <li>✅ Portrait 9:16 format</li>
        <li>⏱️ ~2–5 min processing</li>
      </ul>
    </div>
  </div>
</div>

<div class="gen-sticky-bar">
  <div>
    <div style="font-size:.68rem;color:var(--text3);font-weight:600">COST</div>
    <div style="font-size:1.1rem;font-weight:800;color:var(--accent2)" id="cost-display-mob">${cost} cr</div>
  </div>
  <button class="btn btn-primary" style="flex:1;max-width:280px;padding:12px 0;font-size:.95rem;font-weight:700" id="gen-submit-mob">🎬 Generate Video</button>
</div>`;
      bindGenEvents();
      if (lastPlan) renderPlan(lastPlan);
    }

    function renderPlan(plan) {
      const out = document.getElementById('plan-output');
      if (!out || !plan) return;
      const shots = (plan.shots || []).map(s => `
        <div class="storyboard-shot">
          <div class="storyboard-shot-num">Shot ${s.shot || '?'} · ${s.duration || '?'}s</div>
          <div class="storyboard-shot-desc">${escHtml(s.description || '')}</div>
          <div class="storyboard-shot-meta">🎥 ${escHtml(s.camera || '')} · ${escHtml(s.action || '')}</div>
        </div>`).join('');
      const lvlNeeded = plan.qualityLevelNeeded || 2;
      const gap = lvlNeeded > activeLevel
        ? `<div class="provider-warning" style="margin-top:10px">⚠ This plan recommends ${qualityBadge(lvlNeeded)} but your active output is ${qualityBadge(activeLevel)}. Configure a higher provider in Settings for the full result.</div>`
        : '';
      out.innerHTML = `
      <div class="plan-card">
        <div class="section-title mb-2">🧠 AI Production Plan</div>
        ${plan.sceneDescription ? `<div class="text-sm mb-2"><b>Scene:</b> ${escHtml(plan.sceneDescription)}</div>` : ''}
        ${plan.cameraDirection ? `<div class="text-sm mb-2"><b>Camera:</b> ${escHtml(plan.cameraDirection)}</div>` : ''}
        ${plan.motionDirection ? `<div class="text-sm mb-2"><b>Motion:</b> ${escHtml(plan.motionDirection)}</div>` : ''}
        <div class="text-sm mb-2"><b>Provider needed:</b> ${escHtml(plan.providerRecommendation || '')}</div>
        ${shots ? `<div class="storyboard-list mt-2">${shots}</div>` : ''}
        ${plan.script ? `<div class="mt-2"><button class="btn btn-ghost btn-sm" id="use-plan-script">Use this script →</button></div>` : ''}
        ${gap}
      </div>`;
      const useBtn = document.getElementById('use-plan-script');
      if (useBtn) useBtn.addEventListener('click', () => {
        const se = document.getElementById('gen-script');
        if (se && plan.script) { se.value = plan.script; toast('Script applied.', 'success'); }
      });
    }

    function doSubmit() {
      if (!selectedDH) { toast('Select a digital human first.', 'error'); return; }
      const selDH = digitalHumans.find(d => d.id === selectedDH);
      if (blockedStatus(selDH)) {
        toast(selDH.status === 'needs_image_provider'
          ? 'This synthetic human has no face. Configure an image provider in Settings or upload a face photo.'
          : 'This digital human has no face asset. Upload a face photo first.', 'error');
        state.selectedDH = selectedDH;
        navigate('view-human', { id: selectedDH });
        return;
      }
      const script = document.getElementById('gen-script')?.value.trim();
      const prompt = document.getElementById('gen-prompt')?.value.trim();
      const scene = document.getElementById('gen-scene')?.value.trim() || '';
      const action = document.getElementById('gen-action')?.value.trim() || '';
      const product = document.getElementById('gen-product')?.value.trim() || '';
      const cameraStyle = document.getElementById('gen-camera')?.value || 'cinematic';
      if (!script && !prompt && !scene) { toast('Enter a script, topic, or scene to generate.', 'error'); return; }
      const fmt = document.getElementById('gen-format')?.value || '9:16';
      const dims = { '9:16': [1080,1920], '16:9': [1920,1080], '1:1': [1080,1080] }[fmt];
      ['gen-submit','gen-submit-desk','gen-submit-mob'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.disabled = true; b.textContent = '⏳ Submitting…'; }
      });
      api('/api/videos/generate', { method: 'POST', body: JSON.stringify({
        digitalHumanId: selectedDH, mode: selectedMode, script, prompt,
        scene, action, product, cameraStyle,
        durationSec: Number(document.getElementById('gen-dur')?.value || 30),
        tone: document.getElementById('gen-tone')?.value || 'professional',
        outputW: dims[0], outputH: dims[1],
      })}).then(() => {
        toast('Video job started! Redirecting to jobs…', 'success');
        setTimeout(() => navigate('jobs'), 1200);
      }).catch(e => {
        toast(e.message, 'error');
        ['gen-submit','gen-submit-desk','gen-submit-mob'].forEach(id => {
          const b = document.getElementById(id); if (b) { b.disabled = false; b.textContent = '🎬 Generate Video'; }
        });
      });
    }

    function updateCostDisplays() {
      const cost = currentCost();
      ['cost-display','cost-display-desk','cost-display-mob'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = `${cost} cr`;
      });
      const gd = document.getElementById('gen-submit');
      if (gd) gd.textContent = `🎬 Generate Video (${cost} cr)`;
    }

    function bindGenEvents() {
      el.querySelectorAll('.mode-card').forEach(c => {
        c.addEventListener('click', () => {
          el.querySelectorAll('.mode-card').forEach(x => x.classList.remove('selected'));
          c.classList.add('selected');
          selectedMode = c.dataset.mode;
          updateCostDisplays();
        });
      });
      el.querySelectorAll('.dh-picker-card').forEach(c => {
        c.addEventListener('click', () => {
          el.querySelectorAll('.dh-picker-card').forEach(x => x.classList.remove('selected'));
          c.classList.add('selected');
          selectedDH = c.dataset.dh;
        });
      });
      document.getElementById('adv-toggle')?.addEventListener('click', () => { advanced = !advanced; draw(); });

      document.getElementById('plan-ai-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('plan-ai-btn');
        btn.disabled = true; btn.textContent = '🧠 Planning…';
        try {
          const res = await api('/api/videos/plan', { method: 'POST', body: JSON.stringify({
            digitalHumanId: selectedDH,
            prompt: document.getElementById('gen-prompt')?.value.trim() || '',
            scene: document.getElementById('gen-scene')?.value.trim() || '',
            action: document.getElementById('gen-action')?.value.trim() || '',
            product: document.getElementById('gen-product')?.value.trim() || '',
            script: document.getElementById('gen-script')?.value.trim() || '',
            cameraStyle: document.getElementById('gen-camera')?.value || 'cinematic',
            durationSec: Number(document.getElementById('gen-dur')?.value || 30),
          }) });
          lastPlan = res.plan;
          renderPlan(res.plan);
          toast('Plan ready. Review and generate.', 'success');
        } catch(e) { toast(e.message, 'error'); }
        btn.disabled = false; btn.textContent = '🧠 Plan with AI →';
      });

      const autoBtn = document.getElementById('auto-write-btn');
      if (autoBtn) autoBtn.addEventListener('click', async () => {
        const prompt = document.getElementById('gen-prompt')?.value.trim();
        if (!prompt) { toast('Enter a topic first.', 'error'); return; }
        autoBtn.disabled = true; autoBtn.textContent = '✨ Writing…';
        const dur = Number(document.getElementById('gen-dur')?.value || 30);
        const words = Math.round(dur * 2.5);
        const script = `Welcome. Today I want to talk to you about ${prompt}. This is something that can genuinely change how you think about your work. ${prompt} is more important than ever in 2026. Let me break it down simply. By the end of this video you will have everything you need. Stay with me.`.split(' ').slice(0, words).join(' ') + '.';
        const scriptEl = document.getElementById('gen-script');
        if (scriptEl) scriptEl.value = script;
        autoBtn.disabled = false; autoBtn.textContent = '✨ Auto-Write';
        toast('Script generated! Edit as needed.', 'success');
      });
      document.getElementById('gen-submit')?.addEventListener('click', () => doSubmit());
      document.getElementById('gen-submit-desk')?.addEventListener('click', () => doSubmit());
      document.getElementById('gen-submit-mob')?.addEventListener('click', () => doSubmit());
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
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const { digitalHumans } = await api('/api/digital-humans');
    if (!digitalHumans.length) { el.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:2.5rem;margin-bottom:16px">🎤</div><h3>No Digital Humans Yet</h3><p class="text-muted mb-4">Create a digital human first.</p><button class="btn btn-primary btn-lg" data-page="create-human">Create Digital Human</button></div>`; return; }
    el.innerHTML = `
<div class="section-title mb-2">AI Presenter</div>
<div class="section-sub">Generate professional presenter videos with your digital human</div>
<div class="card" style="max-width:680px">
  <div class="form-group"><label>Digital Human</label>
    <select id="pres-dh">${digitalHumans.map(dh=>`<option value="${dh.id}">${escHtml(dh.name)}</option>`).join('')}</select></div>
  <div class="form-group"><label>Presentation Topic</label>
    <input type="text" id="pres-topic" placeholder="e.g. Q4 Sales Results, Product Launch, Company Update"></div>
  <div class="form-row">
    <div class="form-group"><label>Duration</label>
      <select id="pres-dur"><option value="30">30 sec</option><option value="60" selected>60 sec</option><option value="90">90 sec</option><option value="120">2 min</option></select></div>
    <div class="form-group"><label>Tone</label>
      <select id="pres-tone"><option value="professional">Professional</option><option value="educational">Educational</option><option value="casual">Casual</option><option value="motivational">Motivational</option></select></div>
  </div>
  <div class="form-group"><label>Script <span>(optional — leave blank to auto-generate)</span></label>
    <textarea id="pres-script" rows="4" placeholder="Enter your presenter script or leave blank to auto-generate from the topic above"></textarea></div>
  <button class="btn btn-primary btn-lg" id="pres-submit">🎤 Generate Presenter Video (8 cr)</button>
  <div id="pres-status" style="margin-top:12px"></div>
</div>`;
    document.getElementById('pres-submit')?.addEventListener('click', async () => {
      const dhId = document.getElementById('pres-dh')?.value;
      const topic = document.getElementById('pres-topic')?.value.trim();
      const script = document.getElementById('pres-script')?.value.trim();
      if (!dhId || !topic) { toast('Select a digital human and enter a topic.', 'error'); return; }
      const btn = document.getElementById('pres-submit');
      btn.disabled = true; btn.textContent = 'Submitting…';
      try {
        await api('/api/videos/generate', { method: 'POST', body: JSON.stringify({ digitalHumanId: dhId, mode: 'presenter', script, prompt: topic, durationSec: Number(document.getElementById('pres-dur')?.value||60), tone: document.getElementById('pres-tone')?.value||'professional' }) });
        toast('Presenter job queued! Redirecting…', 'success');
        setTimeout(() => navigate('jobs'), 1200);
      } catch(e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '🎤 Generate Presenter Video (8 cr)'; }
    });
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

async function pageAIInfluencer(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const { digitalHumans } = await api('/api/digital-humans');
    if (!digitalHumans.length) { el.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:2.5rem;margin-bottom:16px">⭐</div><h3>No Digital Humans Yet</h3><p class="text-muted mb-4">Create a digital human first.</p><button class="btn btn-primary btn-lg" data-page="create-human">Create Digital Human</button></div>`; return; }
    el.innerHTML = `
<div class="section-title mb-2">AI Influencer</div>
<div class="section-sub">Create authentic social media content with your digital human</div>
<div class="card" style="max-width:680px">
  <div class="form-group"><label>Digital Human</label>
    <select id="inf-dh">${digitalHumans.map(dh=>`<option value="${dh.id}">${escHtml(dh.name)}</option>`).join('')}</select></div>
  <div class="form-row">
    <div class="form-group"><label>Platform</label>
      <select id="inf-platform"><option value="tiktok">TikTok</option><option value="reels">Instagram Reels</option><option value="shorts">YouTube Shorts</option></select></div>
    <div class="form-group"><label>Content Category</label>
      <select id="inf-cat"><option value="lifestyle">Lifestyle</option><option value="business">Business</option><option value="education">Education</option><option value="fitness">Fitness</option><option value="fashion">Fashion</option><option value="food">Food</option></select></div>
  </div>
  <div class="form-group"><label>Hook / Trend</label>
    <input type="text" id="inf-hook" placeholder="e.g. POV: You just discovered..., Things I wish I knew..."></div>
  <div class="form-group"><label>Content Topic</label>
    <textarea id="inf-topic" rows="3" placeholder="What is this video about? What value does it deliver?"></textarea></div>
  <div class="form-group"><label>Tone</label>
    <select id="inf-tone"><option value="energetic">High Energy</option><option value="casual">Casual</option><option value="motivational">Motivational</option><option value="educational">Educational</option></select></div>
  <button class="btn btn-primary btn-lg" id="inf-submit">⭐ Generate Influencer Video (8 cr)</button>
  <div id="inf-status" style="margin-top:12px"></div>
</div>`;
    document.getElementById('inf-submit')?.addEventListener('click', async () => {
      const dhId = document.getElementById('inf-dh')?.value;
      const hook = document.getElementById('inf-hook')?.value.trim();
      const topic = document.getElementById('inf-topic')?.value.trim();
      if (!dhId || !topic) { toast('Select a digital human and enter the topic.', 'error'); return; }
      const platform = document.getElementById('inf-platform')?.value;
      const btn = document.getElementById('inf-submit');
      btn.disabled = true; btn.textContent = 'Submitting…';
      const prompt = `${hook ? hook + '. ' : ''}${topic} (${platform} style, ${document.getElementById('inf-cat')?.value} category)`;
      try {
        await api('/api/videos/generate', { method: 'POST', body: JSON.stringify({ digitalHumanId: dhId, mode: 'influencer', prompt, durationSec: 30, tone: document.getElementById('inf-tone')?.value||'energetic', outputW: 1080, outputH: 1920 }) });
        toast('Influencer video queued! Redirecting…', 'success');
        setTimeout(() => navigate('jobs'), 1200);
      } catch(e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '⭐ Generate Influencer Video (8 cr)'; }
    });
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
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
  ${job.qualityLevel ? `<div style="margin:6px 0">${qualityBadge(job.qualityLevel)}${job.videoProvider ? ` <span class="text-muted text-sm">via ${escHtml(job.videoProvider)}</span>` : ''}</div>` : ''}
  <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${pct}%"></div></div>
  ${job.error ? `<div class="error-box">${escHtml(job.error)}</div>` : ''}
  ${job.staticFallbackWarning ? `<div class="provider-warning" style="margin-top:6px">⚠ Static fallback — real AI motion not generated. <button class="link-btn" data-page="settings">Configure a video provider →</button></div>` : ''}
  ${job.warning ? `<div style="background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.25);border-radius:8px;padding:8px 12px;font-size:.78rem;color:var(--yellow);margin-top:6px">⚠️ ${escHtml(job.warning)}</div>` : ''}
  ${job.plan?.sceneDescription ? `<div class="text-muted text-sm" style="margin-top:6px">🎬 ${escHtml(job.plan.sceneDescription)}</div>` : ''}
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
    const lvl = health.activeQualityLevel || 1;
    const lvlMeta = (health.qualityLevels && health.qualityLevels[lvl]) || {};
    const wav2lipOk = health.checks?.wav2lip?.ok;
    el.innerHTML = `
<div class="section-title mb-2">Worker Status</div>
<div class="section-sub">Local AI worker health — Runtime: <strong>${health.mode}</strong> · Queue: ${health.queueDepth} · Active: ${health.activeRenders}</div>

<div class="card mb-4 ${QUALITY_META[lvl]?.cls || ''}" style="border-width:2px">
  <div class="text-muted text-sm" style="font-weight:600;letter-spacing:.05em">ACTIVE OUTPUT QUALITY</div>
  <div style="font-size:1.6rem;font-weight:800;margin:6px 0">${qualityBadge(lvl)}</div>
  <div class="text-muted text-sm">${escHtml(lvlMeta.desc || '')}</div>
  ${lvl <= 1 ? `<div class="provider-warning" style="margin-top:12px">⚠ You are on Static Fallback — generated videos will be a still image + audio, not real AI motion. Configure a video provider below for real video.</div>` : ''}
</div>

<div class="grid-2 mb-4">
  <div class="card">
    <div class="section-title mb-2">🎥 Video Provider</div>
    <div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${escHtml(health.videoProvider || 'static')}</div>
    <span class="badge ${health.videoProvider && health.videoProvider !== 'static' ? 'badge-green' : 'badge-yellow'}">${health.videoProvider && health.videoProvider !== 'static' ? 'Configured' : 'Not configured (static)'}</span>
    <div class="mt-3"><button class="btn btn-ghost btn-sm" data-page="settings">Configure →</button></div>
  </div>
  <div class="card">
    <div class="section-title mb-2">🖼 Image Provider</div>
    <div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${escHtml(health.imageProvider || 'none')}</div>
    <span class="badge ${health.imageProvider && health.imageProvider !== 'none' ? 'badge-green' : 'badge-yellow'}">${health.imageProvider && health.imageProvider !== 'none' ? 'Configured' : 'Not configured'}</span>
    <div class="mt-3"><button class="btn btn-ghost btn-sm" data-page="settings">Configure →</button></div>
  </div>
</div>

<div class="card mb-4">
  <div class="section-title mb-2">💋 Wav2Lip (Local Lip Sync)</div>
  <span class="badge ${wav2lipOk ? 'badge-green' : 'badge-yellow'}">${wav2lipOk ? '✓ Installed' : 'Not installed'}</span>
  <div class="text-muted text-sm mt-2">${escHtml(health.checks?.wav2lip?.path || '')}</div>
  ${!wav2lipOk ? `<div class="text-muted text-sm mt-1">Install Wav2Lip (Level 2 talking head) with <code>./setup.sh wav2lip</code></div>` : ''}
</div>

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

// ── View Digital Human ─────────────────────────────────────────────────────
async function pageViewHuman(el) {
  // Support direct navigation with params OR state.selectedDH
  const id = state.params?.id || state.selectedDH;
  if (!id) { navigate('my-humans'); return; }
  state.selectedDH = id; // keep in sync
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const { digitalHuman: dh } = await api(`/api/digital-humans/${id}`);
    const statusMap = { ready:'green', needs_face:'yellow', needs_image_provider:'orange', taken_down:'red', draft:'yellow' };
    // Choose correct preview — JPEG frame or fallback to emoji
    const facePreview = dh.facePath && !dh.facePath.endsWith('.webm')
      ? `<img src="${dh.facePath}" style="width:100%;height:200px;object-fit:cover;border-radius:var(--radius)">`
      : dh.facePath && dh.facePath.endsWith('.webm')
      ? `<video src="${dh.facePath}" style="width:100%;height:200px;object-fit:cover;border-radius:var(--radius)" muted playsinline autoplay loop></video>`
      : `<div style="height:200px;border-radius:var(--radius);background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:4rem">🧑</div>`;
    const noFaceBanner = (dh.status === 'needs_face' || dh.status === 'needs_image_provider')
      ? `<div style="background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.3);border-radius:8px;padding:10px 14px;font-size:.82rem;color:var(--yellow);margin-bottom:16px">⚠️ ${dh.status === 'needs_image_provider' ? 'No image provider configured. Upload a face photo below, or configure DALL·E / Stability / FAL in Settings for auto generation.' : 'Upload a face photo below to enable video generation.'}</div>` : '';
    el.innerHTML = `
<div class="flex items-center gap-3 mb-6">
  <button class="btn btn-ghost btn-sm" data-page="my-humans">← Back</button>
  <div class="section-title" style="margin:0">${escHtml(dh.name)}</div>
  <span class="badge badge-${statusMap[dh.status]||'yellow'}">${dh.status.replace('_',' ')}</span>
</div>
${noFaceBanner}
<div class="grid-2 mb-4">
  <div class="card">
    ${facePreview}
    <div class="section-title mb-1" style="margin-top:16px">${escHtml(dh.name)}</div>
    <div style="color:var(--text3);font-size:.85rem;margin-bottom:16px">${dh.type} · ${dh.defaultVoice||'default voice'}</div>
    <div class="flex gap-2" style="flex-wrap:wrap">
      <button class="btn btn-primary" id="gen-from-dh-btn">🎬 Generate Video</button>
      <button class="btn btn-danger btn-sm" id="del-dh-btn" data-id="${dh.id}">Delete</button>
    </div>
  </div>
  <div class="card">
    <div class="section-title mb-3">Upload Assets</div>
    <div class="form-group">
      <label>Face Photo / Video</label>
      <div class="upload-zone" id="face-drop" style="padding:20px">
        <div class="icon">🖼️</div>
        <p class="primary">Click to replace face</p>
        <input type="file" id="face-file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov" style="display:none">
      </div>
      <div id="face-status" style="margin-top:6px;font-size:.8rem;color:var(--text3)"></div>
    </div>
    <div class="form-group">
      <label>Voice Sample <span>(optional)</span></label>
      <div class="upload-zone" id="voice-drop" style="padding:20px">
        <div class="icon">🎙️</div>
        <p class="primary">Click to upload voice</p>
        <input type="file" id="voice-file" accept=".wav,.mp3,.m4a,.ogg,.flac" style="display:none">
      </div>
      <div id="voice-status" style="margin-top:6px;font-size:.8rem;color:var(--text3)"></div>
    </div>
  </div>
</div>`;

    // Generate video — pre-select this DH on generate page
    document.getElementById('gen-from-dh-btn')?.addEventListener('click', () => {
      if (dh.status === 'needs_face' || dh.status === 'needs_image_provider') {
        toast('Upload a face photo first to enable video generation.', 'error');
        return;
      }
      state.selectedDH = id;
      navigate('generate');
    });

    // Face upload
    document.getElementById('face-drop')?.addEventListener('click', () => document.getElementById('face-file')?.click());
    document.getElementById('face-file')?.addEventListener('change', async e => {
      if (!e.target.files[0]) return;
      const st = document.getElementById('face-status');
      st.textContent = 'Uploading…';
      try {
        await uploadFile(`/api/digital-humans/${id}/upload-face`, e.target.files[0]);
        st.textContent = '✅ Uploaded! Reloading…'; st.style.color = 'var(--green)';
        setTimeout(() => pageViewHuman(el), 800); // reload page to show new face
      }
      catch(err) { st.textContent = '❌ ' + err.message; st.style.color = 'var(--red)'; }
    });

    // Voice upload
    document.getElementById('voice-drop')?.addEventListener('click', () => document.getElementById('voice-file')?.click());
    document.getElementById('voice-file')?.addEventListener('change', async e => {
      if (!e.target.files[0]) return;
      const st = document.getElementById('voice-status');
      st.textContent = 'Uploading…';
      try { await uploadFile(`/api/digital-humans/${id}/upload-voice`, e.target.files[0]); st.textContent = '✅ Uploaded'; st.style.color = 'var(--green)'; }
      catch(err) { st.textContent = '❌ ' + err.message; st.style.color = 'var(--red)'; }
    });

    // Delete
    document.getElementById('del-dh-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${dh.name}"? This cannot be undone.`)) return;
      try { await api(`/api/digital-humans/${id}`, { method: 'DELETE' }); toast('Deleted.', 'success'); navigate('my-humans'); }
      catch(e) { toast(e.message, 'error'); }
    });
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── Profile ────────────────────────────────────────────────────────────────
async function pageProfile(el) {
  const user = state.user;
  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  el.innerHTML = `
<div class="profile-hero">
  <div class="profile-avatar-lg">${initials}</div>
  <div>
    <div class="profile-name">${escHtml(user.name)}</div>
    <div class="profile-email">${escHtml(user.email)}</div>
    <span class="badge badge-purple" style="margin-top:6px">${user.plan} plan</span>
  </div>
</div>

<div class="profile-grid">
  <!-- Edit Info -->
  <div class="card">
    <div class="section-title mb-4">Edit Profile</div>
    <div class="form-group">
      <label>Full Name</label>
      <input type="text" id="prof-name" value="${escHtml(user.name||'')}">
    </div>
    <div class="form-group">
      <label>Email Address</label>
      <input type="email" id="prof-email" value="${escHtml(user.email||'')}">
    </div>
    <button class="btn btn-primary" id="save-profile-btn">Save Changes</button>
  </div>

  <!-- Change Password -->
  <div class="card">
    <div class="section-title mb-4">Change Password</div>
    <div class="form-group">
      <label>Current Password</label>
      <input type="password" id="prof-pw-cur" placeholder="Current password">
    </div>
    <div class="form-group">
      <label>New Password</label>
      <input type="password" id="prof-pw-new" placeholder="Min 8 characters">
    </div>
    <div class="form-group">
      <label>Confirm New Password</label>
      <input type="password" id="prof-pw-confirm" placeholder="Repeat new password">
    </div>
    <button class="btn btn-ghost" id="change-pw-btn">Update Password</button>
  </div>
</div>

<!-- Account Summary -->
<div class="card mt-4">
  <div class="section-title mb-3">Account Summary</div>
  <div class="grid-4" style="gap:12px;margin-bottom:0">
    <div class="stat-card accent"><div class="stat-label">Credits</div><div class="stat-value">${user.credits}</div></div>
    <div class="stat-card"><div class="stat-label">Plan</div><div class="stat-value" style="font-size:1.2rem;text-transform:capitalize">${user.plan}</div></div>
    <div class="stat-card"><div class="stat-label">Role</div><div class="stat-value" style="font-size:1.2rem;text-transform:capitalize">${user.role}</div></div>
    <div class="stat-card" style="cursor:pointer" data-page="credits"><div class="stat-label">Billing</div><div class="stat-value" style="font-size:1.2rem">→</div></div>
  </div>
</div>

<!-- Sign Out -->
<div class="card mt-4" style="border-color:rgba(239,68,68,.25)">
  <div class="section-title mb-2">Sign Out</div>
  <p class="text-muted text-sm mb-4">You will be signed out of your account on this device.</p>
  <button class="btn btn-danger" id="profile-logout-btn">Sign Out</button>
</div>`;

  document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const name  = document.getElementById('prof-name')?.value.trim();
    const email = document.getElementById('prof-email')?.value.trim();
    if (!name || !email) { toast('Name and email are required.', 'error'); return; }
    try {
      const res = await api('/api/auth/update-profile', { method: 'PATCH', body: JSON.stringify({ name, email }) });
      state.user = { ...state.user, name, email };
      toast('Profile saved!', 'success');
      renderShell();
    } catch(e) { toast(e.message || 'Could not save profile.', 'error'); }
  });

  document.getElementById('change-pw-btn')?.addEventListener('click', async () => {
    const cur     = document.getElementById('prof-pw-cur')?.value;
    const newPw   = document.getElementById('prof-pw-new')?.value;
    const confirm = document.getElementById('prof-pw-confirm')?.value;
    if (!cur || !newPw) { toast('Fill in current and new password.', 'error'); return; }
    if (newPw !== confirm) { toast('New passwords do not match.', 'error'); return; }
    if (newPw.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: newPw }) });
      toast('Password changed!', 'success');
      ['prof-pw-cur','prof-pw-new','prof-pw-confirm'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    } catch(e) { toast(e.message || 'Could not change password.', 'error'); }
  });

  document.getElementById('profile-logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('dhs_token');
    state.user = null; state.token = null;
    render();
  });
}

// ── Credits (rearranged) ───────────────────────────────────────────────────
async function pageCredits(el) {
  try {
    const { credits, plan, transactions } = await api('/api/credits/status');
    const PLANS = [
      { id:'free',       label:'Free',       cr:'30 cr/mo',   price:'$0',   color:'var(--text2)' },
      { id:'starter',    label:'Starter',    cr:'200 cr/mo',  price:'$19',  color:'var(--cyan)' },
      { id:'pro',        label:'Pro',        cr:'600 cr/mo',  price:'$49',  color:'var(--accent2)' },
      { id:'enterprise', label:'Enterprise', cr:'2,000 cr/mo',price:'$149', color:'var(--yellow)' },
    ];
    const COSTS = [
      ['💬','Talking Head','5 cr'],['🎤','Presenter','8 cr'],['📢','Ad Video','10 cr'],
      ['⭐','Influencer','8 cr'],['🎙️','Podcast','6 cr'],['📚','Course','8 cr'],
      ['▶️','Intro Clip','3 cr'],['⏹️','Outro Clip','3 cr'],
    ];
    el.innerHTML = `
<!-- Balance hero -->
<div class="billing-hero mb-6">
  <div class="billing-balance">
    <div class="billing-balance-label">Credits Remaining</div>
    <div class="billing-balance-value">${credits}</div>
    <div class="badge badge-purple" style="font-size:.85rem;padding:4px 12px;margin-top:8px;text-transform:capitalize">${plan} Plan</div>
  </div>
  <div class="billing-balance-actions">
    <button class="btn btn-primary btn-lg">Buy Credits</button>
    <button class="btn btn-ghost">Upgrade Plan</button>
    <p class="text-muted text-sm" style="margin-top:8px">Credits reset monthly on your billing date</p>
  </div>
</div>

<!-- Credit costs -->
<div class="section-title mb-3">Credit Cost Reference</div>
<div class="grid-4 mb-6">
  ${COSTS.map(([icon,name,cost])=>`
  <div class="cost-tile">
    <div class="cost-tile-icon">${icon}</div>
    <div class="cost-tile-name">${name}</div>
    <div class="cost-tile-amount">${cost}</div>
  </div>`).join('')}
</div>

<!-- Plans -->
<div class="section-title mb-3">Plans</div>
<div class="billing-plans mb-6">
  ${PLANS.map(p=>`
  <div class="billing-plan-card${p.id===plan?' current':''}">
    <div class="billing-plan-top">
      <div class="billing-plan-name" style="color:${p.color}">${p.label}</div>
      <div class="billing-plan-price">${p.price}<span>/mo</span></div>
    </div>
    <div class="billing-plan-cr">${p.cr}</div>
    ${p.id===plan
      ? `<span class="badge badge-green" style="margin-top:12px;align-self:flex-start">Current Plan</span>`
      : `<button class="btn btn-ghost btn-sm" style="margin-top:12px;align-self:flex-start">Upgrade →</button>`}
  </div>`).join('')}
</div>

<!-- Transactions -->
${transactions?.length ? `
<div class="section-title mb-3">Recent Transactions</div>
<div class="card" style="overflow-x:auto">
  <table class="table">
    <thead><tr><th>Date</th><th>Description</th><th>Credits</th></tr></thead>
    <tbody>${transactions.map(t=>`<tr>
      <td style="white-space:nowrap">${new Date(t.createdAt).toLocaleDateString()}</td>
      <td>${escHtml(t.reason||'')}</td>
      <td style="font-weight:700;color:${t.amount<0?'var(--red)':'var(--green)'}">${t.amount>0?'+':''}${t.amount}</td>
    </tr>`).join('')}</tbody>
  </table>
</div>` : `<div class="empty-state"><div class="icon">💳</div><h3>No transactions yet</h3><p>Your credit history will appear here</p></div>`}`;
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── Create AI Twin — Camera Capture Wizard ────────────────────────────────
function pageCreateTwin(el) {
  let currentStep = 1;
  const TOTAL_STEPS = 8;
  let stream = null;
  let mediaRecorder = null;
  let videoBlobs = [];
  let audioBlob = null;
  let captureSessionId = null;
  let stepTimer = null;

  function stopStream() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch {} }
  }

  // iOS Safari requires srcObject set + explicit play() after element is in DOM
  async function attachCamera(videoId) {
    const video = document.getElementById(videoId);
    if (!video || !stream) return;
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.srcObject = stream;
    try { await video.play(); } catch(e) { console.warn('Camera play() blocked:', e.name); }
  }

  function progressBar() {
    return `<div class="steps-progress">${Array.from({length: TOTAL_STEPS}, (_, i) => {
      const cls = i + 1 < currentStep ? 'done' : i + 1 === currentStep ? 'active' : '';
      return `<div class="${cls}"></div>`;
    }).join('')}</div>`;
  }

  async function startSession() {
    try {
      const res = await api('/api/capture/session/start', { method: 'POST' });
      captureSessionId = res.sessionId;
    } catch(e) { console.warn('Capture session start failed:', e.message); }
  }

  function draw() {
    el.innerHTML = `
<div class="capture-wrap">
  <div class="section-title mb-2">Create AI Twin — Camera Wizard</div>
  <div class="section-sub">Step ${currentStep} of ${TOTAL_STEPS}</div>
  ${progressBar()}
  <div id="capture-step-content" class="card"></div>
</div>`;
    renderStep(document.getElementById('capture-step-content'));
  }

  function renderStep(container) {
    const steps = [drawStep1, drawStep2, drawStep3, drawStep4, drawStep5, drawStep6, drawStep7, drawStep8];
    const fn = steps[currentStep - 1];
    if (fn) fn(container);
  }

  function nextStep() {
    // DO NOT stop stream here — camera must stay alive across capture steps 2-6
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch {} }
    currentStep++;
    draw();
  }
  function prevStep() {
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
    currentStep = Math.max(1, currentStep - 1);
    draw();
  }

  function drawStep1(c) {
    c.innerHTML = `
<div class="capture-step">
  <div style="font-size:3rem;margin-bottom:16px">📷</div>
  <div class="capture-step-title">Allow Camera &amp; Microphone</div>
  <div class="capture-step-sub">We need access to your camera and microphone to capture your face and voice for your AI twin. Read the steps below before you begin.</div>
  <ul style="text-align:left;max-width:380px;margin:0 auto 16px;color:var(--text2);font-size:.85rem;line-height:1.9;list-style:none">
    <li>1. Front-facing capture (5s)</li>
    <li>2. Left & right angle (3s each)</li>
    <li>3. Smile / expression capture</li>
    <li>4. Voice consent recording</li>
    <li>5. Review all captures</li>
  </ul>
  <button class="btn btn-primary btn-lg" id="allow-cam-btn">Allow Camera &amp; Microphone</button>
  <div id="step1-gate" style="color:var(--text3);font-size:.8rem;margin-top:10px"></div>
  <div style="margin-top:16px">
    <button class="btn btn-ghost btn-sm" data-page="create-human">Use upload instead →</button>
  </div>
</div>`;
    // 10s minimum read gate
    let readSecs = 10;
    const allowBtn0 = document.getElementById('allow-cam-btn');
    const gate = document.getElementById('step1-gate');
    allowBtn0.disabled = true;
    gate.textContent = `Please review the steps — ready in ${readSecs}s…`;
    stepTimer = setInterval(() => {
      readSecs--;
      if (readSecs <= 0) {
        clearInterval(stepTimer); stepTimer = null;
        allowBtn0.disabled = false;
        gate.textContent = '✅ Ready — allow camera to continue.';
      } else {
        gate.textContent = `Please review the steps — ready in ${readSecs}s…`;
      }
    }, 1000);
    document.getElementById('allow-cam-btn').addEventListener('click', async () => {
      const btn = document.getElementById('allow-cam-btn');
      btn.disabled = true; btn.textContent = 'Requesting access…';
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Camera API not available. Use HTTPS or localhost.'), { name: 'UnsupportedError' });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
        });
        await startSession();
        nextStep();
      } catch(e) {
        let msg = e.message || 'Camera error.';
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')
          msg = 'Camera permission denied. Check your browser settings and allow camera access.';
        else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError')
          msg = 'No camera found on this device.';
        else if (e.name === 'NotReadableError' || e.name === 'TrackStartError')
          msg = 'Camera is in use by another app. Close other apps and try again.';
        else if (e.name === 'UnsupportedError' || location.protocol === 'http:' && location.hostname !== 'localhost')
          msg = 'Camera requires HTTPS. Please use a secure connection or localhost.';
        c.innerHTML = `<div class="capture-step">
          <div style="font-size:2.5rem;margin-bottom:12px">⚠️</div>
          <div class="capture-step-title">Camera Not Available</div>
          <div class="capture-step-sub" style="color:var(--red)">${escHtml(msg)}</div>
          <p style="color:var(--text3);font-size:.82rem;margin:12px 0 20px">You can still create your AI twin by uploading existing photos and videos.</p>
          <button class="btn btn-primary" data-page="create-human">Upload Files Instead</button>
          <button class="btn btn-ghost" id="retry-cam-btn" style="margin-top:8px">↺ Try Again</button>
        </div>`;
        document.getElementById('retry-cam-btn')?.addEventListener('click', () => drawStep1(c));
      }
    });
  }

  function drawStep2(c) {
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Position Your Face</div>
  <div class="capture-step-sub">Center your face in the oval guide. Make sure you have good lighting.</div>
  <div class="camera-container">
    <video id="cam-preview" class="camera-video" autoplay muted playsinline></video>
    <div class="face-guide"><div class="face-oval"></div></div>
  </div>
  <div class="capture-status">
    <div class="capture-check ok">✅ Lighting: Good</div>
    <div class="capture-check ok">✅ Face: Centered</div>
    <div class="capture-check ok">✅ Background: OK</div>
  </div>
  <div id="step2-countdown" style="color:var(--accent2);font-weight:700;margin-bottom:12px"></div>
  <button class="btn btn-primary" id="step2-next">Continue →</button>
</div>`;
    attachCamera('cam-preview');
    let count = 3;
    const countEl = document.getElementById('step2-countdown');
    countEl.textContent = `Auto-advancing in ${count}s…`;
    stepTimer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(stepTimer); stepTimer = null;
        nextStep();
      } else {
        countEl.textContent = `Auto-advancing in ${count}s…`;
      }
    }, 1000);
    document.getElementById('step2-next')?.addEventListener('click', () => { clearInterval(stepTimer); nextStep(); });
  }

  function recordVideo(seconds, onDone) {
    if (!stream) { onDone(null); return; }
    videoBlobs = [];
    const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    mediaRecorder = mr;
    mr.ondataavailable = e => { if (e.data && e.data.size > 0) videoBlobs.push(e.data); };
    mr.onstop = () => { onDone(new Blob(videoBlobs, { type: 'video/webm' })); };
    mr.start(200);
    setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, seconds * 1000);
  }

  function drawStep3(c) {
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Front Face Capture</div>
  <div class="capture-step-sub">Look directly at the camera. Stay still.</div>
  <div class="camera-container">
    <video id="cam-step3" class="camera-video" autoplay muted playsinline></video>
    <div class="face-guide"><div class="face-oval"></div></div>
  </div>
  <div id="step3-status" style="margin-bottom:16px">
    <button class="btn btn-primary" id="step3-record-btn">Start Recording (5s)</button>
  </div>
</div>`;
    attachCamera('cam-step3');
    document.getElementById('step3-record-btn').addEventListener('click', () => {
      const statusEl = document.getElementById('step3-status');
      statusEl.innerHTML = `<div class="record-badge">Recording 5s...</div>`;
      recordVideo(5, (blob) => {
        if (blob) videoBlobs = [blob];
        statusEl.innerHTML = `<div style="color:var(--green);font-weight:700;margin-bottom:12px">✅ Front face captured</div><button class="btn btn-primary" id="step3-next">Continue →</button>`;
        document.getElementById('step3-next')?.addEventListener('click', nextStep);
      });
    });
  }

  function drawStep4(c) {
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Side Angles</div>
  <div class="capture-step-sub">Turn your head slowly left ←, then right →. Then return to center.</div>
  <div class="camera-container">
    <video id="cam-step4" class="camera-video" autoplay muted playsinline></video>
    <div class="face-guide"><div class="face-oval"></div></div>
    <div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:1.5rem">← →</div>
  </div>
  <div id="step4-status">
    <button class="btn btn-primary" id="step4-record-btn">Start Recording (5s)</button>
  </div>
</div>`;
    attachCamera('cam-step4');
    document.getElementById('step4-record-btn').addEventListener('click', () => {
      const statusEl = document.getElementById('step4-status');
      statusEl.innerHTML = `<div class="record-badge">Recording 5s — turn head left, then right...</div>`;
      recordVideo(5, () => {
        statusEl.innerHTML = `<div style="color:var(--green);font-weight:700;margin-bottom:12px">✅ Side angles captured</div><button class="btn btn-primary" id="step4-next">Continue →</button>`;
        document.getElementById('step4-next')?.addEventListener('click', nextStep);
      });
    });
  }

  function drawStep5(c) {
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Expressions</div>
  <div class="capture-step-sub">Smile naturally, then blink slowly twice.</div>
  <div class="camera-container">
    <video id="cam-step5" class="camera-video" autoplay muted playsinline></video>
    <div class="face-guide"><div class="face-oval"></div></div>
  </div>
  <div id="step5-status">
    <button class="btn btn-primary" id="step5-record-btn">Record Expressions (3s)</button>
  </div>
</div>`;
    attachCamera('cam-step5');
    document.getElementById('step5-record-btn').addEventListener('click', () => {
      const statusEl = document.getElementById('step5-status');
      statusEl.innerHTML = `<div class="record-badge">Recording — smile and blink...</div>`;
      recordVideo(3, () => {
        statusEl.innerHTML = `<div style="color:var(--green);font-weight:700;margin-bottom:12px">✅ Expressions captured</div><button class="btn btn-primary" id="step5-next">Continue →</button>`;
        document.getElementById('step5-next')?.addEventListener('click', nextStep);
      });
    });
  }

  function drawStep6(c) {
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Voice Consent</div>
  <div class="capture-step-sub">Read this aloud clearly:</div>
  <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin:16px 0 24px;font-size:.9rem;line-height:1.7;color:var(--text2);font-style:italic">"I confirm this is my own face and voice. I consent to creating a digital twin."</div>
  <div id="step6-status">
    <button class="btn btn-primary" id="step6-record-btn">🎙️ Record Voice (4s)</button>
  </div>
</div>`;
    document.getElementById('step6-record-btn').addEventListener('click', () => {
      if (!stream) { toast('Microphone not available.', 'error'); return; }
      const statusEl = document.getElementById('step6-status');
      statusEl.innerHTML = `<div class="record-badge">Recording 4s — speak clearly...</div><div class="waveform" style="justify-content:center;margin-top:12px"><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>`;
      // Use audio-only stream — do not record video for voice consent
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) { toast('No microphone detected.', 'error'); return; }
      const audioStream = new MediaStream(audioTracks);
      const audioMime = ['audio/webm;codecs=opus','audio/webm','video/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) || '';
      const audioOnly = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : {});
      const chunks = [];
      audioOnly.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      audioOnly.onstop = () => {
        audioBlob = new Blob(chunks, { type: audioMime || 'audio/webm' });
        if (audioBlob.size < 500) {
          statusEl.innerHTML = `<div style="color:var(--red);margin-bottom:12px">⚠️ Recording was silent or too short. Please try again.</div><button class="btn btn-primary" id="step6-record-btn">🎙️ Record Again</button>`;
          document.getElementById('step6-record-btn')?.addEventListener('click', arguments.callee.caller);
          return;
        }
        statusEl.innerHTML = `<div style="color:var(--green);font-weight:700;margin-bottom:12px">✅ Voice consent captured (${Math.round(audioBlob.size/1024)}KB)</div><button class="btn btn-primary" id="step6-next">Continue →</button>`;
        document.getElementById('step6-next')?.addEventListener('click', nextStep);
      };
      audioOnly.start(200);
      setTimeout(() => { if (audioOnly.state !== 'inactive') audioOnly.stop(); }, 4000);
    });
  }

  function drawStep7(c) {
    const haveFace = videoBlobs.length > 0;
    const haveVoice = !!audioBlob;
    const ck = (ok, okTxt, badTxt) => `<div class="capture-check ${ok?'ok':'fail'}">${ok?'✅':'⚠️'} ${ok?okTxt:badTxt}</div>`;
    const score = (haveFace?60:0) + (haveVoice?40:0);
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Review Your Captures</div>
  <div class="capture-step-sub">Confirm everything was captured before creating your twin.</div>
  <div class="quality-score">${score}<span style="font-size:1.5rem;color:var(--text3)">/100</span></div>
  <div class="capture-status" style="max-width:340px;margin:0 auto 20px">
    ${ck(haveFace, 'Face capture: Recorded', 'Face capture: MISSING — retake')}
    ${ck(haveVoice, 'Voice consent: Recorded', 'Voice consent: MISSING — retake')}
    ${ck(haveFace, 'Front / angles / expression: Captured', 'Captures incomplete')}
  </div>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
    <button class="btn btn-primary" id="step7-continue"${haveFace?'':' disabled'}>✅ Looks Good, Continue</button>
    <button class="btn btn-ghost" id="step7-retake">↺ Retake</button>
  </div>
  ${haveFace?'':'<div style="color:var(--red);font-size:.8rem;margin-top:10px">A face capture is required. Please retake.</div>'}
</div>`;
    document.getElementById('step7-continue')?.addEventListener('click', nextStep);
    document.getElementById('step7-retake')?.addEventListener('click', () => { currentStep = 2; draw(); });
  }

  function drawStep8(c) {
    c.innerHTML = `
<div class="capture-step">
  <div class="capture-step-title">Create Your AI Twin Profile</div>
  <div class="capture-step-sub">Almost there. Give your twin a name.</div>
  <div class="form-group" style="max-width:400px;margin:20px auto">
    <label>Digital Human Name</label>
    <input type="text" id="twin-name" placeholder="e.g. My AI Twin" value="">
  </div>
  <div class="form-group" style="max-width:400px;margin:0 auto 24px">
    <label>Type</label>
    <select id="twin-type" style="width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text1)">
      <option value="self">My Digital Twin (me)</option>
      <option value="presenter">Presenter</option>
      <option value="influencer">Influencer</option>
    </select>
  </div>
  <div class="checkbox-group" style="max-width:400px;margin:0 auto 24px;text-align:left">
    <input type="checkbox" id="twin-consent-check">
    <label for="twin-consent-check" style="font-size:.82rem;color:var(--text2)">I confirm this is my likeness and I consent to create this AI digital twin.</label>
  </div>
  <button class="btn btn-primary btn-lg" id="create-twin-btn">Create My AI Twin →</button>
  <div id="step8-status" style="margin-top:12px"></div>
</div>`;

    document.getElementById('create-twin-btn').addEventListener('click', async () => {
      const name = document.getElementById('twin-name')?.value.trim();
      const consent = document.getElementById('twin-consent-check')?.checked;
      if (!name) { toast('Please enter a name for your AI twin.', 'error'); return; }
      if (!consent) { toast('You must confirm consent to create an AI twin.', 'error'); return; }

      const btn = document.getElementById('create-twin-btn');
      btn.disabled = true; btn.textContent = 'Creating…';
      const statusEl = document.getElementById('step8-status');

      try {
        const authHeaders = state.token ? { 'Authorization': `Bearer ${state.token}` } : {};
        // Upload face capture video
        if (videoBlobs.length > 0 && captureSessionId) {
          const combinedBlob = new Blob(videoBlobs, { type: 'video/webm' });
          statusEl.textContent = 'Uploading face capture…';
          const faceRes = await fetch(`/api/capture/session/upload?sessionId=${captureSessionId}&type=face`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': 'video/webm' },
            body: combinedBlob,
          });
          if (!faceRes.ok) throw new Error('Face upload failed');
        }
        // Upload voice consent separately
        if (audioBlob && captureSessionId) {
          statusEl.textContent = 'Uploading voice consent…';
          const voiceRes = await fetch(`/api/capture/session/upload?sessionId=${captureSessionId}&type=voice`, {
            method: 'POST',
            headers: { ...authHeaders, 'content-type': audioBlob.type || 'audio/webm' },
            body: audioBlob,
          });
          if (!voiceRes.ok) console.warn('Voice upload failed — continuing without voice');
        }

        statusEl.textContent = 'Creating your AI twin…';
        const res = await api('/api/digital-humans/create-from-capture', {
          method: 'POST',
          body: JSON.stringify({
            name,
            sessionId: captureSessionId,
            consentConfirmed: true,
          }),
        });

        stopStream();
        // Show success
        c.innerHTML = `
<div class="capture-step" style="padding:20px 0">
  <div style="font-size:3rem;margin-bottom:16px">🎉</div>
  <div class="capture-step-title">AI Twin Created!</div>
  <div class="capture-step-sub">"${escHtml(res.digitalHuman.name)}" is ready to use.</div>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px">
    <button class="btn btn-primary btn-lg" data-page="generate">Generate a Video Now</button>
    <button class="btn btn-ghost" data-page="my-humans">View All Twins</button>
  </div>
</div>`;
      } catch(e) {
        toast(e.message, 'error');
        btn.disabled = false; btn.textContent = 'Create My AI Twin →';
        statusEl.textContent = '';
      }
    });
  }

  draw();
}

// ── Create Fictional AI Human ─────────────────────────────────────────────
async function pageCreateFictional(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  let imageProvider = 'none';
  try { const h = await api('/api/workers/health'); imageProvider = h.imageProvider || 'none'; } catch {}
  const hasImageProvider = imageProvider !== 'none';

  el.innerHTML = `
<div style="max-width:640px">
  <div class="section-title mb-2">Generate a Synthetic AI Human</div>
  <div class="section-sub">Describe any person. We create a digital human with that identity.</div>

  ${hasImageProvider
    ? `<div class="plan-card mt-4" style="border-color:rgba(34,197,94,.3)">🖼 Image provider <b>${escHtml(imageProvider)}</b> is configured — a face photo will be generated automatically.</div>`
    : `<div class="provider-warning mt-4">⚠ No image provider configured — your synthetic human will need a manual face photo. Configure DALL·E, Stability AI, or FAL in <button class="link-btn" data-page="settings">Settings</button> for auto face generation.</div>`}

  <div class="card mt-4">
    <div class="form-row">
      <div class="form-group">
        <label>Gender</label>
        <select id="fc-gender">
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="non-binary">Non-binary</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label>Age Range</label>
        <select id="fc-age">
          <option value="18-25">18–25</option>
          <option value="25-35" selected>25–35</option>
          <option value="35-45">35–45</option>
          <option value="45-55">45–55</option>
          <option value="55+">55+</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Archetype <span>(role / use)</span></label>
      <select id="fc-archetype">
        <option value="presenter">Presenter</option>
        <option value="educator">Educator</option>
        <option value="influencer">Influencer</option>
        <option value="coach">Coach</option>
        <option value="news_anchor">News Anchor</option>
        <option value="real_estate">Real Estate</option>
        <option value="finance">Finance</option>
        <option value="fitness">Fitness</option>
        <option value="tech">Tech</option>
        <option value="custom">Custom</option>
      </select>
    </div>

    <div class="form-group">
      <label>Appearance <span>(describe ethnicity, features, look)</span></label>
      <textarea id="fc-appearance" rows="3" placeholder="e.g. South Asian woman, sharp features, confident professional look, dark hair"></textarea>
    </div>

    <div class="form-group">
      <label>Style / Outfit</label>
      <input type="text" id="fc-style" placeholder="e.g. luxury business attire, black blazer, minimal jewelry">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Voice Style</label>
        <select id="fc-voice">
          <option value="deep-male">Deep Male Professional</option>
          <option value="warm-female" selected>Warm Female Presenter</option>
          <option value="young-energetic">Young &amp; Energetic</option>
          <option value="british">British Accent</option>
          <option value="american">American Neutral</option>
          <option value="french">French Accent</option>
          <option value="west-african">West African Accent</option>
        </select>
      </div>
      <div class="form-group">
        <label>Personality</label>
        <select id="fc-personality">
          <option value="confident">Confident &amp; Direct</option>
          <option value="warm">Warm &amp; Friendly</option>
          <option value="motivational">Motivational</option>
          <option value="educational">Educational</option>
          <option value="luxury">Luxury &amp; Premium</option>
          <option value="casual">Casual &amp; Relatable</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Primary Use Case</label>
      <select id="fc-usecase">
        <option value="ads">Ads &amp; Marketing</option>
        <option value="education">Teaching &amp; Education</option>
        <option value="social">Social Media</option>
        <option value="sales">Sales</option>
        <option value="podcast">Podcast &amp; Hosting</option>
        <option value="brand">Brand Ambassador</option>
      </select>
    </div>

    <div class="consent-box" style="background:rgba(234,179,8,.06);border-color:rgba(234,179,8,.25)">
      <h4 style="color:var(--yellow)">⚠️ Fictional AI Identity</h4>
      <p>This creates a completely fictional AI identity. No real person's likeness will be used. Clearly marked as AI-generated.</p>
    </div>

    <div class="checkbox-group mb-4" style="margin-top:16px">
      <input type="checkbox" id="fc-consent-check">
      <label for="fc-consent-check">I confirm this is a fictional AI human and I will not claim it is a real person.</label>
    </div>

    <button class="btn btn-primary btn-lg" id="fc-generate-btn">✨ Generate Synthetic AI Human</button>
    <div id="fc-status" style="margin-top:12px"></div>
  </div>
</div>`;

  document.getElementById('fc-generate-btn').addEventListener('click', async () => {
    const appearance = document.getElementById('fc-appearance')?.value.trim();
    const consent = document.getElementById('fc-consent-check')?.checked;
    if (!appearance) { toast('Please describe the appearance of your AI human.', 'error'); return; }
    if (!consent) { toast('Please confirm this is a fictional AI human.', 'error'); return; }

    const btn = document.getElementById('fc-generate-btn');
    const statusEl = document.getElementById('fc-status');
    btn.disabled = true; btn.textContent = '✨ Generating your AI human…';
    statusEl.innerHTML = `<div class="loader" style="margin:0 auto"></div>`;

    try {
      const res = await api('/api/digital-humans/create-fictional', {
        method: 'POST',
        body: JSON.stringify({
          gender: document.getElementById('fc-gender')?.value,
          ageRange: document.getElementById('fc-age')?.value,
          appearance,
          style: document.getElementById('fc-style')?.value,
          voiceStyle: document.getElementById('fc-voice')?.value,
          personality: document.getElementById('fc-personality')?.value,
          useCase: document.getElementById('fc-usecase')?.value,
          archetype: document.getElementById('fc-archetype')?.value,
        }),
      });
      const dh = res.digitalHuman;
      state.selectedDH = dh.id;
      const isReady = dh.status === 'ready';
      statusEl.innerHTML = `
<div class="card" style="border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.06);margin-top:16px">
  <div style="font-size:2rem;margin-bottom:8px">✅</div>
  <div class="font-bold mb-2" style="font-size:1.1rem">${escHtml(dh.name)} created!</div>
  <div class="text-muted text-sm mb-3">Synthetic AI · ${escHtml(dh.archetype||'custom')} · Voice: ${escHtml(dh.defaultVoice||'')}</div>
  ${isReady
    ? `<div class="plan-card" style="border-color:rgba(34,197,94,.3);margin-bottom:16px">🎉 Face image generated automatically — ready to generate video.</div>`
    : `<div class="provider-warning" style="margin-bottom:16px">⚠ Face generation requires an image provider. Upload a face photo manually or configure DALL·E / Stability / FAL in Settings.</div>`}
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${isReady
      ? `<button class="btn btn-primary" data-page="generate">🎬 Generate Video →</button>`
      : `<button class="btn btn-primary" id="fic-upload-face-btn">📸 Upload Face Photo →</button>`}
    <button class="btn btn-ghost btn-sm" data-page="my-humans">View All Humans</button>
  </div>
</div>`;
      document.getElementById('fic-upload-face-btn')?.addEventListener('click', () => navigate('view-human', { id: dh.id }));
      btn.style.display = 'none';
    } catch(e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = '✨ Generate Synthetic AI Human';
      statusEl.innerHTML = '';
    }
  });
}

// ── Settings ───────────────────────────────────────────────────────────────────
async function pageSettings(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const { settings } = await api('/api/settings');
    const get = (key) => settings.find(s => s.key === key)?.value || '';

    el.innerHTML = `
<div class="section-title mb-6">Settings</div>

<div class="settings-section">
  <div class="settings-section-title">AI Provider</div>
  <div class="settings-row">
    <div class="settings-label">Runtime Mode</div>
    <div class="settings-input">
      <select id="set-runtime" style="width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text1)">
        <option value="local" ${get('AI_RUNTIME_MODE')==='local'?'selected':''}>Local (Free, requires workers)</option>
        <option value="hybrid" ${get('AI_RUNTIME_MODE')==='hybrid'?'selected':''}>Hybrid (Local + Cloud fallback)</option>
        <option value="cloud" ${get('AI_RUNTIME_MODE')==='cloud'?'selected':''}>Cloud (Fastest, requires API keys)</option>
      </select>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">TTS Provider</div>
    <div class="settings-input">
      <select id="set-tts" style="width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text1)">
        <option value="piper" ${get('TTS_PROVIDER')==='piper'?'selected':''}>Piper (Local, free)</option>
        <option value="elevenlabs" ${get('TTS_PROVIDER')==='elevenlabs'?'selected':''}>ElevenLabs (Cloud, high quality)</option>
        <option value="system" ${get('TTS_PROVIDER')==='system'?'selected':''}>System TTS (macOS say command)</option>
      </select>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Lipsync Provider</div>
    <div class="settings-input">
      <select id="set-lipsync" style="width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text1)">
        <option value="wav2lip" ${get('LIPSYNC_PROVIDER')==='wav2lip'?'selected':''}>Wav2Lip (Local, requires setup)</option>
        <option value="sadtalker" ${get('LIPSYNC_PROVIDER')==='sadtalker'?'selected':''}>SadTalker (Local, higher quality)</option>
        <option value="muapi" ${get('LIPSYNC_PROVIDER')==='muapi'?'selected':''}>Muapi (Cloud)</option>
        <option value="static" ${get('LIPSYNC_PROVIDER')==='static'?'selected':''}>Static (No lipsync, just audio over image)</option>
      </select>
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">API Keys</div>
  <div class="settings-row">
    <div class="settings-label">Gemini AI Key</div>
    <div class="settings-input">
      <input type="password" id="set-gemini" value="${escHtml(get('GEMINI_API_KEY'))}" placeholder="AIza...">
      <div class="settings-hint">Get your free key at <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Gemini Model</div>
    <div class="settings-input">
      <input type="text" id="set-gemini-model" value="${escHtml(get('GEMINI_MODEL')||'gemini-2.5-flash-lite')}" placeholder="gemini-2.5-flash-lite">
      <div class="settings-hint">Default: gemini-2.5-flash-lite</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">ElevenLabs Key</div>
    <div class="settings-input">
      <input type="password" id="set-elevenlabs" value="${escHtml(get('VOICE_API_KEY'))}" placeholder="sk-...">
      <div class="settings-hint">Required for ElevenLabs TTS provider</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label"></div>
    <div class="settings-input">
      <button class="btn btn-ghost btn-sm" id="test-gemini-btn">Test Gemini Connection</button>
      <span id="gemini-test-result" style="margin-left:10px;font-size:.8rem;color:var(--text3)"></span>
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">AI Video Generation (Quality Levels 3–4)</div>
  <div class="settings-row">
    <div class="settings-label">Video Provider</div>
    <div class="settings-input">
      <select id="set-video-provider" style="width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text1)">
        <option value="static" ${get('VIDEO_GEN_PROVIDER')==='static'?'selected':''}>Static Fallback (Level 1 — no real motion)</option>
        <option value="runway" ${get('VIDEO_GEN_PROVIDER')==='runway'?'selected':''}>Runway Gen-3 (Level 4 full scene)</option>
        <option value="kling" ${get('VIDEO_GEN_PROVIDER')==='kling'?'selected':''}>Kling AI (Level 4 full scene)</option>
        <option value="pika" ${get('VIDEO_GEN_PROVIDER')==='pika'?'selected':''}>Pika Labs (Level 3 motion)</option>
        <option value="luma" ${get('VIDEO_GEN_PROVIDER')==='luma'?'selected':''}>Luma Dream Machine (Level 3 motion)</option>
        <option value="hailuo" ${get('VIDEO_GEN_PROVIDER')==='hailuo'?'selected':''}>Hailuo / MiniMax (Level 3 motion)</option>
        <option value="replicate" ${get('VIDEO_GEN_PROVIDER')==='replicate'?'selected':''}>Replicate (Level 3 motion)</option>
      </select>
      <div class="settings-hint">Static = still image + audio only. Cloud providers generate real AI video.</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Video API Key</div>
    <div class="settings-input">
      <input type="password" id="set-video-key" value="${escHtml(get('VIDEO_GEN_API_KEY'))}" placeholder="Provider API key">
      <div class="settings-hint">Required for the selected cloud video provider.</div>
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">AI Image Generation (Synthetic Faces)</div>
  <div class="settings-row">
    <div class="settings-label">Image Provider</div>
    <div class="settings-input">
      <select id="set-image-provider" style="width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text1)">
        <option value="none" ${get('IMAGE_GEN_PROVIDER')==='none'?'selected':''}>None (manual face upload)</option>
        <option value="dalle" ${get('IMAGE_GEN_PROVIDER')==='dalle'?'selected':''}>DALL·E 3 (OpenAI)</option>
        <option value="stability" ${get('IMAGE_GEN_PROVIDER')==='stability'?'selected':''}>Stability AI</option>
        <option value="fal" ${get('IMAGE_GEN_PROVIDER')==='fal'?'selected':''}>FAL (FLUX)</option>
        <option value="replicate" ${get('IMAGE_GEN_PROVIDER')==='replicate'?'selected':''}>Replicate (FLUX)</option>
      </select>
      <div class="settings-hint">Auto-generates a face for synthetic humans created from a prompt.</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Image API Key</div>
    <div class="settings-input">
      <input type="password" id="set-image-key" value="${escHtml(get('IMAGE_GEN_API_KEY'))}" placeholder="Provider API key">
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">Paths</div>
  <div class="settings-row">
    <div class="settings-label">FFmpeg Path</div>
    <div class="settings-input">
      <input type="text" id="set-ffmpeg" value="${escHtml(get('FFMPEG_PATH')||'ffmpeg')}" placeholder="ffmpeg">
      <div class="settings-hint">Full path to ffmpeg binary, or just "ffmpeg" if in PATH</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Wav2Lip Path</div>
    <div class="settings-input">
      <input type="text" id="set-wav2lip" value="${escHtml(get('WAV2LIP_PATH'))}" placeholder="/path/to/Wav2Lip">
    </div>
  </div>
</div>

<div style="display:flex;gap:10px;margin-bottom:32px">
  <button class="btn btn-primary" id="save-settings-btn">Save Settings</button>
  <div id="settings-save-status" style="display:flex;align-items:center;font-size:.85rem;color:var(--text3)"></div>
</div>

<div class="settings-section" style="border-top:1px solid rgba(239,68,68,.2);padding-top:24px">
  <div class="settings-section-title" style="color:var(--red)">Danger Zone</div>
  <div class="settings-row">
    <div class="settings-label">Reset Settings</div>
    <div class="settings-input">
      <button class="btn btn-danger btn-sm" id="reset-settings-btn">Reset to Defaults</button>
      <div class="settings-hint">Resets all provider settings. API keys will be cleared.</div>
    </div>
  </div>
</div>`;

    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('save-settings-btn');
      const status = document.getElementById('settings-save-status');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const settingsList = [
          { key: 'AI_RUNTIME_MODE', value: document.getElementById('set-runtime')?.value },
          { key: 'TTS_PROVIDER', value: document.getElementById('set-tts')?.value },
          { key: 'LIPSYNC_PROVIDER', value: document.getElementById('set-lipsync')?.value },
          { key: 'GEMINI_API_KEY', value: document.getElementById('set-gemini')?.value },
          { key: 'GEMINI_MODEL', value: document.getElementById('set-gemini-model')?.value || 'gemini-2.5-flash-lite' },
          { key: 'VOICE_API_KEY', value: document.getElementById('set-elevenlabs')?.value },
          { key: 'WAV2LIP_PATH', value: document.getElementById('set-wav2lip')?.value },
          { key: 'FFMPEG_PATH', value: document.getElementById('set-ffmpeg')?.value || 'ffmpeg' },
          { key: 'VIDEO_GEN_PROVIDER', value: document.getElementById('set-video-provider')?.value || 'static' },
          { key: 'VIDEO_GEN_API_KEY', value: document.getElementById('set-video-key')?.value || '' },
          { key: 'IMAGE_GEN_PROVIDER', value: document.getElementById('set-image-provider')?.value || 'none' },
          { key: 'IMAGE_GEN_API_KEY', value: document.getElementById('set-image-key')?.value || '' },
        ];
        await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ settings: settingsList }) });
        status.textContent = '✅ Saved!'; status.style.color = 'var(--green)';
        toast('Settings saved!', 'success');
      } catch(e) { toast(e.message, 'error'); status.textContent = '❌ ' + e.message; status.style.color = 'var(--red)'; }
      btn.disabled = false; btn.textContent = 'Save Settings';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });

    document.getElementById('test-gemini-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('test-gemini-btn');
      const result = document.getElementById('gemini-test-result');
      btn.disabled = true; result.textContent = 'Testing…'; result.style.color = 'var(--text3)';
      try {
        const d = await api('/api/settings/test-gemini', { method: 'POST' });
        result.textContent = d.ok ? `✅ ${d.message}` : `❌ ${d.message}`;
        result.style.color = d.ok ? 'var(--green)' : 'var(--red)';
      } catch(e) { result.textContent = '❌ ' + e.message; result.style.color = 'var(--red)'; }
      btn.disabled = false;
    });

    document.getElementById('reset-settings-btn')?.addEventListener('click', async () => {
      if (!confirm('Reset all settings to defaults? API keys will be cleared.')) return;
      const defaults = [
        { key: 'AI_RUNTIME_MODE', value: 'hybrid' },
        { key: 'TTS_PROVIDER', value: 'piper' },
        { key: 'LIPSYNC_PROVIDER', value: 'wav2lip' },
        { key: 'GEMINI_API_KEY', value: '' },
        { key: 'VOICE_API_KEY', value: '' },
      ];
      try {
        await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ settings: defaults }) });
        toast('Settings reset to defaults.', 'success');
        pageSettings(el);
      } catch(e) { toast(e.message, 'error'); }
    });
  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

// ── Utils ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
if (!document.getElementById('toasts')) {
  const t = document.createElement('div'); t.id = 'toasts'; document.body.appendChild(t);
}

async function restoreSession() {
  // Restore page from URL hash before anything else
  const hash = location.hash.replace('#', '').trim();
  if (hash && VALID_PAGES.includes(hash)) state.page = hash;

  if (!state.token) return;
  try {
    const r = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (r.ok) { const d = await r.json(); state.user = d.user; }
    else { state.token = null; localStorage.removeItem('dhs_token'); }
  } catch { state.token = null; }
}

restoreSession().then(() => render());
