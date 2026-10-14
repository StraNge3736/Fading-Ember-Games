const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginFeedback = document.querySelector('#login-feedback');
const dialog = document.querySelector('#project-dialog');
const projectForm = document.querySelector('#project-form');
const projectFeedback = document.querySelector('#project-feedback');
const replyDialog = document.querySelector('#reply-dialog');
const replyForm = document.querySelector('#reply-form');
const replyFeedback = document.querySelector('#reply-feedback');
const toast = document.querySelector('#toast');
let projects = [];
let inquiries = [];
let currentReplyInquiry = null;
let toastTimer;

document.querySelector('#current-date').textContent = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());

function showLogin(message) {
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
  if (message) loginFeedback.textContent = message;
}

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  let result = {};
  try { result = await response.json(); } catch { /* keep an empty response object */ }
  if (response.status === 401 && path.startsWith('/api/admin/') && !['/api/admin/login', '/api/admin/session'].includes(path)) {
    showLogin('Your studio session ended. Sign in again to continue.');
  }
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
}

function shortDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

function statusClass(status) {
  return String(status || '').toLowerCase().replaceAll(' ', '-');
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusPill(status) {
  return element('span', `status-pill ${statusClass(status)}`, status);
}

function openReply(inquiry) {
  currentReplyInquiry = inquiry;
  replyForm.reset();
  replyForm.querySelector('[name="subject"]').value = `Fading Ember Games · ${inquiry.service} inquiry`;
  replyForm.querySelector('[name="message"]').value = `Hi ${inquiry.name},\n\nThanks for reaching out to Fading Ember Games about ${inquiry.service.toLowerCase()}. We’ve received your inquiry and would love to learn more.\n\nBest,\nFading Ember Games`;
  document.querySelector('#reply-recipient').textContent = `To: ${inquiry.email}`;
  replyFeedback.textContent = '';
  replyDialog.showModal();
}

function openProject(project = null) {
  projectForm.reset();
  projectFeedback.textContent = '';
  document.querySelector('#project-id').value = project?.id || '';
  document.querySelector('#dialog-title').innerHTML = project ? 'Edit this <em>project.</em>' : 'Add a <em>project.</em>';
  projectForm.elements.title.value = project?.title || '';
  projectForm.elements.category.value = project?.category || '';
  projectForm.elements.year.value = project?.year || new Date().getFullYear();
  projectForm.elements.description.value = project?.description || '';
  projectForm.elements.projectUrl.value = project?.projectUrl || project?.coverImage || '';
  projectForm.elements.tags.value = (project?.tags || []).join(', ');
  projectForm.elements.status.value = project?.status || 'Published';
  dialog.showModal();
  projectForm.elements.title.focus();
}

function compactProject(project) {
  const row = element('div', 'compact-project');
  row.append(element('span', 'compact-art'));
  const summary = element('span');
  summary.append(element('b', '', project.title), element('small', '', `${project.category} · ${project.year || ''}`));
  row.append(summary, statusPill(project.status));
  return row;
}

function compactInquiry(inquiry) {
  const row = element('div', 'compact-inquiry');
  const person = element('span');
  person.append(element('b', '', inquiry.name), element('small', '', `${inquiry.service} · ${shortDate(inquiry.createdAt)}`));
  row.append(person, statusPill(inquiry.status));
  return row;
}

function projectRow(project) {
  const row = element('article', 'project-row');
  const art = element('div', 'project-row-art');
  const main = element('div', 'project-row-main');
  main.append(element('b', '', project.title), element('small', '', `${project.category} · ${project.year || ''}`));
  const description = element('p', 'project-row-description', project.description);
  const actions = element('div', 'project-row-actions');
  actions.append(statusPill(project.status));
  const edit = element('button', 'mini-button', 'Edit');
  edit.type = 'button';
  edit.addEventListener('click', () => openProject(project));
  const remove = element('button', 'mini-button delete', 'Remove');
  remove.type = 'button';
  remove.addEventListener('click', () => deleteProject(project));
  actions.append(edit, remove);
  row.append(art, main, description, actions);
  return row;
}

function inquiryRow(inquiry) {
  const row = element('article', 'inquiry-row');
  const head = element('div', 'inquiry-row-head');
  const person = element('div', 'inquiry-person');
  const initials = inquiry.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '•';
  person.append(element('span', 'inquiry-avatar', initials));
  const who = element('span');
  who.append(element('b', '', inquiry.name), element('small', '', inquiry.email));
  person.append(who);
  const date = element('div', 'inquiry-date');
  date.append(element('span', '', shortDate(inquiry.createdAt)), document.createElement('br'), statusPill(inquiry.status));
  head.append(person, date);
  const meta = element('div', 'inquiry-meta');
  meta.append(element('span', '', inquiry.service), element('span', '', inquiry.budget || 'Budget not shared'));
  const details = element('p', 'inquiry-details', inquiry.details);
  const actions = element('div', 'inquiry-actions');
  const mail = element('button', 'email-link send-email-button', 'Send email ↗');
  mail.type = 'button';
  mail.addEventListener('click', () => openReply(inquiry));
  const emailLinks = element('div', 'email-links');
  emailLinks.append(mail);
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Update status for ${inquiry.name}`);
  ['New', 'In progress', 'Maintenance', 'Closed'].forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `Mark ${value.toLowerCase()}`;
    select.append(option);
  });
  select.value = inquiry.status;
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      const result = await request(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, { method: 'PUT', body: JSON.stringify({ status: select.value }) });
      await loadDashboard();
      announce(!result.statusChanged ? 'Inquiry status is unchanged.' : result.emailSent ? 'Status updated; email notifications sent.' : 'Status updated, but email notifications could not be sent.');
    } catch (error) {
      select.value = inquiry.status;
      announce(error.message);
    } finally { select.disabled = false; }
  });
  actions.append(emailLinks, select);
  row.append(head, meta, details, actions);
  return row;
}

function renderDashboard() {
  const published = projects.filter(project => project.status === 'Published').length;
  const drafts = projects.length - published;
  const newCount = inquiries.filter(inquiry => inquiry.status === 'New').length;
  document.querySelector('#stat-published').textContent = published;
  document.querySelector('#stat-drafts').textContent = drafts;
  document.querySelector('#stat-new-inquiries').textContent = newCount;
  document.querySelector('#nav-project-count').textContent = projects.length;
  document.querySelector('#nav-inquiry-count').textContent = newCount;
  document.querySelector('#inquiry-total-count').textContent = inquiries.length;

  const recentProjects = [...projects].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 4);
  const recentProjectList = document.querySelector('#recent-projects');
  recentProjectList.replaceChildren(...(recentProjects.length ? recentProjects.map(compactProject) : [element('div', 'compact-empty', 'Your first project is waiting to be added.') ]));
  const recentInquiryList = document.querySelector('#recent-inquiries');
  recentInquiryList.replaceChildren(...(inquiries.length ? inquiries.slice(0, 4).map(compactInquiry) : [element('div', 'compact-empty', 'New project notes will find their way here.') ]));

  const filter = document.querySelector('#project-filter').value;
  const filteredProjects = filter === 'All' ? projects : projects.filter(project => project.status === filter);
  document.querySelector('#project-summary').textContent = `${filteredProjects.length} ${filteredProjects.length === 1 ? 'project' : 'projects'}`;
  const projectList = document.querySelector('#admin-project-list');
  projectList.replaceChildren(...(filteredProjects.length ? filteredProjects.map(projectRow) : [element('div', 'compact-empty', filter === 'Draft' ? 'No drafts yet.' : 'No projects here yet. Add a first piece of work.') ]));

  const inquiryFilter = document.querySelector('#inquiry-filter').value;
  const filteredInquiries = inquiryFilter === 'All' ? inquiries : inquiries.filter(inquiry => inquiry.status === inquiryFilter);
  document.querySelector('#inquiry-summary').textContent = filteredInquiries.length ? `${filteredInquiries.length} in your inbox` : 'Your studio inbox';
  const inquiryList = document.querySelector('#admin-inquiry-list');
  inquiryList.replaceChildren(...(filteredInquiries.length ? filteredInquiries.map(inquiryRow) : [element('div', 'compact-empty', inquiryFilter === 'All' ? 'No inquiries yet. Share your site and let the conversations begin.' : `No ${inquiryFilter.toLowerCase()} inquiries.`) ]));
}

async function loadDashboard() {
  const data = await request('/api/admin/overview');
  projects = Array.isArray(data.projects) ? data.projects : [];
  inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
  renderDashboard();
}

async function showDashboard() {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  await loadDashboard();
}

async function checkSession() {
  try {
    const result = await request('/api/admin/session');
    if (result.authenticated) await showDashboard();
  } catch { /* the sign-in view remains available */ }
}

function switchView(name) {
  const labels = { overview: 'Overview', projects: 'Projects', inquiries: 'Inquiries' };
  document.querySelectorAll('.admin-view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.classList.contains('side-link')) button.classList.toggle('active', button.dataset.view === name);
  });
  document.querySelector('#breadcrumb-current').textContent = labels[name] || 'Overview';
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelectorAll('[data-action="new-project"]').forEach(button => button.addEventListener('click', () => openProject()));
document.querySelector('#project-filter').addEventListener('change', renderDashboard);
document.querySelector('#inquiry-filter').addEventListener('change', renderDashboard);

document.querySelector('#password-toggle').addEventListener('click', event => {
  const input = document.querySelector('#login-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginFeedback.textContent = 'Opening the studio…';
  try {
    const result = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: loginForm.elements.username.value, password: loginForm.elements.password.value }) });
    loginFeedback.textContent = '';
    loginForm.reset();
    await showDashboard();
    announce(result.emailSent ? 'Studio sign-in email sent.' : 'Signed in, but the sign-in email could not be sent.');
  } catch (error) {
    loginFeedback.textContent = error.message;
    loginForm.elements.password.focus();
  } finally { button.disabled = false; }
});

async function deleteProject(project) {
  if (!window.confirm(`Remove “${project.title}” from the portfolio?`)) return;
  try {
    await request(`/api/admin/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
    await loadDashboard();
    announce('Project removed from your portfolio.');
  } catch (error) { announce(error.message); }
}

projectForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.querySelector('#project-save');
  const projectId = document.querySelector('#project-id').value;
  const data = Object.fromEntries(new FormData(projectForm).entries());
  delete data.id;
  submit.disabled = true;
  projectFeedback.textContent = 'Saving your changes…';
  try {
    await request(projectId ? `/api/admin/projects/${encodeURIComponent(projectId)}` : '/api/admin/projects', {
      method: projectId ? 'PUT' : 'POST', body: JSON.stringify(data)
    });
    dialog.close();
    await loadDashboard();
    announce(projectId ? 'Project updated.' : 'Project added to your studio.');
  } catch (error) {
    projectFeedback.textContent = error.message;
  } finally { submit.disabled = false; }
});

document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('#dialog-cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

replyForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentReplyInquiry) return;
  const submit = replyForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  replyFeedback.textContent = 'Sending through the website mail server…';
  try {
    await request(`/api/admin/inquiries/${encodeURIComponent(currentReplyInquiry.id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        subject: replyForm.querySelector('[name="subject"]').value,
        message: replyForm.querySelector('[name="message"]').value
      })
    });
    replyDialog.close();
    announce(`Email sent to ${currentReplyInquiry.email}.`);
  } catch (error) {
    replyFeedback.textContent = error.message;
  } finally { submit.disabled = false; }
});

document.querySelector('#reply-close').addEventListener('click', () => replyDialog.close());
document.querySelector('#reply-cancel').addEventListener('click', () => replyDialog.close());
replyDialog.addEventListener('click', event => { if (event.target === replyDialog) replyDialog.close(); });

async function signOut() {
  try { await request('/api/admin/logout', { method: 'POST', body: '{}' }); } catch { /* clear the local view either way */ }
  showLogin();
  loginForm.reset();
  loginFeedback.textContent = 'You’ve signed out of the studio.';
}

document.querySelectorAll('#logout-button, #topbar-logout').forEach(button => button.addEventListener('click', signOut));

checkSession();
