const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const nodemailer = require('nodemailer');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ember-demo-2026';
const DEFAULT_ADMIN_EMAIL = 'studio@fadingembergames.local';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim().toLowerCase() || null;
const SESSION_TTL = 1000 * 60 * 60 * 12;
const RESET_TTL = 1000 * 60 * 60;
const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = (process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim();
const SMTP_FROM = process.env.SMTP_FROM?.trim() || SMTP_USER || ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const SMTP_AUTH_PARTIAL = Boolean(SMTP_USER) !== Boolean(SMTP_PASS);
const SMTP_CONFIGURED = Boolean(SMTP_HOST && Number.isInteger(SMTP_PORT) && SMTP_PORT > 0 && SMTP_PORT <= 65535 && SMTP_FROM && !SMTP_AUTH_PARTIAL);
const SMTP_SETUP_MESSAGE = SMTP_AUTH_PARTIAL
  ? 'Email authentication is incomplete. Add the Gmail App Password as SMTP_PASS in the project .env file, then restart the server.'
  : 'The website mail relay is not configured. Set SMTP_HOST, SMTP_FROM, and any required credentials in the project .env file, then restart the server.';
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const passwordRecoveryAttempts = new Map();
const mailTransporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      ...(SMTP_USER && SMTP_PASS ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    })
  : null;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon'
};

const seed = {
  projects: [
    { id: 'sample-nightfall', title: 'Nightfall Interactive', category: 'Web Development', year: '2026', description: 'A story-led digital home for an independent game studio, built to make every new world feel like an invitation.', tags: ['Website', 'Strategy'], projectUrl: '', status: 'Published', createdAt: '2026-05-18T12:00:00.000Z' },
    { id: 'sample-emberline', title: 'Emberline Records', category: 'Graphic Design', year: '2026', description: 'A warm, expressive visual identity and launch campaign for a label with a sound all its own.', tags: ['Identity', 'Campaign'], projectUrl: '', status: 'Published', createdAt: '2026-04-24T12:00:00.000Z' },
    { id: 'sample-echoes', title: 'Echoes of Rhyme', category: 'Video Editing', year: '2025', description: 'A sharp, atmospheric edit that turns live performance footage into a cinematic artist film.', tags: ['Film', 'Motion'], projectUrl: '', status: 'Published', createdAt: '2026-03-11T12:00:00.000Z' },
    { id: 'sample-ashen', title: 'Ashen Realms', category: 'Game Art', year: '2025', description: 'Early world-building, key art, and a visual direction for an original fantasy adventure.', tags: ['Concept', 'Worldbuilding'], projectUrl: '', status: 'Published', createdAt: '2026-02-06T12:00:00.000Z' }
  ],
  inquiries: [],
  users: []
};

let store;
let writeQueue = Promise.resolve();

function isVerifiedAdmin(admin) {
  return Boolean(
    ADMIN_USERNAME && ADMIN_EMAIL && /^[a-z0-9._-]{3,40}$/.test(ADMIN_USERNAME) &&
    admin && admin.username === ADMIN_USERNAME && String(admin.email || '').toLowerCase() === ADMIN_EMAIL
  );
}

async function loadStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    store = JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    store = structuredClone(seed);
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) store = structuredClone(seed);
  if (!Array.isArray(store.projects)) store.projects = [];
  if (!Array.isArray(store.inquiries)) store.inquiries = [];
  if (!Array.isArray(store.users)) store.users = [];
  if (!Array.isArray(store.passwordResets)) store.passwordResets = [];
  if (!store.admin || !store.admin.passwordSalt || !store.admin.passwordHash) {
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    store.admin = {
      email: ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
      username: ADMIN_USERNAME || 'studio-admin',
      passwordSalt,
      passwordHash: (await hashPassword(ADMIN_PASSWORD, passwordSalt)).toString('hex'),
      verified: false
    };
  } else {
    store.admin.email = ADMIN_EMAIL || store.admin.email || DEFAULT_ADMIN_EMAIL;
    store.admin.username = ADMIN_USERNAME || store.admin.username || store.admin.email.split('@')[0].toLowerCase();
  }
  store.admin.verified = isVerifiedAdmin(store.admin);
  await saveStore();
}

