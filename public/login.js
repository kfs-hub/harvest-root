document.addEventListener('DOMContentLoaded', () => {
  const errorBanner = document.getElementById('auth-error-banner');
  const googleBtn = document.getElementById('google-btn');

  const urlParams = new URLSearchParams(window.location.search);
  const redirectDest = urlParams.get('redirect') || '/';
  const errorCode = urlParams.get('error');

  // Handle errors from Google OAuth callback
  if (errorCode === 'google_failed') {
    errorBanner.textContent = 'Google authentication failed. Please try again.';
    errorBanner.classList.add('visible');
  }

  // Append redirect param to Google OAuth URL if needed
  if (redirectDest && redirectDest !== '/') {
    googleBtn.href = `/api/auth/google?redirect=${encodeURIComponent(redirectDest)}`;
  }
});
