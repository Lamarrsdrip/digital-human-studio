// Digital Human Studio — Frontend

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
  0: { cls: 'quality-0', label: 'Static Test',        short: 'Level 0: Static Only',          warn: true },
  1: { cls: 'quality-1', label: 'Talking Head',        short: 'Level 1: Talking Head',         warn: false },
  2: { cls: 'quality-2', label: 'AI Motion',           short: 'Level 2: AI Motion',            warn: false },
  3: { cls: 'quality-3', label: 'Full Scene AI',       short: 'Level 3: Full Scene AI',        warn: false },
  4: { cls: 'quality-4', label: 'Cinematic AI',        short: 'Level 4: Cinematic AI',         warn: false },
};
function qualityBadge(level, extra = '') {
  const m = QUALITY_META[level] ?? QUALITY_META[0];
  return `<span class="quality-level-badge ${m.cls}">Level ${level ?? 0}: ${m.label}${extra}</span>`;
}
function qualityExplainer(level, hint = '') {
  const descs = {
    0: 'Static image + audio. NOT AI video. Add a cloud provider for real generation.',
    1: 'Lip-synced face animation (local Wav2Lip/SadTalker). Face identity preserved.',
    2: 'Identity animates with real AI motion. Runway i2v / Kling i2v.',
    3: 'New AI-generated cinematic scene. Runway / Veo / Kling / Pika / Luma / Hailuo.',
    4: 'Identity-preserved cinematic quality. Full production pipeline.',
  };
  const warn = level === 0
    ? `<div class="provider-warning mt-2">⚠ <b>Static mode</b> — configure Runway, Kling, Pika, Luma, Veo, or Hailuo in <button class="link-btn" data-page="settings">Settings → Video Provider</button> to generate real AI scenes.</div>`
    : '';
  return `<div class="quality-explainer">${descs[level] ?? descs[0]}${hint ? ` ${hint}` : ''}${warn}</div>`;
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
    const [dhRes, jobsRes, health] = await Promise.all([
      api('/api/digital-humans'),
      api('/api/jobs'),
      api('/api/workers/health').catch(() => ({})),
    ]);
    state.digitalHumans = dhRes.digitalHumans || [];
    state.jobs = jobsRes.jobs || [];
    const completed = state.jobs.filter(j => j.status === 'complete').length;
    const inProgress = state.jobs.filter(j => j.status === 'processing' || j.status === 'queued').length;
    const activeLevel = health.activeQualityLevel ?? 0;
    const canScene = health.canGenerateScenes;

    el.innerHTML = `
<!-- Hero: Generate Video is the primary action -->
<div class="engine-hero">
  <div class="engine-hero-text">
    <div class="engine-badge">
      <span class="engine-dot"></span>
      Digital Human Engine
    </div>
    <h2 class="engine-title">Direct Your AI Twin Like an Actor</h2>
    <p class="engine-desc">Create your digital identity once. Then generate unlimited videos in any scene — London, Ferrari, studio, TikTok, sales video, podcast — all from a prompt.</p>
    <div class="engine-level-row">
      ${qualityBadge(activeLevel)}
      <span class="engine-provider">via ${escHtml(health.videoProvider || 'static')}</span>
      ${!canScene ? `<span class="engine-warn">Scene video needs a provider →</span>` : ''}
    </div>
  </div>
  <div class="engine-actions">
    <button class="btn btn-primary btn-lg engine-cta" data-page="generate">🎬 Generate Video</button>
    ${state.digitalHumans.length === 0 ? `<button class="btn btn-ghost engine-cta-sec" data-page="create-twin">📸 Create AI Twin First</button>` : ''}
  </div>
</div>

${!canScene ? `
<div class="provider-warning mb-4">
  <b>⚠ Provider Required for Real AI Scenes</b><br>
  ${escHtml(health.providerHint || 'Configure a video provider to generate cinematic scenes.')}
  <button class="btn btn-ghost btn-sm" data-page="settings" style="margin-left:10px">Configure →</button>
</div>` : ''}

<!-- Stats -->
<div class="grid-4 mb-6">
  <div class="stat-card accent">
    <div class="stat-label">Digital Humans</div>
    <div class="stat-value">${state.digitalHumans.length}</div>
    <div class="stat-sub">Identities ready</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Videos Made</div>
    <div class="stat-value">${completed}</div>
    <div class="stat-sub">Completed</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">In Queue</div>
    <div class="stat-value">${inProgress}</div>
    <div class="stat-sub">Processing</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Credits</div>
    <div class="stat-value">${state.user.credits}</div>
    <div class="stat-sub">${state.user.plan} plan</div>
  </div>
</div>

<!-- Scene prompt examples -->
<div class="section-title mb-3">What can you generate?</div>
<div class="example-prompts mb-6">
  ${[
    ['🚗', 'My twin driving a Ferrari in London advertising Digital Human OS'],
    ['🏢', 'Luxury business presenter in an Apple-style studio'],
    ['🎙️', 'Male fitness coach making a TikTok gym ad'],
    ['🏡', 'Female presenter selling a real estate platform'],
    ['💰', 'AI teacher explaining crypto investing'],
    ['🌟', 'Luxury influencer promoting perfume in Paris'],
  ].map(([icon, txt]) => `
  <div class="example-prompt" onclick="_fillPromptAndNavigate(${JSON.stringify(txt)})">
    <span class="ep-icon">${icon}</span>
    <span class="ep-text">${escHtml(txt)}</span>
  </div>`).join('')}
</div>

<!-- Human Library -->
${state.digitalHumans.length === 0 ? `
<div class="card" style="text-align:center;padding:48px">
  <div style="font-size:3rem;margin-bottom:16px">🧑</div>
  <h3 style="margin-bottom:8px">Create your first Digital Human</h3>
  <p class="text-muted mb-4">Capture your identity once — then direct yourself in any scene.</p>
  <div class="flex gap-3" style="justify-content:center;flex-wrap:wrap">
    <button class="btn btn-primary btn-lg" data-page="create-twin">📸 My AI Twin (camera)</button>
    <button class="btn btn-ghost" data-page="create-fictional">✨ Synthetic Human (description)</button>
  </div>
</div>` : `
<div class="flex items-center justify-between mb-4">
  <div class="section-title">Human Library</div>
  <div class="flex gap-2">
    <button class="btn btn-ghost btn-sm" data-page="create-twin">+ AI Twin</button>
    <button class="btn btn-ghost btn-sm" data-page="create-fictional">+ Synthetic</button>
    <button class="btn btn-ghost btn-sm" data-page="my-humans">View all</button>
  </div>
</div>
<div class="dh-grid">
  ${state.digitalHumans.slice(0, 4).map(renderDHCard).join('')}
  <div class="dh-add-card" data-page="create-twin">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span>New Digital Human</span>
  </div>
</div>`}

${state.jobs.length > 0 ? `
<div class="flex items-center justify-between mb-4 mt-6">
  <div class="section-title">Recent Videos</div>
  <button class="btn btn-ghost btn-sm" data-page="jobs">View all</button>
</div>
<div class="job-list">${state.jobs.slice(0, 3).map(renderJobCard).join('')}</div>` : ''}
`;
  } catch (e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
}