function saveStore() {
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue.then(async () => {
    const temp = `${STORE_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temp, snapshot, 'utf8');
    await fs.rename(temp, STORE_FILE);
  });
  return writeQueue;
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(pair => pair.length === 2));
}

function sessionFor(req, role) {
  const cookieName = role === 'admin' ? 'ember_admin' : 'ember_client';
  const key = parseCookies(req.headers.cookie)[cookieName];
  const session = key && sessions.get(key);
  if (!session || session.expiresAt < Date.now()) {
    if (key) sessions.delete(key);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  if (role && session.role !== role) return null;
  if (role === 'admin' && !isVerifiedAdmin(store?.admin)) return null;
  return { token: key, ...session };
}

function cookieHeader(req, role, value, maxAge) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  const cookieName = role === 'admin' ? 'ember_admin' : 'ember_client';
  const cookiePath = role === 'admin' ? '/api/admin' : '/api';
  return `${cookieName}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${maxAge}${secure}`;
}

async function hashPassword(password, salt) {
  return scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function createSession(role, userId = null) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { role, userId, expiresAt: Date.now() + SESSION_TTL });
  return token;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function readJson(req, limit = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Please send valid JSON.'), { status: 400 }); }
}

function cleanText(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function passwordResetHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function recoveryRateLimited(req) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (passwordRecoveryAttempts.get(key) || []).filter(timestamp => now - timestamp < 15 * 60 * 1000);
  if (recent.length >= 5) {
    passwordRecoveryAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  passwordRecoveryAttempts.set(key, recent);
  return false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function sendPasswordResetEmail(email, role, resetUrl) {
  const accountName = role === 'admin' ? 'studio' : 'client';
  const safeUrl = escapeHtml(resetUrl);
  await mailTransporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: 'Reset your Fading Ember Games password',
    text: `We received a request to reset your ${accountName} password. Use this one-time link within 60 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;background:#0b0b10;color:#f0e6da;padding:32px"><div style="max-width:520px;margin:auto;background:#17161c;border:1px solid #40352c;padding:28px"><p style="color:#e88c32;letter-spacing:2px;font-size:12px">FADING EMBER GAMES</p><h1 style="font-size:24px">Reset your password</h1><p>We received a request to reset your ${accountName} password. This one-time link expires in 60 minutes.</p><p style="margin:28px 0"><a href="${safeUrl}" style="background:#e88c32;color:#17110b;text-decoration:none;padding:12px 18px;font-weight:bold">Reset password</a></p><p style="color:#aaa;font-size:13px">If you did not request this, you can ignore this email.</p></div></div>`
  });
}

async function sendInquiryEmail(to, subject, text, html) {
  await mailTransporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
}

async function sendEventEmails(eventName, messages) {
  if (!mailTransporter) return false;
  const results = await Promise.allSettled(messages.filter(message => message.to).map(message => {
    const html = `<div style="font-family:Arial,sans-serif;background:#0b0b10;color:#f0e6da;padding:32px"><div style="max-width:560px;margin:auto;background:#17161c;border:1px solid #40352c;padding:28px"><p style="color:#e88c32;letter-spacing:2px;font-size:12px">FADING EMBER GAMES</p><h2>${escapeHtml(message.subject)}</h2><p>${escapeHtml(message.text).replace(/\r?\n/g, '<br>')}</p></div></div>`;
    return sendInquiryEmail(message.to, message.subject, message.text, html);
  }));
  const sent = results.length > 0 && results.every(result => result.status === 'fulfilled');
  if (!sent) console.error(`${eventName} notification email failed for one or more recipients.`);
  return sent;
}

function validateProject(body) {
  const title = cleanText(body.title, 90);
  const category = cleanText(body.category, 40);
  const year = cleanText(body.year, 4);
  const description = cleanText(body.description, 600);
  const projectUrl = cleanText(body.projectUrl ?? body.coverImage, 500);
  if (!title || !category || !description || !projectUrl) return { error: 'Add a project title, category, story, and project URL.' };
  if (!/^https?:\/\//i.test(projectUrl)) return { error: 'Project URL must use an http or https URL.' };
  const tags = Array.isArray(body.tags) ? body.tags.map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 5) : cleanText(body.tags, 120).split(',').map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 5);
  return {
    value: { title, category, year: /^\d{4}$/.test(year) ? year : String(new Date().getFullYear()), description, projectUrl, tags, status: body.status === 'Draft' ? 'Draft' : 'Published' }
  };
}

