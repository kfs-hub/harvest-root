/* ===== HARVEST ROOT — LOGIN / SIGNUP / OTP / FORGOT PASSWORD ===== */

document.addEventListener('DOMContentLoaded', () => {

  // ── URL params ──────────────────────────────────────────────────────
  const urlParams   = new URLSearchParams(window.location.search);
  const redirectDest = urlParams.get('redirect') || '/';
  const errorCode   = urlParams.get('error');

  // ── Banners ──────────────────────────────────────────────────────────
  const errorBanner   = document.getElementById('auth-error-banner');
  const successBanner = document.getElementById('auth-success-banner');

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.add('visible');
    successBanner.classList.remove('visible');
  }
  function showSuccess(msg) {
    successBanner.textContent = msg;
    successBanner.classList.add('visible');
    errorBanner.classList.remove('visible');
  }
  function clearBanners() {
    errorBanner.classList.remove('visible');
    successBanner.classList.remove('visible');
  }

  // ── Handle Google OAuth error ────────────────────────────────────────
  if (errorCode === 'google_failed') {
    showError('Google sign-in failed. Please try again.');
  }

  // ── Google button redirect param ─────────────────────────────────────
  const googleBtn       = document.getElementById('google-btn');
  const googleBtnSignup = document.getElementById('google-btn-signup');
  if (redirectDest && redirectDest !== '/') {
    const suffix = `?redirect=${encodeURIComponent(redirectDest)}`;
    if (googleBtn)       googleBtn.href       = `/api/auth/google${suffix}`;
    if (googleBtnSignup) googleBtnSignup.href = `/api/auth/google${suffix}`;
  }

  // ── View switching ───────────────────────────────────────────────────
  const views = {
    signin: document.getElementById('signin-view'),
    signup: document.getElementById('signup-view'),
    otp:    document.getElementById('otp-view'),
    forgot: document.getElementById('forgot-view'),
  };

  function showView(name) {
    clearBanners();
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    // Focus first input of the new view
    const first = views[name] && views[name].querySelector('input');
    if (first) setTimeout(() => first.focus(), 50);
  }

  document.getElementById('goto-signup').addEventListener('click',  () => showView('signup'));
  document.getElementById('goto-signin').addEventListener('click',  () => showView('signin'));
  document.getElementById('goto-forgot').addEventListener('click',  () => showView('forgot'));
  document.getElementById('forgot-back-btn').addEventListener('click', () => showView('signin'));
  document.getElementById('otp-back-btn').addEventListener('click', () => showView('signup'));

  // ── Button loading helpers ───────────────────────────────────────────
  function setLoading(btn, loading) {
    const text    = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled  = loading;
    if (text)    text.style.display    = loading ? 'none'         : '';
    if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
  }

  // ── Password visibility toggles ──────────────────────────────────────
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input   = document.getElementById(btn.dataset.target);
      const isText  = input.type === 'text';
      input.type    = isText ? 'password' : 'text';
      btn.querySelector('.eye-open').style.display  = isText ? ''     : 'none';
      btn.querySelector('.eye-closed').style.display = isText ? 'none' : '';
    });
  });


  // ── Password strength meter ──────────────────────────────────────────
  const suPassword      = document.getElementById('su-password');
  const strengthFill    = document.getElementById('pw-strength-fill');
  const strengthLabel   = document.getElementById('pw-strength-label');

  const strengthLevels = [
    { label: '',        color: '',        width: '0%'   },
    { label: 'Weak',    color: '#c0392b', width: '25%'  },
    { label: 'Fair',    color: '#e67e22', width: '50%'  },
    { label: 'Good',    color: '#f1c40f', width: '75%'  },
    { label: 'Strong',  color: '#27ae60', width: '100%' },
  ];

  function getStrength(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw))   score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(Math.ceil(score / 1.25), 4);
  }

  if (suPassword) {
    suPassword.addEventListener('input', () => {
      const level = getStrength(suPassword.value);
      const s     = strengthLevels[level];
      strengthFill.style.width      = s.width;
      strengthFill.style.background = s.color;
      strengthLabel.textContent     = s.label;
      strengthLabel.style.color     = s.color;
    });
  }

  // ── OTP digit inputs helper ──────────────────────────────────────────
  function initOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const digits = Array.from(container.querySelectorAll('.otp-digit'));

    digits.forEach((input, idx) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (input.value) {
            input.value = '';
            input.classList.remove('filled');
          } else if (idx > 0) {
            digits[idx - 1].focus();
            digits[idx - 1].value = '';
            digits[idx - 1].classList.remove('filled');
          }
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          digits[idx - 1].focus();
        } else if (e.key === 'ArrowRight' && idx < digits.length - 1) {
          digits[idx + 1].focus();
        }
      });

      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        input.value = val ? val[0] : '';
        if (val) {
          input.classList.add('filled');
          if (idx < digits.length - 1) digits[idx + 1].focus();
        } else {
          input.classList.remove('filled');
        }
      });

      // Handle paste across all boxes
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
          .getData('text').replace(/\D/g, '').slice(0, digits.length);
        pasted.split('').forEach((ch, i) => {
          if (digits[idx + i]) {
            digits[idx + i].value = ch;
            digits[idx + i].classList.add('filled');
          }
        });
        const nextEmpty = digits.findIndex((d, i) => i >= idx && !d.value);
        if (nextEmpty !== -1) digits[nextEmpty].focus();
        else digits[digits.length - 1].focus();
      });
    });

    return {
      getValue: () => digits.map(d => d.value).join(''),
      clear:    () => digits.forEach(d => { d.value = ''; d.classList.remove('filled', 'error'); }),
      setError: () => digits.forEach(d => {
        d.classList.add('error');
        setTimeout(() => d.classList.remove('error'), 600);
      }),
    };
  }

  const otpControls = initOtpInputs('otp-inputs');
  const fpOtpControls = initOtpInputs('fp-otp-inputs');

  // ── Resend timer helper ───────────────────────────────────────────────
  function startResendTimer(btnId, timerId, seconds = 30) {
    const btn   = document.getElementById(btnId);
    const timer = document.getElementById(timerId);
    if (!btn || !timer) return;

    let remaining = seconds;
    btn.disabled  = true;
    timer.style.display = 'inline';
    timer.textContent   = `(${remaining}s)`;

    const interval = setInterval(() => {
      remaining--;
      timer.textContent = `(${remaining}s)`;
      if (remaining <= 0) {
        clearInterval(interval);
        btn.disabled        = false;
        timer.style.display = 'none';
      }
    }, 1000);
  }


  // ── State ─────────────────────────────────────────────────────────────
  let pendingEmail = '';  // email carried from signup → otp view
  let pendingName  = '';  // name carried from signup  → otp view
  let forgotEmail  = '';  // email carried from forgot email step → reset step

  // ════════════════════════════════════════════════════════════════════
  // SIGN IN
  // ════════════════════════════════════════════════════════════════════
  const signinForm = document.getElementById('signin-form');
  const signinBtn  = document.getElementById('signin-btn');

  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();

    const email    = document.getElementById('si-email').value.trim();
    const password = document.getElementById('si-password').value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    setLoading(signinBtn, true);
    try {
      const res  = await fetch('/api/user/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showSuccess('Signed in! Redirecting…');
        setTimeout(() => { window.location.href = redirectDest; }, 600);
      } else {
        showError(data.error || 'Sign in failed. Please try again.');
        setLoading(signinBtn, false);
      }
    } catch {
      showError('Network error. Please check your connection.');
      setLoading(signinBtn, false);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // SIGN UP
  // ════════════════════════════════════════════════════════════════════
  const signupForm = document.getElementById('signup-form');
  const signupBtn  = document.getElementById('signup-btn');

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();

    const name     = document.getElementById('su-name').value.trim();
    const email    = document.getElementById('su-email').value.trim();
    const password = document.getElementById('su-password').value;
    const confirm  = document.getElementById('su-confirm').value;

    // Client-side validation
    if (!name || name.length < 2) {
      showError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      showError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }

    setLoading(signupBtn, true);
    try {
      const res  = await fetch('/api/user/signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        pendingEmail = email;
        pendingName  = name;
        document.getElementById('otp-email-display').textContent = email;
        if (otpControls) otpControls.clear();
        showView('otp');
        startResendTimer('resend-otp-btn', 'resend-timer');
      } else {
        showError(data.error || 'Could not create account. Please try again.');
        setLoading(signupBtn, false);
      }
    } catch {
      showError('Network error. Please check your connection.');
      setLoading(signupBtn, false);
    }
  });


  // ════════════════════════════════════════════════════════════════════
  // OTP VERIFICATION (after signup)
  // ════════════════════════════════════════════════════════════════════
  const otpForm = document.getElementById('otp-form');
  const otpBtn  = document.getElementById('otp-btn');

  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();

    const otp = otpControls ? otpControls.getValue() : '';
    if (otp.length < 6) {
      showError('Please enter all 6 digits of your verification code.');
      if (otpControls) otpControls.setError();
      return;
    }

    setLoading(otpBtn, true);
    try {
      const res  = await fetch('/api/user/verify-and-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: pendingEmail, otp }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showSuccess('Email verified! Redirecting…');
        setTimeout(() => { window.location.href = redirectDest; }, 700);
      } else {
        showError(data.error || 'Invalid code. Please try again.');
        if (otpControls) otpControls.setError();
        setLoading(otpBtn, false);
      }
    } catch {
      showError('Network error. Please check your connection.');
      setLoading(otpBtn, false);
    }
  });

  // Resend OTP (signup)
  document.getElementById('resend-otp-btn').addEventListener('click', async () => {
    clearBanners();
    if (!pendingEmail) return;

    try {
      const res  = await fetch('/api/otp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, name: pendingName }),
      });
      const data = await res.json();
      if (res.ok) {
        showSuccess('A new code has been sent to your email.');
        if (otpControls) otpControls.clear();
        startResendTimer('resend-otp-btn', 'resend-timer');
      } else {
        showError(data.error || 'Could not resend code. Please try again.');
      }
    } catch {
      showError('Network error. Please try again.');
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD — Step 1: email
  // ════════════════════════════════════════════════════════════════════
  const forgotEmailForm = document.getElementById('forgot-email-form');
  const forgotEmailBtn  = document.getElementById('forgot-email-btn');

  forgotEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();

    const email = document.getElementById('fp-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    setLoading(forgotEmailBtn, true);
    try {
      const res  = await fetch('/api/user/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      // Always show success message (prevents email enumeration)
      forgotEmail = email;
      document.getElementById('fp-email-display').textContent = email;
      document.getElementById('forgot-step-email').style.display = 'none';
      document.getElementById('forgot-step-reset').style.display = 'block';
      if (fpOtpControls) fpOtpControls.clear();
      showSuccess(data.message || 'If an account exists, a reset code has been sent.');
      startResendTimer('fp-resend-btn', 'fp-resend-timer');
      setLoading(forgotEmailBtn, false);
    } catch {
      showError('Network error. Please try again.');
      setLoading(forgotEmailBtn, false);
    }
  });


  // ════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD — Step 2: OTP + new password
  // ════════════════════════════════════════════════════════════════════
  const forgotResetForm = document.getElementById('forgot-reset-form');
  const forgotResetBtn  = document.getElementById('forgot-reset-btn');

  forgotResetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();

    const otp         = fpOtpControls ? fpOtpControls.getValue() : '';
    const newPassword = document.getElementById('fp-newpw').value;

    if (otp.length < 6) {
      showError('Please enter all 6 digits of your reset code.');
      if (fpOtpControls) fpOtpControls.setError();
      return;
    }
    if (newPassword.length < 8) {
      showError('New password must be at least 8 characters.');
      return;
    }

    setLoading(forgotResetBtn, true);
    try {
      const res  = await fetch('/api/user/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp, newPassword }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Reset forgot-view back to email step for next time
        document.getElementById('forgot-step-email').style.display = 'block';
        document.getElementById('forgot-step-reset').style.display = 'none';
        document.getElementById('fp-email').value = '';
        if (fpOtpControls) fpOtpControls.clear();
        forgotEmail = '';

        // Switch to sign-in and show success
        showView('signin');
        showSuccess('Password reset! You can now sign in with your new password.');
        document.getElementById('si-email').value = forgotEmail || '';
      } else {
        showError(data.error || 'Reset failed. Please check your code and try again.');
        if (fpOtpControls) fpOtpControls.setError();
        setLoading(forgotResetBtn, false);
      }
    } catch {
      showError('Network error. Please try again.');
      setLoading(forgotResetBtn, false);
    }
  });

  // Resend code (forgot password)
  document.getElementById('fp-resend-btn').addEventListener('click', async () => {
    clearBanners();
    if (!forgotEmail) return;

    try {
      const res  = await fetch('/api/user/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      showSuccess(data.message || 'A new reset code has been sent.');
      if (fpOtpControls) fpOtpControls.clear();
      startResendTimer('fp-resend-btn', 'fp-resend-timer');
    } catch {
      showError('Network error. Please try again.');
    }
  });

}); // end DOMContentLoaded
