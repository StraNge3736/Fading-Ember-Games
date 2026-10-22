const grid = document.querySelector('#project-grid');
const filters = document.querySelector('#work-filters');
const projectDialog = document.querySelector('#project-detail-dialog');
let allProjects = [];
let activeCategory = 'All';

document.querySelector('#copyright-year').textContent = new Date().getFullYear();

const categoryArt = category => {
  const value = String(category || '').toLowerCase();
  if (value.includes('web')) return 'web';
  if (value.includes('design') || value.includes('graphic') || value.includes('brand')) return 'design';
  if (value.includes('video') || value.includes('motion') || value.includes('film') || value.includes('edit')) return 'video';
  if (value.includes('game') || value.includes('animation')) return 'game';
  return 'other';
};

function openProjectDetails(project, trigger) {
  document.querySelector('#project-detail-category').textContent = project.category || 'Creative project';
  document.querySelector('#project-detail-title').textContent = project.title || 'Untitled project';
  document.querySelector('#project-detail-year').textContent = project.year || '';
  document.querySelector('#project-detail-description').textContent = project.description || '';
  document.querySelector('#project-detail-art-scene').dataset.art = categoryArt(project.category);
  document.querySelector('#project-detail-glyph').textContent = ['✳', '◒', '✧', '◈'][Math.max(0, allProjects.indexOf(project)) % 4];
  const tagContainer = document.querySelector('#project-detail-tags');
  tagContainer.replaceChildren(...(project.tags || []).map(label => {
    const tag = document.createElement('span');
    tag.className = 'project-tag';
    tag.textContent = label;
    return tag;
  }));
  projectDialog.returnValue = '';
  projectDialog.showModal();
  projectDialog.addEventListener('close', () => trigger?.focus(), { once: true });
}

function openProject(project, trigger) {
  const projectUrl = String(project.projectUrl || project.coverImage || '').trim();
  try {
    const destination = new URL(projectUrl);
    if (['http:', 'https:'].includes(destination.protocol)) {
      window.location.assign(projectUrl);
      return;
    }
  } catch {}
  openProjectDetails(project, trigger);
}

document.querySelector('#project-detail-close').addEventListener('click', () => projectDialog.close());
document.querySelector('#project-detail-cta').addEventListener('click', () => projectDialog.close());
projectDialog.addEventListener('click', event => { if (event.target === projectDialog) projectDialog.close(); });