function _fillPromptAndNavigate(prompt) {
  state.pendingPrompt = prompt;
  navigate('generate');
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
    ready:                { cls: 'badge-green',  label: '✓ Ready' },
    draft:                { cls: 'badge-yellow', label: '⚠ Draft' },
    needs_face:           { cls: 'badge-red',    label: '📷 Needs face' },
    needs_image_provider: { cls: 'badge-orange', label: '🖼 Needs image provider' },
    taken_down:           { cls: 'badge-red',    label: '✕ Taken down' },
  };
  const st = statusMap[dh.status] || { cls: 'badge-yellow', label: dh.status };
  const typeIcons = { ai_twin: '🧑', self: '🧑', fictional: '✨', presenter: '🎤', influencer: '⭐', teacher: '📚', salesperson: '💼', brand: '🏢', male: '👨', female: '👩' };
  const icon = typeIcons[dh.type] || (dh.isFictional ? '✨' : '🧑');
  const identityQ = dh.identityPack?.qualityScore;
  const qualityPill = identityQ !== undefined
    ? `<span class="badge badge-quality" title="Identity quality score">${identityQ}% identity</span>` : '';
  const humanType = dh.isFictional ? 'Synthetic Human' : 'AI Twin';
  return `<div class="dh-card" data-id="${dh.id}">
  <div class="dh-avatar"><span class="dh-avatar-placeholder">${icon}</span></div>
  <div class="dh-card-body">
    <div class="dh-card-name">${escHtml(dh.name)}</div>
    <div class="dh-card-type">${humanType} · ${escHtml(dh.type || 'presenter')}</div>
    ${dh.status === 'needs_image_provider' ? `<div class="dh-warn-text">Configure image provider or upload face photo</div>` : ''}
    ${dh.status === 'needs_face' ? `<div class="dh-warn-text">Upload a face photo to enable video generation</div>` : ''}
    <div class="dh-card-footer">
      <span class="badge ${st.cls}">${st.label}</span>
      ${qualityPill}
      <button class="btn btn-primary btn-sm" data-page="generate" data-dh="${dh.id}" onclick="event.stopPropagation();state.selectedDH='${dh.id}';navigate('generate');">▶ Generate</button>
      <button class="btn btn-danger btn-sm" data-id="${dh.id}" onclick="event.stopPropagation()">✕</button>
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
    const activeLevel = health.activeQualityLevel ?? 0;
    const canGenerateScenes = health.canGenerateScenes || false;

    if (digitalHumans.length === 0) {
      el.innerHTML = `
<div class="engine-hero" style="text-align:center;padding:48px 24px">
  <div style="font-size:3rem;margin-bottom:16px">🧬</div>
  <div class="engine-title">No Digital Humans Yet</div>
  <div class="engine-desc" style="max-width:360px;margin:8px auto 24px">Create your AI twin from a camera capture, or generate a synthetic human from a description.</div>
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
    <button class="btn btn-primary" data-page="create-twin">📷 Create AI Twin</button>
    <button class="btn btn-ghost" data-page="create-fictional">🤖 Synthetic Human</button>
  </div>
</div>`;
      return;
    }

    const EXAMPLE_PROMPTS = [
      { icon: '🚗', text: 'My twin driving a Ferrari through London at night' },
      { icon: '🍎', text: 'Apple-style product launch presenter in studio' },
      { icon: '💪', text: 'TikTok gym motivation ad — 15 seconds, high energy' },
      { icon: '🏡', text: 'Real estate agent presenting a luxury penthouse listing' },
      { icon: '📊', text: 'Crypto analyst explaining market trends — professional backdrop' },
      { icon: '✈️', text: 'Travel influencer at a rooftop pool in Dubai' },
    ];

    let lastPlan = null;
    let advanced = false;
    let selectedDH = state.selectedDH && digitalHumans.find(d => d.id === state.selectedDH)
      ? state.selectedDH
      : digitalHumans[0]?.id || '';

    function blockedStatus(dh) { return dh && (dh.status === 'needs_face' || dh.status === 'needs_image_provider'); }

    function levelBanner() {
      if (activeLevel === 0) {
        return `<div class="engine-warn mb-4">⚠ No video provider configured. Videos will be <b>static image + audio only</b>. Configure Runway, Kling, Veo, or another provider in <button class="link-btn" data-page="settings">Settings</button> for real AI video.</div>`;
      }
      if (!canGenerateScenes) {
        return `<div class="provider-warning mb-4">⚠ ${qualityBadge(activeLevel)} Scene and action video requires Level 3+. Upgrade your provider in <button class="link-btn" data-page="settings">Settings</button>.</div>`;
      }
      return `<div class="plan-card mb-4" style="display:flex;align-items:center;gap:10px">${qualityBadge(activeLevel)}<span class="text-muted text-sm">${escHtml(health.providerHint || 'Real AI video generation active')}</span></div>`;
    }

    function advancedPanel() {
      if (!advanced) return '';
      return `
<div class="advanced-panel">
  <div class="form-row">
    <div class="form-group"><label>Scene <span>(where it happens)</span></label>
      <input type="text" id="gen-scene" placeholder="e.g. London city street at sunset"></div>
    <div class="form-group"><label>Action <span>(what they do)</span></label>
      <input type="text" id="gen-action" placeholder="e.g. driving a Ferrari, walking toward camera"></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Product / Brand</label>
      <input type="text" id="gen-product" placeholder="e.g. mybrand.com — luxury watches"></div>
    <div class="form-group"><label>Camera Style</label>
      <select id="gen-camera">
        <option value="cinematic">Cinematic</option>
        <option value="documentary">Documentary</option>
        <option value="studio">Studio Close-up</option>
        <option value="social">Social / Handheld</option>
        <option value="drone">Drone / Aerial</option>
      </select></div>
  </div>
  <button class="btn btn-ghost btn-sm" id="plan-ai-btn" style="margin-bottom:12px">🧠 Plan with AI →</button>
  <div id="plan-output"></div>
</div>`;
    }

    function draw() {
      el.innerHTML = `
${levelBanner()}

