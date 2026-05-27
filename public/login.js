document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  const toRegister = document.getElementById('to-register');
  const toLogin = document.getElementById('to-login');
  
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorBanner = document.getElementById('auth-error-banner');
  
  const loginSubmit = document.getElementById('login-submit');
  const registerSubmit = document.getElementById('register-submit');
  
  const googleLoginBtn = document.getElementById('google-login-btn');
  const googleRegisterBtn = document.getElementById('google-register-btn');

  // Parse URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const redirectDest = urlParams.get('redirect') || '/';
  const errorCode = urlParams.get('error');

  // Handle errors passed via URL (e.g. from Google callback failures)
  if (errorCode === 'google_failed') {
    showError('Google authentication failed. Please try again.');
  }

  // Update Google OAuth buttons to include redirect query param if present
  if (redirectDest && redirectDest !== '/') {
    const encodedDest = encodeURIComponent(redirectDest);
    googleLoginBtn.href = `/api/auth/google?redirect=${encodedDest}`;
    googleRegisterBtn.href = `/api/auth/google?redirect=${encodedDest}`;
  }

  // Toggle View: To Register Form
  toRegister.addEventListener('click', (e) => {
    e.preventDefault();
    clearError();
    loginView.classList.remove('active');
    setTimeout(() => {
      loginView.style.display = 'none';
      registerView.style.display = 'block';
      setTimeout(() => registerView.classList.add('active'), 20);
    }, 400);
  });

  // Toggle View: To Login Form
  toLogin.addEventListener('click', (e) => {
    e.preventDefault();
    clearError();
    registerView.classList.remove('active');
    setTimeout(() => {
      registerView.style.display = 'none';
      loginView.style.display = 'block';
      setTimeout(() => loginView.classList.add('active'), 20);
    }, 400);
  });

  // 1. Submit Handlers: Login Form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(loginSubmit, true, 'Signing In...');

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        window.location.href = redirectDest;
      } else {
        showError(data.error || 'Authentication failed. Please verify your credentials.');
      }
    } catch (err) {
      showError('A network error occurred. Please verify your connection.');
    } finally {
      setLoading(loginSubmit, false, 'Sign In');
    }
  });

  // 2. Submit Handlers: Register Form
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(registerSubmit, true, 'Creating Account...');

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
        credentials: 'include'
      });

      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = redirectDest;
      } else {
        showError(data.error || 'Failed to create account.');
      }
    } catch (err) {
      showError('A network error occurred. Please verify your connection.');
    } finally {
      setLoading(registerSubmit, false, 'Create Account');
    }
  });

  // Helper: Display Error
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.add('visible');
    // Scroll to the top of the form panel to see the error
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Helper: Clear Error
  function clearError() {
    errorBanner.textContent = '';
    errorBanner.classList.remove('visible');
  }

  // Helper: Button Loading State
  function setLoading(btn, isLoading, text) {
    btn.disabled = isLoading;
    btn.textContent = text;
  }
});