function routeId(pathname, prefix) {
  const match = pathname.match(new RegExp(`^${prefix}/([^/]+)$`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function api(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;

  if (pathname === '/api/password/forgot' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was not accepted.' });
    if (recoveryRateLimited(req)) return sendJson(res, 429, { error: 'Too many recovery requests. Please wait 15 minutes and try again.' });
    if (!mailTransporter) return sendJson(res, 503, { error: SMTP_SETUP_MESSAGE });
    const body = await readJson(req);
    const role = body.role === 'admin' ? 'admin' : body.role === 'client' ? 'client' : null;
    const email = cleanText(body.email, 160).toLowerCase();
    if (!role || !/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'Choose an account type and enter a valid email address.' });

    const account = role === 'admin'
      ? (store.admin.email === email ? store.admin : null)
      : (store.users.find(user => user.email === email) || null);
    if (account) {
      const token = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      store.passwordResets = store.passwordResets.filter(reset => !(reset.role === role && reset.accountId === (role === 'admin' ? 'admin' : account.id)) && reset.expiresAt > now);
      store.passwordResets.push({
        tokenHash: passwordResetHash(token),
        role,
        accountId: role === 'admin' ? 'admin' : account.id,
        expiresAt: now + RESET_TTL
      });
      await saveStore();
      const resetUrl = `${APP_BASE_URL}/reset-password?role=${role}&token=${token}`;
      try {
        await sendPasswordResetEmail(account.email, role, resetUrl);
      } catch (error) {
        store.passwordResets = store.passwordResets.filter(reset => reset.tokenHash !== passwordResetHash(token));
        await saveStore();
        console.error('Password recovery email could not be sent:', error.code || 'SMTP_ERROR');
        return sendJson(res, 502, { error: 'We could not send the reset email. Check the mail settings and try again.' });
      }
    }
    return sendJson(res, 200, { ok: true, message: 'If an account matches that email, a reset link has been sent.' });
  }

  if (pathname === '/api/password/reset' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was not accepted.' });
    const body = await readJson(req);
    const role = body.role === 'admin' ? 'admin' : body.role === 'client' ? 'client' : null;
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (!role || !/^[a-f0-9]{64}$/i.test(token)) return sendJson(res, 400, { error: 'This reset link is invalid or incomplete.' });
    if (password.length < 10 || password.length > 128) return sendJson(res, 400, { error: 'Choose a password between 10 and 128 characters.' });
    const now = Date.now();
    store.passwordResets = store.passwordResets.filter(reset => reset.expiresAt > now);
    const resetHash = passwordResetHash(token);
    const resetIndex = store.passwordResets.findIndex(reset => reset.role === role && reset.tokenHash === resetHash);
    if (resetIndex < 0) {
      await saveStore();
      return sendJson(res, 400, { error: 'This reset link has expired or has already been used. Request a new one.' });
    }
    const reset = store.passwordResets[resetIndex];
    const user = role === 'client' ? store.users.find(item => item.id === reset.accountId) : null;
    if ((role === 'admin' && reset.accountId !== 'admin') || (role === 'client' && !user)) {
      store.passwordResets.splice(resetIndex, 1);
      await saveStore();
      return sendJson(res, 400, { error: 'This reset link is invalid.' });
    }
    // Claim the token before awaiting scrypt so concurrent submissions cannot reuse it.
    store.passwordResets.splice(resetIndex, 1);
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await hashPassword(password, passwordSalt)).toString('hex');
    if (role === 'admin') {
      store.admin.passwordSalt = passwordSalt;
      store.admin.passwordHash = passwordHash;
    } else {
      user.passwordSalt = passwordSalt;
      user.passwordHash = passwordHash;
    }
    store.passwordResets = store.passwordResets.filter(item => item.role !== role || item.accountId !== reset.accountId);
    for (const [sessionToken, session] of sessions) {
      if (session.role === role && (role === 'admin' || session.userId === reset.accountId)) sessions.delete(sessionToken);
    }
    await saveStore();
    return sendJson(res, 200, { ok: true, message: 'Your password has been updated. You can sign in now.' });
  }

  if (method === 'GET' && pathname === '/api/projects') {
    return sendJson(res, 200, { projects: store.projects.filter(project => project.status === 'Published').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  }

  if (pathname.startsWith('/api/auth/')) {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was not accepted.' });
    if (method === 'GET' && pathname === '/api/auth/session') {
      const session = sessionFor(req, 'client');
      const user = session && store.users.find(item => item.id === session.userId);
      return sendJson(res, 200, { authenticated: Boolean(user), user: user ? publicUser(user) : null });
    }
    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await readJson(req);
      const name = cleanText(body.name, 100);
      const email = cleanText(body.email, 160).toLowerCase();
      const password = String(body.password || '');
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'Add your name and a valid email address.' });
      if (password.length < 10 || password.length > 128) return sendJson(res, 400, { error: 'Choose a password between 10 and 128 characters.' });
      if (store.users.some(user => user.email === email)) return sendJson(res, 409, { error: 'An account already uses that email. Please sign in instead.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = (await hashPassword(password, salt)).toString('hex');
      const user = { id: crypto.randomUUID(), name, email, passwordSalt: salt, passwordHash, createdAt: new Date().toISOString() };
      store.users.unshift(user);
      await saveStore();
      const token = createSession('client', user.id);
      const emailSent = await sendEventEmails('New client account', [
        { to: user.email, subject: 'Welcome to Fading Ember Games', text: `Hi ${user.name},\n\nYour client account has been created. You can now send project inquiries through our website.` },
        { to: store.admin.email, subject: 'New client account created', text: `A new client account was created.\n\nName: ${user.name}\nEmail: ${user.email}\nCreated: ${user.createdAt}` }
      ]);
      return sendJson(res, 201, { ok: true, user: publicUser(user), emailSent }, { 'Set-Cookie': cookieHeader(req, 'client', token, SESSION_TTL / 1000) });
    }
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(req);
      const email = cleanText(body.email, 160).toLowerCase();
      const password = String(body.password || '');
      const user = store.users.find(item => item.email === email);
      const candidate = user && password.length <= 128 ? await hashPassword(password, user.passwordSalt) : null;
      const saved = user && Buffer.from(user.passwordHash, 'hex');
      const accepted = Boolean(candidate && saved && candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved));
      if (!accepted) return sendJson(res, 401, { error: 'Email or password did not match.' });
      const token = createSession('client', user.id);
      const signedInAt = new Date().toISOString();
      const emailSent = await sendEventEmails('Client sign-in', [
        { to: user.email, subject: 'New sign-in to your Fading Ember Games account', text: `Hi ${user.name},\n\nYour account was signed in at ${signedInAt}. If this was not you, reset your password and contact the studio.` },
        { to: store.admin.email, subject: 'Client signed in to Fading Ember Games', text: `A client signed in to their account.\n\nName: ${user.name}\nEmail: ${user.email}\nTime: ${signedInAt}` }
      ]);
      return sendJson(res, 200, { ok: true, user: publicUser(user), emailSent }, { 'Set-Cookie': cookieHeader(req, 'client', token, SESSION_TTL / 1000) });
    }
    if (method === 'POST' && pathname === '/api/auth/logout') {
      const session = sessionFor(req, 'client');
      if (session) sessions.delete(session.token);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, 'client', '', 0) });
    }
    return sendJson(res, 404, { error: 'Account endpoint was not found.' });
  }

  if (method === 'POST' && pathname === '/api/inquiries') {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was not accepted.' });
    const session = sessionFor(req, 'client');
    const user = session && store.users.find(item => item.id === session.userId);
    if (!user) return sendJson(res, 401, { error: 'Create a client account or sign in before sending an inquiry.' });
    const body = await readJson(req);
    const service = cleanText(body.service, 60);
    const details = cleanText(body.details, 1800);
    if (!service || details.length < 12) {
      return sendJson(res, 400, { error: 'Choose a service and add a few project details.' });
    }
    const inquiry = { id: crypto.randomUUID(), userId: user.id, name: user.name, email: user.email, service, budget: cleanText(body.budget, 60), details, status: 'New', createdAt: new Date().toISOString() };
    store.inquiries.unshift(inquiry);
    await saveStore();
    let emailSent = false;
    if (mailTransporter) {
      const clientSubject = `We received your ${service} inquiry`;
      const clientText = `Hi ${inquiry.name},\n\nThanks for reaching out to Fading Ember Games. We received your ${service.toLowerCase()} inquiry and will be in touch soon.\n\nBest,\nFading Ember Games`;
      const adminSubject = `New ${service} inquiry from ${inquiry.name}`;
      const adminText = `A new project inquiry was submitted.\n\nClient: ${inquiry.name}\nEmail: ${inquiry.email}\nService: ${service}\nBudget: ${inquiry.budget || 'Not shared'}\n\nProject details:\n${details}`;
      const safeName = escapeHtml(inquiry.name);
      const safeService = escapeHtml(service);
      const safeDetails = escapeHtml(details).replace(/\r?\n/g, '<br>');
      const results = await Promise.allSettled([
        sendInquiryEmail(inquiry.email, clientSubject, clientText, `<p>Hi ${safeName},</p><p>Thanks for reaching out to Fading Ember Games. We received your ${safeService.toLowerCase()} inquiry and will be in touch soon.</p><p>Best,<br>Fading Ember Games</p>`),
        sendInquiryEmail(store.admin.email, adminSubject, adminText, `<h2>New project inquiry</h2><p><b>Client:</b> ${safeName} (${escapeHtml(inquiry.email)})</p><p><b>Service:</b> ${safeService}<br><b>Budget:</b> ${escapeHtml(inquiry.budget || 'Not shared')}</p><p><b>Project details:</b><br>${safeDetails}</p>`)
      ]);
      emailSent = results.every(result => result.status === 'fulfilled');
      if (!emailSent) console.error('One or more inquiry emails could not be sent.');
    }
    return sendJson(res, 201, { ok: true, emailSent });
  }

  if (pathname.startsWith('/api/admin/')) {
    if (method !== 'GET' && !sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was not accepted.' });
    if (method === 'POST' && pathname === '/api/admin/login') {
      const body = await readJson(req);
      const username = cleanText(body.username, 40).toLowerCase();
      const password = String(body.password || '');
      const candidate = password.length <= 128 ? await hashPassword(password, store.admin.passwordSalt) : null;
      const expected = Buffer.from(store.admin.passwordHash, 'hex');
      const accepted = Boolean(isVerifiedAdmin(store.admin) && username === store.admin.username && candidate && candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected));
      if (!accepted) return sendJson(res, 401, { error: 'That password did not match.' });
      const token = createSession('admin');
      const signedInAt = new Date().toISOString();
      const emailSent = await sendEventEmails('Admin sign-in', [
        { to: store.admin.email, subject: 'Studio sign-in alert', text: `A Fading Ember Games admin account signed in at ${signedInAt}. If this was not you, reset the studio password immediately.` }
      ]);
      return sendJson(res, 200, { ok: true, emailSent }, { 'Set-Cookie': cookieHeader(req, 'admin', token, SESSION_TTL / 1000) });
    }
    if (method === 'GET' && pathname === '/api/admin/session') {
      return sendJson(res, 200, { authenticated: Boolean(sessionFor(req, 'admin')) });
    }
    if (method === 'POST' && pathname === '/api/admin/logout') {
      const session = sessionFor(req, 'admin');
      if (session) sessions.delete(session.token);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, 'admin', '', 0) });
    }
    if (!sessionFor(req, 'admin')) return sendJson(res, 401, { error: 'Please sign in to continue.' });

    const replyMatch = pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/reply$/);
    if (replyMatch && method === 'POST') {
      if (!mailTransporter) return sendJson(res, 503, { error: SMTP_SETUP_MESSAGE });
      const inquiryId = decodeURIComponent(replyMatch[1]);
      const inquiry = store.inquiries.find(item => item.id === inquiryId);
      if (!inquiry) return sendJson(res, 404, { error: 'Inquiry was not found.' });
      const body = await readJson(req);
      const subject = cleanText(body.subject, 140);
      const message = String(body.message || '').trim().slice(0, 4000);
      if (!subject || message.length < 2) return sendJson(res, 400, { error: 'Add an email subject and message.' });
      try {
        await sendInquiryEmail(inquiry.email, subject, message, `<p>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>`);
      } catch (error) {
        console.error('Inquiry reply email could not be sent:', error.code || 'SMTP_ERROR');
        return sendJson(res, 502, { error: 'The email could not be sent. Check the website mail relay and try again.' });
      }
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/api/admin/overview') {
      return sendJson(res, 200, { projects: store.projects, inquiries: store.inquiries });
    }
    if (method === 'POST' && pathname === '/api/admin/projects') {
      const body = await readJson(req);
      const checked = validateProject(body);
      if (checked.error) return sendJson(res, 400, { error: checked.error });
      const project = { id: crypto.randomUUID(), ...checked.value, createdAt: new Date().toISOString() };
      store.projects.unshift(project);
      await saveStore();
      return sendJson(res, 201, { project });
    }
    const projectId = routeId(pathname, '/api/admin/projects');
    if (projectId && method === 'PUT') {
      const index = store.projects.findIndex(item => item.id === projectId);
      if (index < 0) return sendJson(res, 404, { error: 'Project was not found.' });
      const checked = validateProject(await readJson(req));
      if (checked.error) return sendJson(res, 400, { error: checked.error });
      store.projects[index] = { ...store.projects[index], ...checked.value };
      await saveStore();
      return sendJson(res, 200, { project: store.projects[index] });
    }
    if (projectId && method === 'DELETE') {
      const previous = store.projects.length;
      store.projects = store.projects.filter(item => item.id !== projectId);
      if (store.projects.length === previous) return sendJson(res, 404, { error: 'Project was not found.' });
      await saveStore();
      return sendJson(res, 200, { ok: true });
    }
    const inquiryId = routeId(pathname, '/api/admin/inquiries');
    if (inquiryId && method === 'PUT') {
      const body = await readJson(req);
      const inquiry = store.inquiries.find(item => item.id === inquiryId);
      if (!inquiry) return sendJson(res, 404, { error: 'Inquiry was not found.' });
      if (!['New', 'In progress', 'Maintenance', 'Closed'].includes(body.status)) return sendJson(res, 400, { error: 'Choose a valid inquiry status.' });
      const previousStatus = inquiry.status;
      inquiry.status = body.status;
      await saveStore();
      const statusChanged = previousStatus !== inquiry.status;
      const emailSent = statusChanged ? await sendEventEmails('Inquiry status update', [
        { to: inquiry.email, subject: `Project inquiry update: ${inquiry.status}`, text: `Hi ${inquiry.name},\n\nThe status of your ${inquiry.service} inquiry has changed from “${previousStatus}” to “${inquiry.status}”.\n\nIf you have questions, reply to this email and the studio team will get back to you.` },
        { to: store.admin.email, subject: `Inquiry status changed to ${inquiry.status}`, text: `An inquiry status was updated.\n\nClient: ${inquiry.name}\nEmail: ${inquiry.email}\nService: ${inquiry.service}\nStatus: ${previousStatus} → ${inquiry.status}` }
      ]) : false;
      return sendJson(res, 200, { inquiry, statusChanged, emailSent });
    }
    if (inquiryId && method === 'DELETE') {
      const previous = store.inquiries.length;
      store.inquiries = store.inquiries.filter(item => item.id !== inquiryId);
      if (store.inquiries.length === previous) return sendJson(res, 404, { error: 'Inquiry was not found.' });
      await saveStore();
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'Admin endpoint was not found.' });
  }

  return sendJson(res, 404, { error: 'Endpoint was not found.' });
}

async function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); return res.end('Invalid URL.'); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';
  if (pathname === '/forgot-password' || pathname === '/reset-password') pathname = '/recovery.html';
  const target = path.resolve(PUBLIC, `.${pathname}`);
  if (!target.startsWith(`${PUBLIC}${path.sep}`)) { res.writeHead(403); return res.end('Forbidden.'); }
  try {
    const content = await fs.readFile(target);
    const headers = { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
    if (path.basename(target) === 'recovery.html') headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('This page has gone cold.');
  }
}

async function handle(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      return res.end('Method not allowed.');
    }
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'The server hit a snag. Please try again.' });
    else res.end();
  }
}

loadStore().then(() => {
    if (mailTransporter) console.log(`Email relay configured at ${SMTP_HOST}:${SMTP_PORT}`);
    else console.warn(SMTP_SETUP_MESSAGE);
    http.createServer(handle).listen(PORT, HOST, () => {
    console.log(`Fading Ember Games is running at http://localhost:${PORT}`);
    console.log(`Admin studio: http://localhost:${PORT}/admin`);
  });
}).catch(error => {
  console.error('Could not load the project store:', error);
  process.exitCode = 1;
});