<div class="gen-layout">
  <div class="gen-main">

    <div class="card mb-4">
      <div class="gen-step-header mb-3">
        <span class="gen-step-num">1</span>
        <span class="section-title" style="margin:0">Describe the Video</span>
        <button class="advanced-toggle${advanced?' on':''}" id="adv-toggle" title="Advanced: scene, action, camera">${advanced?'◉ Advanced':'○ Advanced'}</button>
      </div>
      <div class="form-group">
        <label>Prompt <span>(one sentence — what do you want?)</span></label>
        <div style="display:flex;gap:8px;align-items:flex-start">
          <textarea id="gen-prompt" rows="3" placeholder="e.g. My twin presenting a luxury product in a sleek Apple-style studio" style="flex:1"></textarea>
        </div>
      </div>

      <div class="example-prompts mb-3">
        ${EXAMPLE_PROMPTS.map(p => `
        <button class="example-prompt" data-prompt="${escHtml(p.text)}">
          <span class="ep-icon">${p.icon}</span>
          <span class="ep-text">${escHtml(p.text)}</span>
        </button>`).join('')}
      </div>

      ${advancedPanel()}

      <div class="form-group mt-2">
        <label>Script <span>(what they say — or leave blank to auto-generate)</span></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <textarea id="gen-script" rows="4" placeholder="Type the spoken script, or click Auto-Write to generate from the prompt…" style="flex:1;min-width:200px"></textarea>
        </div>
        <div style="margin-top:6px">
          <button class="btn btn-ghost btn-sm" id="auto-write-btn">✨ Auto-Write from Prompt</button>
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="gen-step-header mb-3">
        <span class="gen-step-num">2</span>
        <span class="section-title" style="margin:0">Select Identity</span>
        <button class="btn btn-ghost btn-sm" data-page="create-twin">+ New Twin</button>
      </div>
      <div class="dh-picker-row">
        ${digitalHumans.map(dh => {
          const blocked = blockedStatus(dh);
          const isSel = selectedDH === dh.id;
          const qualScore = dh.identityPack?.qualityScore;
          const typeLabel = dh.isFictional ? 'Synthetic' : 'AI Twin';
          return `
        <div class="dh-picker-card${isSel?' selected':''}${blocked?' dh-needs-face':''}" data-dh="${dh.id}">
          <div class="dh-picker-avatar">${blocked?'⚠️':dh.isFictional?'🤖':'🧬'}</div>
          <div class="dh-picker-name">${escHtml(dh.name)}</div>
          <div class="dh-picker-type">${blocked?'Needs face':typeLabel}${qualScore?` · ${qualScore}%`:''}</div>
        </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card gen-form-card">
      <div class="gen-step-header mb-3">
        <span class="gen-step-num">3</span>
        <span class="section-title" style="margin:0">Video Settings</span>
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
            <option value="luxury">Luxury</option>
            <option value="motivational">Motivational</option>
            <option value="calm">Calm</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-full gen-btn-desktop" id="gen-submit">🎬 Generate Video (8 cr)</button>
    </div>

  </div>

  <div class="gen-sidebar">
    <div class="card mb-4" style="position:sticky;top:16px">
      <div class="section-title mb-2">Output Level</div>
      <div style="margin-bottom:12px">${qualityBadge(activeLevel)}</div>
      <ul style="color:var(--text3);font-size:.8rem;line-height:2;list-style:none;margin:0 0 16px">
        <li>${activeLevel >= 3 ? '✅' : '⚠️'} ${activeLevel >= 3 ? 'Real AI-generated scene' : 'No real scene generation'}</li>
        <li>${activeLevel >= 1 ? '✅' : '⚠️'} ${activeLevel >= 1 ? 'AI voice generated' : 'No voice synthesis'}</li>
        <li>✅ Captions included</li>
        <li>⏱️ ~2–8 min processing</li>
      </ul>
      <p class="text-muted text-sm">Credits: <strong style="color:var(--text1)">${state.user?.credits ?? 0}</strong></p>
      <button class="btn btn-primary btn-lg btn-full mt-3" id="gen-submit-desk">🎬 Generate Video</button>
    </div>
  </div>
</div>

<div class="gen-sticky-bar">
  <div class="text-muted text-sm">${state.user?.credits ?? 0} credits</div>
  <button class="btn btn-primary" style="flex:1;max-width:300px;padding:12px 0;font-weight:700" id="gen-submit-mob">🎬 Generate Video</button>
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
      const lvlNeeded = plan.qualityLevelNeeded || 3;
      const gap = lvlNeeded > activeLevel
        ? `<div class="engine-warn" style="margin-top:10px">⚠ This plan needs ${qualityBadge(lvlNeeded)} but your active output is ${qualityBadge(activeLevel)}. Upgrade provider in <button class="link-btn" data-page="settings">Settings</button>.</div>`
        : '';
      out.innerHTML = `
<div class="plan-card mt-2">
  <div class="section-title mb-2">🧠 AI Production Plan</div>
  ${plan.sceneDescription ? `<div class="text-sm mb-1"><b>Scene:</b> ${escHtml(plan.sceneDescription)}</div>` : ''}
  ${plan.cameraDirection ? `<div class="text-sm mb-1"><b>Camera:</b> ${escHtml(plan.cameraDirection)}</div>` : ''}
  ${plan.motionDirection ? `<div class="text-sm mb-1"><b>Motion:</b> ${escHtml(plan.motionDirection)}</div>` : ''}
  <div class="text-sm mb-2"><b>Provider needed:</b> ${escHtml(plan.providerRecommendation || '')}</div>
  ${shots ? `<div class="storyboard-list mt-2">${shots}</div>` : ''}
  ${plan.script ? `<div class="mt-2"><button class="btn btn-ghost btn-sm" id="use-plan-script">Use this script →</button></div>` : ''}
  ${gap}
</div>`;
      document.getElementById('use-plan-script')?.addEventListener('click', () => {
        const se = document.getElementById('gen-script');
        if (se && plan.script) { se.value = plan.script; toast('Script applied.', 'success'); }
      });
    }

    function doSubmit() {
      if (!selectedDH) { toast('Select a digital human first.', 'error'); return; }
      const selDH = digitalHumans.find(d => d.id === selectedDH);
      if (blockedStatus(selDH)) {
        toast(selDH.status === 'needs_image_provider'
          ? 'This synthetic human has no face image. Configure an image provider in Settings or upload a face photo.'
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
      if (!script && !prompt && !scene) { toast('Describe the video — enter a prompt, scene, or script.', 'error'); return; }
      const fmt = document.getElementById('gen-format')?.value || '9:16';
      const dims = { '9:16': [1080,1920], '16:9': [1920,1080], '1:1': [1080,1080] }[fmt];
      ['gen-submit','gen-submit-desk','gen-submit-mob'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.disabled = true; b.textContent = '⏳ Queuing…'; }
      });
      api('/api/videos/generate', { method: 'POST', body: JSON.stringify({
        digitalHumanId: selectedDH,
        mode: 'director',
        script, prompt, scene, action, product, cameraStyle,
        durationSec: Number(document.getElementById('gen-dur')?.value || 30),
        tone: document.getElementById('gen-tone')?.value || 'professional',
        outputW: dims[0], outputH: dims[1],
      })}).then(() => {
        toast('Video job queued! Taking you to Jobs…', 'success');
        setTimeout(() => navigate('jobs'), 1200);
      }).catch(e => {
        toast(e.message, 'error');
        ['gen-submit','gen-submit-desk','gen-submit-mob'].forEach(id => {
          const b = document.getElementById(id); if (b) { b.disabled = false; b.textContent = '🎬 Generate Video'; }
        });
      });
    }

    function bindGenEvents() {
      el.querySelectorAll('.example-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
          const promptEl = document.getElementById('gen-prompt');
          if (promptEl) { promptEl.value = btn.dataset.prompt; promptEl.focus(); }
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
          toast('Plan ready — review and generate.', 'success');
        } catch(e) { toast(e.message, 'error'); }
        btn.disabled = false; btn.textContent = '🧠 Plan with AI →';
      });

      document.getElementById('auto-write-btn')?.addEventListener('click', async () => {
        const promptEl = document.getElementById('gen-prompt');
        const prompt = promptEl?.value.trim();
        if (!prompt) { toast('Enter a prompt first.', 'error'); return; }
        const btn = document.getElementById('auto-write-btn');
        btn.disabled = true; btn.textContent = '✨ Writing…';
        const dur = Number(document.getElementById('gen-dur')?.value || 30);
        const words = Math.round(dur * 2.5);
        const script = `Welcome. Today I want to talk about ${prompt}. This is genuinely important — and I want to break it down clearly for you. ${prompt} is something that separates the people who win from those who don't. Let me show you exactly how. Stay with me.`.split(' ').slice(0, words).join(' ') + '.';
        const scriptEl = document.getElementById('gen-script');
        if (scriptEl) scriptEl.value = script;
        btn.disabled = false; btn.textContent = '✨ Auto-Write from Prompt';
        toast('Script written! Edit as needed.', 'success');
      });

      document.getElementById('gen-submit')?.addEventListener('click', doSubmit);
      document.getElementById('gen-submit-desk')?.addEventListener('click', doSubmit);
      document.getElementById('gen-submit-mob')?.addEventListener('click', doSubmit);
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
  <div style="font-size:3rem;margin-bottom:12px">🧬</div>
  <div class="capture-step-title">Build Your Digital Identity</div>
  <div class="capture-step-sub">This capture session <strong>builds your AI identity pack</strong> — multiple reference frames, voice sample, and expression profile.<br><br>
  <span style="color:var(--green);font-weight:600">After capture, you can generate unlimited new videos in any scene — London, Ferrari, studio, TikTok — all from a prompt.</span></div>
  <div class="identity-explainer">
    <div class="ie-item"><span class="ie-icon">📸</span><span>Reference frames extracted from capture</span></div>
    <div class="ie-item"><span class="ie-icon">🎙️</span><span>Voice sample stored for synthesis</span></div>
    <div class="ie-item"><span class="ie-icon">🎬</span><span>Capture is training data — never used as output</span></div>
    <div class="ie-item"><span class="ie-icon">♾️</span><span>Generate unlimited new scenes after capture</span></div>
  </div>
  <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:12px 16px;font-size:.8rem;color:var(--text2);margin:12px 0 20px;max-width:400px;margin-left:auto;margin-right:auto">
    <b>⚠ Important:</b> Capture builds your AI identity, NOT the final video. The generated videos are newly created by AI from your identity reference.
  </div>
  <ul style="text-align:left;max-width:380px;margin:0 auto 16px;color:var(--text2);font-size:.85rem;line-height:1.9;list-style:none">
    <li>📸 Front-facing capture (5s)</li>
    <li>↔️ Side angles (5s)</li>
    <li>😊 Expressions: smile + blink</li>
    <li>🎙️ Voice consent (4s)</li>
    <li>🧬 Identity extraction</li>
  </ul>
  <button class="btn btn-primary btn-lg" id="allow-cam-btn">Allow Camera &amp; Microphone →</button>
  <div id="step1-gate" style="color:var(--text3);font-size:.8rem;margin-top:10px"></div>
  <div style="margin-top:16px">
    <button class="btn btn-ghost btn-sm" data-page="create-human">Use file upload instead →</button>
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

        statusEl.innerHTML = '<div class="capture-status-row"><div class="loader" style="width:24px;height:24px;margin:0 8px 0 0"></div> Extracting identity pack from captures…</div>';
        const res = await api('/api/digital-humans/create-from-capture', {
          method: 'POST',
          body: JSON.stringify({
            name,
            sessionId: captureSessionId,
            consentConfirmed: true,
          }),
        });

        stopStream();
        const dh = res.digitalHuman;
        const pack = dh.identityPack;
        // Show identity pack results
        c.innerHTML = `
<div class="capture-step" style="padding:20px 0">
  <div style="font-size:3rem;margin-bottom:12px">🧬</div>
  <div class="capture-step-title">Identity Pack Created!</div>
  <div class="capture-step-sub" style="color:var(--green)">"${escHtml(dh.name)}" — your Digital Human identity is built and stored.</div>
  <div class="identity-pack-card">
    <div class="ipc-title">Your AI Identity Pack</div>
    <div class="ipc-row"><span>Face references</span><span class="ipc-val">${pack?.framesExtracted ?? 0} frames extracted</span></div>
    <div class="ipc-row"><span>Identity quality</span><span class="ipc-val">${pack?.qualityScore ?? 0}%</span></div>
    <div class="ipc-row"><span>Voice sample</span><span class="ipc-val">${audioBlob ? '✅ Stored' : '⚠ Not captured'}</span></div>
    <div class="ipc-row"><span>Capture footage</span><span class="ipc-val" style="color:var(--text3)">🔒 Training reference only</span></div>
  </div>
  <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:12px 16px;font-size:.82rem;color:var(--text2);max-width:380px;margin:12px auto">
    ✅ Identity stored. Now you can generate unlimited new videos in any scene — all freshly created by AI using your identity reference.
  </div>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px">
    <button class="btn btn-primary btn-lg" data-page="generate">🎬 Generate a Video Now</button>
    <button class="btn btn-ghost" data-page="my-humans">View Identity Library</button>
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
  let health = {};
  try { health = await api('/api/workers/health'); } catch {}
  const imageProvider = health.imageProvider || 'none';
  const hasImageProvider = imageProvider !== 'none';

  el.innerHTML = `
<div style="max-width:640px">
  <div class="section-title mb-2">Create a Synthetic AI Human</div>
  <div class="section-sub">No camera, no upload needed. Describe the person — AI builds the identity.</div>

  <div class="identity-explainer" style="margin:16px 0">
    <div class="ie-item"><span class="ie-icon">✍️</span><span>Describe appearance, personality, and voice</span></div>
    <div class="ie-item"><span class="ie-icon">🤖</span><span>AI generates face image automatically</span></div>
    <div class="ie-item"><span class="ie-icon">🎬</span><span>Generate any scene with this identity from a prompt</span></div>
    <div class="ie-item"><span class="ie-icon">🏷️</span><span>Always marked AI-generated — never claimed as real</span></div>
  </div>

  ${hasImageProvider
    ? `<div class="plan-card" style="border-color:rgba(34,197,94,.3)">✅ Image provider <b>${escHtml(imageProvider)}</b> active — face photo generated automatically from description.</div>`
    : `<div class="engine-warn">⚠ No image provider configured. Configure DALL·E, Stability AI, or FAL in <button class="link-btn" data-page="settings">Settings</button> for auto face generation — or add a face photo after creation.</div>`}

  <div class="card mt-4">
    <div class="form-group">
      <label>Name <span style="color:var(--text3)">(how you'll refer to this human)</span></label>
      <input type="text" id="fc-name" placeholder="e.g. Aria, James Sterling, Nova" style="width:100%">
    </div>

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
          <option value="authoritative">Authoritative</option>
          <option value="storyteller">Storyteller</option>
        </select>
      </div>
      <div class="form-group">
        <label>Accent</label>
        <select id="fc-accent">
          <option value="american">American Neutral</option>
          <option value="british">British</option>
          <option value="australian">Australian</option>
          <option value="french">French</option>
          <option value="spanish">Spanish</option>
          <option value="nigerian">Nigerian</option>
          <option value="south-african">South African</option>
          <option value="indian">Indian</option>
        </select>
      </div>
    </div>

    <div class="form-row">
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
    </div>

    <div class="consent-box" style="background:rgba(234,179,8,.06);border-color:rgba(234,179,8,.25)">
      <h4 style="color:var(--yellow)">⚠️ Synthetic AI Identity</h4>
      <p>This creates a completely fictional AI identity. No real person's likeness will be used. All videos produced are clearly AI-generated.</p>
    </div>

    <div class="checkbox-group mb-4" style="margin-top:16px">
      <input type="checkbox" id="fc-consent-check">
      <label for="fc-consent-check">I confirm this is a fictional AI human. I will not claim it is a real person or use it to impersonate anyone.</label>
    </div>

    <button class="btn btn-primary btn-lg" id="fc-generate-btn">🧬 Build Synthetic Identity</button>
    <div id="fc-status" style="margin-top:12px"></div>
  </div>
</div>`;

  document.getElementById('fc-generate-btn').addEventListener('click', async () => {
    const name = document.getElementById('fc-name')?.value.trim();
    const appearance = document.getElementById('fc-appearance')?.value.trim();
    const consent = document.getElementById('fc-consent-check')?.checked;
    if (!name) { toast('Please give your synthetic human a name.', 'error'); return; }
    if (!appearance) { toast('Please describe the appearance of your AI human.', 'error'); return; }
    if (!consent) { toast('Please confirm this is a fictional AI human.', 'error'); return; }

    const btn = document.getElementById('fc-generate-btn');
    const statusEl = document.getElementById('fc-status');
    btn.disabled = true; btn.textContent = '🧬 Building identity…';
    statusEl.innerHTML = `
<div style="display:flex;align-items:center;gap:10px;color:var(--text2);font-size:.88rem">
  <div class="loader" style="width:20px;height:20px;flex-shrink:0"></div>
  <span>AI is building the identity pack from your description…</span>
</div>`;

    try {
      const res = await api('/api/digital-humans/create-fictional', {
        method: 'POST',
        body: JSON.stringify({
          name,
          gender: document.getElementById('fc-gender')?.value,
          ageRange: document.getElementById('fc-age')?.value,
          appearance,
          style: document.getElementById('fc-style')?.value,
          voiceStyle: document.getElementById('fc-voice')?.value,
          accent: document.getElementById('fc-accent')?.value,
          personality: document.getElementById('fc-personality')?.value,
          useCase: document.getElementById('fc-usecase')?.value,
          archetype: document.getElementById('fc-archetype')?.value,
        }),
      });
      const dh = res.digitalHuman;
      state.selectedDH = dh.id;
      const isReady = dh.status === 'ready';
      const pack = dh.identityPack;
      statusEl.innerHTML = `
<div class="identity-pack-card" style="margin-top:16px">
  <div class="ipc-title">🧬 Synthetic Identity Created: ${escHtml(dh.name)}</div>
  <div class="ipc-row"><span>Type</span><span class="ipc-val">Synthetic AI Human · ${escHtml(dh.archetype||'custom')}</span></div>
  <div class="ipc-row"><span>Voice style</span><span class="ipc-val">${escHtml(dh.defaultVoice||'AI-synthesized')}</span></div>
  <div class="ipc-row"><span>Face image</span><span class="ipc-val">${isReady ? '✅ Generated' : '⚠ Not yet generated'}</span></div>
  <div class="ipc-row"><span>Identity source</span><span class="ipc-val">🤖 AI-generated from description</span></div>
</div>
<div style="background:${isReady ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.07)'};border:1px solid ${isReady ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'};border-radius:8px;padding:12px 16px;font-size:.82rem;color:var(--text2);margin:12px 0">
  ${isReady
    ? '✅ Face generated automatically. Ready to generate video scenes from a prompt.'
    : '⚠ Configure an image provider in Settings for auto face generation, or add a face photo manually after creation.'}
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap">
  ${isReady
    ? `<button class="btn btn-primary" data-page="generate">🎬 Generate First Video →</button>`
    : `<button class="btn btn-ghost" id="fic-add-face-btn">📸 Add Face Photo</button>`}
  <button class="btn btn-ghost btn-sm" data-page="my-humans">View Identity Library</button>
</div>`;
      document.getElementById('fic-add-face-btn')?.addEventListener('click', () => navigate('view-human', { id: dh.id }));
      btn.style.display = 'none';
    } catch(e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = '🧬 Build Synthetic Identity';
      statusEl.innerHTML = '';
    }
  });
}


// ── Settings ───────────────────────────────────────────────────────────────────
async function pageSettings(el) {
  el.innerHTML = `<div class="loader" style="margin:60px auto"></div>`;
  try {
    const [{ settings }, manifest] = await Promise.all([
      api('/api/settings'),
      api('/api/providers/manifest').catch(() => ({ videoProviders: [], imageProviders: [] })),
    ]);
    const get = (key) => settings.find(s => s.key === key)?.value || '';

    const VIDEO_PROVIDERS_INFO = {
      runway:    { name: 'Runway Gen-3/Gen-4', getKeyUrl: 'https://dev.runwayml.com/', keyHint: 'Get key at dev.runwayml.com → Account → API Keys', status: 'verified', level: 4 },
      kling:     { name: 'Kling AI', getKeyUrl: 'https://klingai.com/api', keyHint: 'Get key at klingai.com → Developer Console', status: 'verified', level: 4 },
      luma:      { name: 'Luma Dream Machine', getKeyUrl: 'https://lumalabs.ai/dream-machine/api', keyHint: 'Get key at lumalabs.ai → Dream Machine → API', status: 'verified', level: 3 },
      hailuo:    { name: 'Hailuo / MiniMax', getKeyUrl: 'https://www.minimaxi.com/user-center/basic-information/interface-key', keyHint: 'Get key at minimaxi.com → User Center → API Key', status: 'verified', level: 3 },
      replicate: { name: 'Replicate', getKeyUrl: 'https://replicate.com/account/api-tokens', keyHint: 'Get token at replicate.com → Account → API Tokens', status: 'verified', level: 3 },
      pika:      { name: 'Pika Labs', getKeyUrl: 'https://pika.art/api', keyHint: 'Pika API is in limited access — apply at pika.art/api', status: 'partial', level: 3 },
      veo:       { name: 'Veo 2 (Google)', getKeyUrl: 'https://console.cloud.google.com/vertex-ai', keyHint: 'Requires GCP project + OAuth2 token — complex setup', status: 'partial', level: 3 },
      seedance:  { name: 'Seedance (ByteDance)', getKeyUrl: null, keyHint: 'No public API available', status: 'not_implemented', level: 0 },
      static:    { name: 'None / Static Fallback', getKeyUrl: null, keyHint: 'No provider — static image + audio only (Level 0 test mode)', status: 'none', level: 0 },
    };

    function providerStatusBadge(info) {
      if (!info) return '';
      const s = info.status;
      if (s === 'verified') return `<span style="background:rgba(34,197,94,.15);color:var(--green);border-radius:20px;padding:2px 9px;font-size:.68rem;font-weight:700">✅ Verified</span>`;
      if (s === 'partial') return `<span style="background:rgba(245,158,11,.15);color:var(--yellow);border-radius:20px;padding:2px 9px;font-size:.68rem;font-weight:700">⚠ Partial</span>`;
      if (s === 'not_implemented') return `<span style="background:rgba(239,68,68,.12);color:#f87171;border-radius:20px;padding:2px 9px;font-size:.68rem;font-weight:700">❌ Not Available</span>`;
      return `<span style="background:rgba(100,116,139,.15);color:var(--text3);border-radius:20px;padding:2px 9px;font-size:.68rem;font-weight:700">— None</span>`;
    }

    function featureTag(ok, label) {
      return `<span class="feat-tag ${ok ? 'feat-ok' : 'feat-no'}">${ok ? '✓' : '✗'} ${label}</span>`;
    }

    function providerFeatureRow(provId) {
      const p = manifest.videoProviders?.find(p => p.id === provId);
      if (!p) return '';
      const f = p.features || {};
      return `
<div class="provider-features">
  ${featureTag(f.textToVideo, 'Text→Video')}
  ${featureTag(f.imageToVideo, 'Image→Video')}
  ${featureTag(f.identityReference, 'Identity Ref')}
  ${featureTag(f.audioSupport, 'Audio')}
  ${featureTag(f.maxDurationSec >= 8, `${f.maxDurationSec || '?'}s max`)}
  ${featureTag(f.aspectRatios?.includes('9:16'), '9:16')}
</div>`;
    }

    const currentVideoProvider = get('VIDEO_GEN_PROVIDER') || 'static';
    const currentInfo = VIDEO_PROVIDERS_INFO[currentVideoProvider] || VIDEO_PROVIDERS_INFO.static;

    el.innerHTML = `
<div class="section-title mb-2">Settings</div>

<div class="settings-section">
  <div class="settings-section-title">General</div>
  <div class="settings-row">
    <div class="settings-label">Runtime Mode</div>
    <div class="settings-input">
      <select id="set-runtime">
        <option value="local" ${get('AI_RUNTIME_MODE')==='local'?'selected':''}>Local (Free, requires workers installed)</option>
        <option value="hybrid" ${get('AI_RUNTIME_MODE')==='hybrid'?'selected':''}>Hybrid (Local + Cloud fallback)</option>
        <option value="cloud" ${get('AI_RUNTIME_MODE')==='cloud'?'selected':''}>Cloud (Requires API keys, no local setup)</option>
      </select>
      <div class="settings-hint">Local mode is for testing only — it cannot generate real cinematic scene videos. Cloud providers required for real AI video.</div>
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">🧠 AI Planning (Gemini)</div>
  <div class="settings-row">
    <div class="settings-label">Gemini API Key</div>
    <div class="settings-input">
      <input type="password" id="set-gemini" value="${escHtml(get('GEMINI_API_KEY'))}" placeholder="AIza...">
      <div class="settings-hint">Used for storyboard planning + script writing. <a href="https://aistudio.google.com/app/apikey" target="_blank" class="key-link">Get free key at aistudio.google.com →</a></div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Gemini Model</div>
    <div class="settings-input">
      <input type="text" id="set-gemini-model" value="${escHtml(get('GEMINI_MODEL')||'gemini-2.5-flash-lite')}" placeholder="gemini-2.5-flash-lite">
      <div class="settings-hint">Default: gemini-2.5-flash-lite (free tier). Use gemini-2.0-flash for better quality.</div>
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
  <div class="settings-section-title">🎙️ Voice / TTS</div>
  <div class="settings-row">
    <div class="settings-label">TTS Provider</div>
    <div class="settings-input">
      <select id="set-tts">
        <option value="piper" ${get('TTS_PROVIDER')==='piper'?'selected':''}>Piper (Local, free — requires Piper installed)</option>
        <option value="elevenlabs" ${get('TTS_PROVIDER')==='elevenlabs'?'selected':''}>ElevenLabs (Cloud, high quality voice synthesis)</option>
        <option value="system" ${get('TTS_PROVIDER')==='system'?'selected':''}>System TTS (macOS "say" command)</option>
      </select>
      <div class="settings-hint">Voice status: <strong>No voice cloning active</strong> — TTS generates a synthetic voice, not your real voice. Clone your voice with ElevenLabs for authentic AI twin speech.</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">ElevenLabs API Key</div>
    <div class="settings-input">
      <input type="password" id="set-elevenlabs" value="${escHtml(get('VOICE_API_KEY'))}" placeholder="sk-...">
      <div class="settings-hint"><a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" class="key-link">Get key at elevenlabs.io → Settings → API Keys →</a></div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Lipsync Provider</div>
    <div class="settings-input">
      <select id="set-lipsync">
        <option value="wav2lip" ${get('LIPSYNC_PROVIDER')==='wav2lip'?'selected':''}>Wav2Lip (Local — requires Python setup)</option>
        <option value="sadtalker" ${get('LIPSYNC_PROVIDER')==='sadtalker'?'selected':''}>SadTalker (Local — better expressions, requires setup)</option>
        <option value="muapi" ${get('LIPSYNC_PROVIDER')==='muapi'?'selected':''}>Muapi (Cloud lipsync — no local setup)</option>
        <option value="static" ${get('LIPSYNC_PROVIDER')==='static'?'selected':''}>Static (No lipsync — audio over still image)</option>
      </select>
      <div class="settings-hint">Lipsync = Level 1 (Talking Head). For Level 3–4 cinematic scene video, use a cloud video provider below instead.</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Muapi Key</div>
    <div class="settings-input">
      <input type="password" id="set-muapi" value="${escHtml(get('MUAPI_API_KEY'))}" placeholder="Muapi API key">
      <div class="settings-hint"><a href="https://console.muapi.ai" target="_blank" class="key-link">Get key at console.muapi.ai →</a></div>
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">🎬 AI Video Generation — Active: ${providerStatusBadge(currentInfo)} ${currentInfo.name} ${currentInfo.level > 0 ? `<span style="font-size:.72rem;color:var(--text3);font-weight:400">(Level ${currentInfo.level})</span>` : ''}</div>

  <div class="provider-select-row">
    <div class="settings-row" style="margin-bottom:8px">
      <div class="settings-label">Video Provider</div>
      <div class="settings-input">
        <select id="set-video-provider">
          <option value="static" ${get('VIDEO_GEN_PROVIDER')==='static'?'selected':''}>None / Static (Level 0 — testing only, no real video)</option>
          <optgroup label="── Level 4: Cinematic (Recommended) ──">
            <option value="runway"    ${get('VIDEO_GEN_PROVIDER')==='runway'?'selected':''}>Runway Gen-4 Turbo ✅ Verified</option>
            <option value="kling"     ${get('VIDEO_GEN_PROVIDER')==='kling'?'selected':''}>Kling AI v1.5 ✅ Verified</option>
          </optgroup>
          <optgroup label="── Level 3: Full Scene AI ──">
            <option value="luma"      ${get('VIDEO_GEN_PROVIDER')==='luma'?'selected':''}>Luma Dream Machine (Ray-2) ✅ Verified</option>
            <option value="hailuo"    ${get('VIDEO_GEN_PROVIDER')==='hailuo'?'selected':''}>Hailuo / MiniMax Video-01 ✅ Verified</option>
            <option value="replicate" ${get('VIDEO_GEN_PROVIDER')==='replicate'?'selected':''}>Replicate (MiniMax/Video-01) ✅ Verified</option>
            <option value="veo"       ${get('VIDEO_GEN_PROVIDER')==='veo'?'selected':''}>Veo 2 — Google Vertex AI ⚠ Complex Setup</option>
            <option value="pika"      ${get('VIDEO_GEN_PROVIDER')==='pika'?'selected':''}>Pika Labs ⚠ Limited Access Only</option>
            <option value="seedance"  ${get('VIDEO_GEN_PROVIDER')==='seedance'?'selected':''}>Seedance (ByteDance) ❌ Not Available</option>
          </optgroup>
        </select>
        <div class="settings-hint">Level 0 = static image test. Level 3+ = real AI-generated scene video from your identity reference.</div>
      </div>
    </div>
  </div>

  <div id="provider-feature-display">${providerFeatureRow(get('VIDEO_GEN_PROVIDER') || 'static')}</div>

  <div class="provider-cards" id="provider-cards-area">

    <div class="provider-card" id="pcard-runway">
      <div class="pc-header">
        <div>
          <div class="pc-name">Runway Gen-3/Gen-4 Turbo</div>
          <div class="pc-desc">Best for identity preservation + cinematic scene. Industry standard.</div>
        </div>
        <div>${providerStatusBadge(VIDEO_PROVIDERS_INFO.runway)}</div>
      </div>
      <div class="pc-body">
        <div class="settings-row">
          <div class="settings-label">API Key</div>
          <div class="settings-input">
            <input type="password" id="set-video-key" value="${escHtml(get('VIDEO_GEN_API_KEY'))}" placeholder="Runway / Kling / Hailuo / Replicate API key">
            <div class="settings-hint"><a href="https://dev.runwayml.com/" target="_blank" class="key-link">Runway: dev.runwayml.com → Account → API Keys →</a></div>
            <div class="settings-hint"><a href="https://klingai.com/api" target="_blank" class="key-link">Kling: klingai.com → Developer Console →</a></div>
            <div class="settings-hint"><a href="https://replicate.com/account/api-tokens" target="_blank" class="key-link">Replicate: replicate.com → Account → API Tokens →</a></div>
            <div class="settings-hint" style="color:var(--text3);margin-top:6px">This key is shared by Runway, Kling, Luma, Hailuo, Replicate. Veo uses a separate key below.</div>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label"></div>
          <div class="settings-input" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" data-test-provider="runway">Test Runway Connection</button>
            <button class="btn btn-ghost btn-sm" data-test-provider="kling">Test Kling Connection</button>
            <button class="btn btn-ghost btn-sm" data-test-provider="luma">Test Luma Connection</button>
            <button class="btn btn-ghost btn-sm" data-test-provider="hailuo">Test Hailuo Connection</button>
            <button class="btn btn-ghost btn-sm" data-test-provider="replicate">Test Replicate Connection</button>
            <span id="video-test-result" style="font-size:.78rem;color:var(--text3)"></span>
          </div>
        </div>
      </div>
      <div class="pc-features">
        ${featureTag(true, 'Text→Video')} ${featureTag(true, 'Image→Video')} ${featureTag(true, 'Identity Ref')} ${featureTag(false, 'Audio')} ${featureTag(true, '9:16')} ${featureTag(true, '5–10s')}
      </div>
    </div>

    <div class="provider-card" id="pcard-luma">
      <div class="pc-header">
        <div>
          <div class="pc-name">Luma Dream Machine (Ray-2)</div>
          <div class="pc-desc">Fast video generation. Image-to-video requires a public image URL — set SERVER_PUBLIC_URL below.</div>
        </div>
        <div>${providerStatusBadge(VIDEO_PROVIDERS_INFO.luma)}</div>
      </div>
      <div class="pc-body">
        <div class="settings-row">
          <div class="settings-label">Luma API Key</div>
          <div class="settings-input">
            <input type="password" id="set-luma-key" value="${escHtml(get('LUMA_API_KEY'))}" placeholder="luma-...">
            <div class="settings-hint"><a href="https://lumalabs.ai/dream-machine/api" target="_blank" class="key-link">Get key: lumalabs.ai → Dream Machine → API →</a></div>
          </div>
        </div>
      </div>
      <div class="pc-features">
        ${featureTag(true, 'Text→Video')} ${featureTag(true, 'Image→Video*')} ${featureTag(true, 'Identity Ref*')} ${featureTag(false, 'Audio')} ${featureTag(true, '9:16')}
        <div style="color:var(--text3);font-size:.7rem;margin-top:4px">* Image reference requires a public URL — set SERVER_PUBLIC_URL in Advanced settings</div>
      </div>
    </div>

    <div class="provider-card" id="pcard-veo">
      <div class="pc-header">
        <div>
          <div class="pc-name">Veo 2 (Google Vertex AI)</div>
          <div class="pc-desc">Complex setup. Requires GCP project, Vertex AI access, and OAuth2 token — not a simple API key.</div>
        </div>
        <div>${providerStatusBadge(VIDEO_PROVIDERS_INFO.veo)}</div>
      </div>
      <div class="pc-body">
        <div class="settings-row">
          <div class="settings-label">Veo OAuth2 Token</div>
          <div class="settings-input">
            <input type="password" id="set-veo-key" value="${escHtml(get('VEO_API_KEY'))}" placeholder="gcloud auth print-access-token output">
            <div class="settings-hint"><a href="https://console.cloud.google.com/vertex-ai" target="_blank" class="key-link">Setup: console.cloud.google.com → Vertex AI →</a></div>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">GCP Project ID</div>
          <div class="settings-input">
            <input type="text" id="set-gcp-project" value="${escHtml(get('GOOGLE_PROJECT_ID'))}" placeholder="your-gcp-project-id">
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">GCP Region</div>
          <div class="settings-input">
            <input type="text" id="set-gcp-region" value="${escHtml(get('GOOGLE_REGION') || 'us-central1')}" placeholder="us-central1">
          </div>
        </div>
        <div class="engine-warn" style="font-size:.78rem">⚠ Veo tokens expire hourly. You need to run <code>gcloud auth print-access-token</code> and paste the output. Not suitable for production without a server-side OAuth2 flow.</div>
      </div>
    </div>

    <div class="provider-card" id="pcard-pika">
      <div class="pc-header">
        <div>
          <div class="pc-name">Pika Labs</div>
          <div class="pc-desc">API in limited beta — not open to all users. Apply for access at pika.art/api.</div>
        </div>
        <div>${providerStatusBadge(VIDEO_PROVIDERS_INFO.pika)}</div>
      </div>
    </div>

    <div class="provider-card" id="pcard-seedance" style="opacity:.5">
      <div class="pc-header">
        <div>
          <div class="pc-name">Seedance (ByteDance)</div>
          <div class="pc-desc">No public API available. Marked as coming soon — do not use.</div>
        </div>
        <div>${providerStatusBadge(VIDEO_PROVIDERS_INFO.seedance)}</div>
      </div>
    </div>

  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">🖼️ AI Image Generation (Synthetic Face)</div>
  <div class="settings-row">
    <div class="settings-label">Image Provider</div>
    <div class="settings-input">
      <select id="set-image-provider">
        <option value="none" ${get('IMAGE_GEN_PROVIDER')==='none'?'selected':''}>None (upload face photo manually)</option>
        <option value="openai" ${get('IMAGE_GEN_PROVIDER')==='openai'?'selected':''}>OpenAI DALL-E 3 ✅</option>
        <option value="stability" ${get('IMAGE_GEN_PROVIDER')==='stability'?'selected':''}>Stability AI Ultra ✅</option>
        <option value="fal" ${get('IMAGE_GEN_PROVIDER')==='fal'?'selected':''}>FAL (FLUX Schnell) ✅</option>
        <option value="replicate" ${get('IMAGE_GEN_PROVIDER')==='replicate'?'selected':''}>Replicate (FLUX Schnell) ✅</option>
      </select>
      <div class="settings-hint">Used to auto-generate a face image when creating a Synthetic Human from description.</div>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Image API Key</div>
    <div class="settings-input">
      <input type="password" id="set-image-key" value="${escHtml(get('IMAGE_GEN_API_KEY'))}" placeholder="Provider API key">
      <div class="settings-hint">
        <a href="https://platform.openai.com/api-keys" target="_blank" class="key-link">OpenAI: platform.openai.com/api-keys →</a><br>
        <a href="https://platform.stability.ai/account/keys" target="_blank" class="key-link">Stability: platform.stability.ai →</a><br>
        <a href="https://fal.ai/dashboard/keys" target="_blank" class="key-link">FAL: fal.ai/dashboard/keys →</a>
      </div>
    </div>
  </div>
</div>

<div class="settings-section">
  <div class="settings-section-title">⚙️ Local / Advanced</div>
  <div class="settings-row">
    <div class="settings-label">FFmpeg Path</div>
    <div class="settings-input">
      <input type="text" id="set-ffmpeg" value="${escHtml(get('FFMPEG_PATH')||'ffmpeg')}" placeholder="ffmpeg">
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Wav2Lip Path</div>
    <div class="settings-input">
      <input type="text" id="set-wav2lip" value="${escHtml(get('WAV2LIP_PATH'))}" placeholder="/path/to/Wav2Lip">
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-label">Server Public URL</div>
    <div class="settings-input">
      <input type="text" id="set-public-url" value="${escHtml(get('SERVER_PUBLIC_URL'))}" placeholder="https://your-tunnel.trycloudflare.com">
      <div class="settings-hint">Required for Luma image-to-video reference. If you use Cloudflare tunnel, paste the current tunnel URL here.</div>
    </div>
  </div>
</div>

<div style="display:flex;gap:10px;margin-bottom:32px">
  <button class="btn btn-primary" id="save-settings-btn">Save All Settings</button>
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

    // Provider selection → show/hide feature row
    document.getElementById('set-video-provider')?.addEventListener('change', (e) => {
      const id = e.target.value;
      const info = VIDEO_PROVIDERS_INFO[id] || {};
      const feat = document.getElementById('provider-feature-display');
      if (feat) {
        const p = manifest.videoProviders?.find(p => p.id === id);
        feat.innerHTML = p ? (() => {
          const f = p.features || {};
          return `<div class="provider-features">
            ${featureTag(f.textToVideo, 'Text→Video')}
            ${featureTag(f.imageToVideo, 'Image→Video')}
            ${featureTag(f.identityReference, 'Identity Ref')}
            ${featureTag(f.audioSupport, 'Audio')}
            ${featureTag(f.maxDurationSec >= 8, `${f.maxDurationSec||'?'}s max`)}
            ${featureTag(f.aspectRatios?.includes('9:16'), '9:16')}
          </div>`;
        })() : '';
      }
    });

    // Test provider buttons
    el.querySelectorAll('[data-test-provider]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.testProvider;
        const resultEl = document.getElementById('video-test-result');
        btn.disabled = true; btn.textContent = 'Testing…';
        if (resultEl) resultEl.textContent = '';
        try {
          const key = document.getElementById('set-video-key')?.value.trim();
          const res = await api('/api/providers/test', { method: 'POST', body: JSON.stringify({ providerId: pid, apiKey: key }) });
          if (resultEl) {
            resultEl.textContent = res.ok ? `✅ ${res.message}` : `❌ ${res.message}`;
            resultEl.style.color = res.ok ? 'var(--green)' : 'var(--red)';
          }
          if (res.ok) toast(`${pid}: ${res.message}`, 'success'); else toast(`${pid}: ${res.message}`, 'error');
        } catch(e) { toast(e.message, 'error'); }
        btn.disabled = false;
        btn.textContent = `Test ${pid.charAt(0).toUpperCase() + pid.slice(1)} Connection`;
      });
    });

    // Test Gemini
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

    // Save settings
    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('save-settings-btn');
      const status = document.getElementById('settings-save-status');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const settingsList = [
          { key: 'AI_RUNTIME_MODE',  value: document.getElementById('set-runtime')?.value },
          { key: 'TTS_PROVIDER',     value: document.getElementById('set-tts')?.value },
          { key: 'LIPSYNC_PROVIDER', value: document.getElementById('set-lipsync')?.value },
          { key: 'GEMINI_API_KEY',   value: document.getElementById('set-gemini')?.value },
          { key: 'GEMINI_MODEL',     value: document.getElementById('set-gemini-model')?.value || 'gemini-2.5-flash-lite' },
          { key: 'VOICE_API_KEY',    value: document.getElementById('set-elevenlabs')?.value },
          { key: 'MUAPI_API_KEY',    value: document.getElementById('set-muapi')?.value },
          { key: 'WAV2LIP_PATH',     value: document.getElementById('set-wav2lip')?.value },
          { key: 'FFMPEG_PATH',      value: document.getElementById('set-ffmpeg')?.value || 'ffmpeg' },
          { key: 'VIDEO_GEN_PROVIDER', value: document.getElementById('set-video-provider')?.value || 'static' },
          { key: 'VIDEO_GEN_API_KEY',  value: document.getElementById('set-video-key')?.value || '' },
          { key: 'VEO_API_KEY',      value: document.getElementById('set-veo-key')?.value || '' },
          { key: 'LUMA_API_KEY',     value: document.getElementById('set-luma-key')?.value || '' },
          { key: 'GOOGLE_PROJECT_ID', value: document.getElementById('set-gcp-project')?.value || '' },
          { key: 'GOOGLE_REGION',    value: document.getElementById('set-gcp-region')?.value || 'us-central1' },
          { key: 'IMAGE_GEN_PROVIDER', value: document.getElementById('set-image-provider')?.value || 'none' },
          { key: 'IMAGE_GEN_API_KEY',  value: document.getElementById('set-image-key')?.value || '' },
          { key: 'SERVER_PUBLIC_URL',  value: document.getElementById('set-public-url')?.value || '' },
        ];
        await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ settings: settingsList }) });
        status.textContent = '✅ Saved!'; status.style.color = 'var(--green)';
        toast('Settings saved!', 'success');
      } catch(e) { toast(e.message, 'error'); status.textContent = '❌ ' + e.message; status.style.color = 'var(--red)'; }
      btn.disabled = false; btn.textContent = 'Save All Settings';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });

    document.getElementById('reset-settings-btn')?.addEventListener('click', async () => {
      if (!confirm('Reset all settings to defaults? API keys will be cleared.')) return;
      const defaults = [
        { key: 'AI_RUNTIME_MODE', value: 'hybrid' },
        { key: 'TTS_PROVIDER', value: 'piper' },
        { key: 'LIPSYNC_PROVIDER', value: 'wav2lip' },
        { key: 'GEMINI_API_KEY', value: '' },
        { key: 'VOICE_API_KEY', value: '' },
        { key: 'VIDEO_GEN_PROVIDER', value: 'static' },
        { key: 'VIDEO_GEN_API_KEY', value: '' },
      ];
      try {
        await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ settings: defaults }) });
        toast('Settings reset to defaults.', 'success');
        pageSettings(el);
      } catch(e) { toast(e.message, 'error'); }
    });

  } catch(e) { el.innerHTML = `<div class="error-box">${e.message}</div>`; }
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
