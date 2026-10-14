const query = new URLSearchParams(location.search);
const role = query.get('role') === 'admin' ? 'admin' : 'client';
const token = query.get('token') || '';
const forgotForm = document.querySelector('#forgot-form');
const resetForm = document.querySelector('#reset-form');
const feedback = document.querySelector('#recovery-feedback');
const title = document.querySelector('#recovery-title');
const eyebrow = document.querySelector('#recovery-eyebrow');
const intro = document.querySelector('#recovery-intro');
const cardBackLink = document.querySelector('#card-back-link');
const backLink = document.querySelector('#back-link');
const returnPath = role === 'admin' ? '/admin' : '/?auth=login#contact';

cardBackLink.href = returnPath;
backLink.href = returnPath;

if (token) {
  forgotForm.hidden = true;
  resetForm.hidden = false;
  eyebrow.textContent = `${role === 'admin' ? 'STUDIO' : 'CLIENT'} PASSWORD RESET`;
  title.innerHTML = 'Choose a new <em>password.</em>';
  intro.textContent = 'Set a new password for your account. This one-time link expires after 60 minutes.';
} else {
  eyebrow.textContent = `${role === 'admin' ? 'STUDIO' : 'CLIENT'} ACCOUNT RECOVERY`;
}

async function submitJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not complete this request. Please try again.');
  return result;
}

forgotForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = forgotForm.querySelector('button[type="submit"]');
  button.disabled = true;
  feedback.textContent = 'Sending your recovery email…';
  feedback.classList.remove('error');
  try {
    const result = await submitJson('/api/password/forgot', {
      role,
      email: forgotForm.elements.email.value.trim()
    });
    feedback.textContent = result.message || 'If the account exists, a reset link has been sent.';
  } catch (error) {
    feedback.textContent = error.message || 'Could not request a reset link.';
    feedback.classList.add('error');
  } finally {
    button.disabled = false;
  }
});

resetForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = resetForm.elements.password.value;
  if (password !== resetForm.elements.confirmPassword.value) {
    feedback.textContent = 'Those passwords do not match.';
    feedback.classList.add('error');
    return;
  }
  const button = resetForm.querySelector('button[type="submit"]');
  button.disabled = true;
  feedback.textContent = 'Updating your password…';
  feedback.classList.remove('error');
  try {
    const result = await submitJson('/api/password/reset', { role, token, password });
    resetForm.hidden = true;
    title.innerHTML = 'You’re back <em>in control.</em>';
    intro.textContent = result.message || 'Your password has been updated.';
    feedback.textContent = '';
    cardBackLink.textContent = role === 'admin' ? 'Return to studio sign in' : 'Return to client sign in';
    cardBackLink.focus();
  } catch (error) {
    feedback.textContent = error.message || 'Could not reset your password.';
    feedback.classList.add('error');
  } finally {
    button.disabled = false;
  }
});