function drawFilters() {
  const categories = ['All', ...new Set(allProjects.map(project => project.category).filter(Boolean))];
  filters.replaceChildren(...categories.map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip${category === activeCategory ? ' active' : ''}`;
    button.textContent = category === 'All' ? 'All projects' : category;
    button.setAttribute('aria-pressed', String(category === activeCategory));
    button.addEventListener('click', () => { activeCategory = category; drawFilters(); drawProjects(); });
    return button;
  }));
}

function projectCard(project, index) {
  const article = document.createElement('article');
  article.className = 'project-card';
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-haspopup', 'dialog');
  article.setAttribute('aria-label', `View full project: ${project.title}`);
  article.addEventListener('click', () => openProject(project, article));
  article.addEventListener('keydown', event => {
    if (event.target !== article || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openProject(project, article);
  });
  const art = document.createElement('div');
  art.className = 'project-art';
  const scene = document.createElement('div');
  scene.className = 'art-scene';
  scene.dataset.art = categoryArt(project.category);
  const kind = document.createElement('span');
  kind.className = 'scene-type';
  kind.textContent = project.category || 'Creative';
  const glyph = document.createElement('span');
  glyph.className = 'scene-glyph';
  glyph.textContent = ['✳', '◒', '✧', '◈'][index % 4];
  scene.append(kind, glyph);
  art.append(scene);
  const overlay = document.createElement('div');
  overlay.className = 'project-overlay';
  const overlayTitle = document.createElement('strong');
  overlayTitle.textContent = project.title;
  const overlayCategory = document.createElement('span');
  overlayCategory.textContent = project.category;
  overlay.append(overlayTitle, overlayCategory);
  art.append(overlay);

  const info = document.createElement('div');
  info.className = 'project-info';
  const title = document.createElement('h3');
  title.textContent = project.title;
  const year = document.createElement('span');
  year.className = 'project-year';
  year.textContent = project.year || '';
  const description = document.createElement('p');
  description.textContent = project.description;
  const tags = document.createElement('div');
  tags.className = 'project-tags';
  (project.tags || []).slice(0, 4).forEach(label => {
    const tag = document.createElement('span');
    tag.className = 'project-tag';
    tag.textContent = label;
    tags.append(tag);
  });
  const openHint = document.createElement('span');
  openHint.className = 'project-open-hint';
  openHint.textContent = 'View full project ↗';
  info.append(title, year, description, tags, openHint);
  article.append(art, info);
  return article;
}

function drawProjects() {
  const visible = activeCategory === 'All' ? allProjects : allProjects.filter(project => project.category === activeCategory);
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-projects';
    const message = document.createElement('p');
    message.textContent = 'We’re gathering the next chapter of our work. Your idea could be the next one we share.';
    const link = document.createElement('a');
    link.className = 'empty-projects-link';
    link.href = '#service-discovery';
    link.textContent = 'Choose a starting point ↗';
    empty.append(message, link);
    grid.replaceChildren(empty);
    return;
  }
  grid.replaceChildren(...visible.map(projectCard));
}

async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Could not load projects.');
    const data = await response.json();
    allProjects = Array.isArray(data.projects) ? data.projects : [];
    drawFilters();
    drawProjects();
  } catch {
    const error = document.createElement('div');
    error.className = 'empty-projects';
    error.textContent = 'The portfolio is taking a moment to load. Please refresh in a little while.';
    grid.replaceChildren(error);
  }
}

const menuButton = document.querySelector('#menu-toggle');
const nav = document.querySelector('#site-nav');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  menuButton.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
  nav.classList.toggle('open', !open);
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  nav.classList.remove('open');
}));

const clientLoginForm = document.querySelector('#client-login-form');
const registerForm = document.querySelector('#register-form');
const inquiryForm = document.querySelector('#inquiry-form');
const authFeedback = document.querySelector('#auth-feedback');
const inquiryFeedback = document.querySelector('#form-feedback');
const navSignIn = document.querySelector('#nav-signin');
const navRegister = document.querySelector('#nav-register');
const authDialog = document.querySelector('#client-auth-dialog');
const authFormPanel = document.querySelector('#auth-form-panel');
const clientAccountPanel = document.querySelector('#client-account-panel');
let clientUser = null;

const servicePathData = {
  web: {
    service: 'Web Development',
    kicker: 'Build something people remember',
    title: 'A website with a little more spark.',
    description: 'From a sharp landing page to a full digital home, we shape the story, design the experience, and build it to feel effortless.',
    tags: ['Strategy & design', 'Responsive build', 'Launch ready'],
    prompt: 'I’m looking to build a website for…'
  },
  brand: {
    service: 'Graphic Design',
    kicker: 'Give your idea a point of view',
    title: 'A visual identity people remember.',
    description: 'Find a clear voice for your brand, then carry it across the details people see, use, and share.',
    tags: ['Brand foundations', 'Visual identity', 'Campaign assets'],
    prompt: 'I’d like help shaping the visual identity for…'
  },
  film: {
    service: 'Video Editing',
    kicker: 'Turn the story into motion',
    title: 'Make your story move.',
    description: 'Bring the right moments, motion, and sound together in a film that feels like you and keeps people watching.',
    tags: ['Edit & pacing', 'Motion graphics', 'Sound finish'],
    prompt: 'I have a story I’d like to tell through video…'
  }
};

const serviceTabs = [...document.querySelectorAll('[data-service-path]')];
const servicePanel = document.querySelector('#service-path-panel');
const servicePathCta = document.querySelector('#service-path-cta');
let activeServicePath = 'web';

function selectServicePath(path, focusTab = false) {
  const data = servicePathData[path];
  if (!data) return;
  activeServicePath = path;
  serviceTabs.forEach(tab => {
    const selected = tab.dataset.servicePath === path;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) servicePanel.setAttribute('aria-labelledby', tab.id);
  });
  document.querySelector('#service-path-kicker').textContent = data.kicker;
  document.querySelector('#service-path-title').textContent = data.title;
  document.querySelector('#service-path-description').textContent = data.description;
  const tags = document.querySelector('#service-path-tags');
  tags.replaceChildren(...data.tags.map(label => {
    const tag = document.createElement('span');
    tag.textContent = label;
    return tag;
  }));
  if (focusTab) serviceTabs.find(tab => tab.dataset.servicePath === path)?.focus();
}

serviceTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectServicePath(tab.dataset.servicePath));
  tab.addEventListener('keydown', event => {
    const keySteps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key === 'Home') {
      event.preventDefault();
      selectServicePath(serviceTabs[0].dataset.servicePath, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectServicePath(serviceTabs[serviceTabs.length - 1].dataset.servicePath, true);
    } else if (keySteps[event.key]) {
      event.preventDefault();
      const nextIndex = (index + keySteps[event.key] + serviceTabs.length) % serviceTabs.length;
      selectServicePath(serviceTabs[nextIndex].dataset.servicePath, true);
    }
  });
});

servicePathCta.addEventListener('click', () => {
  const path = servicePathData[activeServicePath];
  inquiryForm.elements.service.value = path.service;
  if (!inquiryForm.elements.details.value.trim()) {
    inquiryForm.elements.details.value = path.prompt;
    inquiryForm.elements.details.setSelectionRange(path.prompt.length, path.prompt.length);
  }
  document.querySelector('#contact').scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  });
  window.setTimeout(() => inquiryForm.elements.details.focus({ preventScroll: true }), 450);
});

const heroVisual = document.querySelector('.hero-visual');
const finePointer = window.matchMedia('(pointer: fine)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (heroVisual && finePointer && !prefersReducedMotion) {
  heroVisual.addEventListener('pointermove', event => {
    const bounds = heroVisual.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    heroVisual.style.setProperty('--ember-x', `${x * 13}px`);
    heroVisual.style.setProperty('--ember-y', `${y * 13}px`);
    heroVisual.style.setProperty('--orbit-x', `${x * -10}px`);
    heroVisual.style.setProperty('--orbit-y', `${y * -8}px`);
    heroVisual.style.setProperty('--orbit-two-x', `${x * 8}px`);
    heroVisual.style.setProperty('--orbit-two-y', `${y * 11}px`);
    heroVisual.style.setProperty('--note-x', `${x * -5}px`);
    heroVisual.style.setProperty('--note-y', `${y * -5}px`);
    heroVisual.style.setProperty('--glow-x', `${x * 12}px`);
    heroVisual.style.setProperty('--glow-y', `${y * 10}px`);
  });
  heroVisual.addEventListener('pointerleave', () => {
    ['--ember-x', '--ember-y', '--orbit-x', '--orbit-y', '--orbit-two-x', '--orbit-two-y', '--note-x', '--note-y', '--glow-x', '--glow-y']
      .forEach(property => heroVisual.style.removeProperty(property));
  });
}

if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealTargets = document.querySelectorAll('.section-heading, .service-card, .service-discovery, .studio-art, .studio-copy, .contact-copy, .inquiry-form');
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  revealTargets.forEach((target, index) => {
    target.classList.add('reveal-ready');
    target.style.transitionDelay = `${Math.min(index % 4, 3) * 65}ms`;
    revealObserver.observe(target);
  });
}

function setClientAccount(user) {
  clientUser = user || null;
  const signedIn = Boolean(user);
  navSignIn.textContent = signedIn ? 'My account' : 'Sign in';
  navRegister.hidden = signedIn;
  if (signedIn) {
    inquiryForm.elements.name.value = user.name;
    inquiryForm.elements.email.value = user.email;
    inquiryForm.elements.name.readOnly = true;
    inquiryForm.elements.email.readOnly = true;
    document.querySelector('#client-account-identity').textContent = `${user.name} · ${user.email}`;
    authFormPanel.hidden = true;
    clientAccountPanel.hidden = false;
  } else {
    inquiryForm.elements.name.readOnly = false;
    inquiryForm.elements.email.readOnly = false;
    authFormPanel.hidden = false;
    clientAccountPanel.hidden = true;
    registerForm.reset();
    clientLoginForm.reset();
    switchAuthMode('register');
  }
}

function switchAuthMode(mode) {
  const registering = mode === 'register';
  registerForm.hidden = !registering;
  clientLoginForm.hidden = registering;
  document.querySelectorAll('[data-auth-mode]').forEach(button => {
    const selected = button.dataset.authMode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  authFeedback.textContent = '';
  authFeedback.classList.remove('error');
}

function openClientAuth(mode = 'register') {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  nav.classList.remove('open');
  if (clientUser) {
    authFormPanel.hidden = true;
    clientAccountPanel.hidden = false;
  } else {
    clientAccountPanel.hidden = true;
    authFormPanel.hidden = false;
    switchAuthMode(mode);
  }
  authDialog.showModal();
}

document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => switchAuthMode(button.dataset.authMode)));
navSignIn.addEventListener('click', () => openClientAuth('login'));
navRegister.addEventListener('click', () => openClientAuth('register'));
document.querySelector('#footer-account-link').addEventListener('click', () => openClientAuth('login'));
document.querySelector('#client-auth-close').addEventListener('click', () => authDialog.close());
document.querySelector('#client-account-close').addEventListener('click', () => authDialog.close());
authDialog.addEventListener('click', event => { if (event.target === authDialog) authDialog.close(); });

async function authenticateClient(event, mode) {
  event.preventDefault();
  const form = mode === 'register' ? registerForm : clientLoginForm;
  const submit = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  submit.disabled = true;
  authFeedback.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…';
  authFeedback.classList.remove('error');
  try {
    const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not access your account.');
    setClientAccount(result.user);
    form.reset();
    authDialog.close();
    const accountAction = mode === 'register' ? 'Your account is ready.' : 'You’re signed in.';
    inquiryFeedback.textContent = `${accountAction} ${result.emailSent ? 'Email notifications were sent.' : 'Email notifications could not be sent.'} Click “Send your inquiry” to finish.`;
    inquiryFeedback.classList.remove('error');
  } catch (error) {
    authFeedback.textContent = error.message || 'Something went wrong. Please try again.';
    authFeedback.classList.add('error');
  } finally { submit.disabled = false; }
}

registerForm.addEventListener('submit', event => authenticateClient(event, 'register'));
clientLoginForm.addEventListener('submit', event => authenticateClient(event, 'login'));

document.querySelector('#client-logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch { /* clear the local account view even if the session already expired */
  } finally {
    setClientAccount(null);
    authDialog.close();
    inquiryFeedback.textContent = '';
  }
});

async function loadClientAccount() {
  try {
    const response = await fetch('/api/auth/session');
    const result = await response.json();
    setClientAccount(result.authenticated ? result.user : null);
  } catch { setClientAccount(null); }
}

inquiryForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!clientUser) {
    inquiryFeedback.textContent = 'Sign in or create an account before sending your inquiry.';
    inquiryFeedback.classList.remove('error');
    openClientAuth('register');
    return;
  }
  const submit = inquiryForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(inquiryForm).entries());
  inquiryFeedback.textContent = 'Sending your note…';
  inquiryFeedback.classList.remove('error');
  submit.disabled = true;
  try {
    const response = await fetch('/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Could not send your inquiry.'), { status: response.status });
    inquiryForm.reset();
    inquiryFeedback.textContent = result.emailSent
      ? 'Your inquiry is in our studio inbox. A confirmation email is on its way.'
      : 'Your inquiry is saved. One or more emails could not be sent by the website server.';
  } catch (error) {
    inquiryFeedback.textContent = error.message || 'Something went wrong. Please try again.';
    inquiryFeedback.classList.add('error');
    if (error.status === 401) {
      setClientAccount(null);
      openClientAuth('login');
    }
  } finally { submit.disabled = false; }
});

loadProjects();
loadClientAccount().then(() => {
  if (new URLSearchParams(location.search).get('auth') === 'login') openClientAuth('login');
});
