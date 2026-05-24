// ===== PRODUCT DATA =====
let products = [];
let cart = JSON.parse(localStorage.getItem('harvestRootCart')) || [];

// ===== FETCH PRODUCTS FROM API =====
async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    products = data.products || [];
    renderProducts();
  } catch (err) {
    console.error('Error fetching products:', err);
    const grid = document.getElementById('products-grid');
    if (grid) {
      grid.innerHTML = '<div class="empty-state"><p>Error loading products. Please try again later.</p></div>';
    }
  }
}

// ===== RENDER PRODUCTS =====
function renderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = products.map((p, i) => `
    <div class="product-card" data-animate="fade-up" data-delay="${i * 100}">
      <div class="product-image">
        <img src="${p.image}" alt="${p.name}" loading="lazy">
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      </div>
      <div class="product-info">
        <h3 class="product-name">${p.name}</h3>
        <p class="product-origin">${p.origin}</p>
        <p class="product-desc">${p.desc}</p>
        <div class="product-footer">
          <div class="product-price">&#8377;${p.price} <span>/ ${p.unit}</span></div>
          <button class="add-to-cart-btn" data-id="${p.id}" onclick="addToCart(${p.id})">Add to Cart</button>
        </div>
      </div>
    </div>
  `).join('');
  initAnimations();
}

// ===== CART =====
function addToCart(id) {
  const product = products.find(p => p.id === id);
  const existing = cart.find(item => item.id === id);
  if (existing) { existing.qty++; } else { cart.push({ ...product, qty: 1 }); }
  updateCart();
  showToast(`${product.name} added to cart!`);
  const btn = document.querySelector(`.add-to-cart-btn[data-id="${id}"]`);
  if (btn) { btn.classList.add('added'); btn.textContent = '✓ Added'; setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'Add to Cart'; }, 1500); }
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  updateCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  updateCart();
}

function updateCart() {
  localStorage.setItem('harvestRootCart', JSON.stringify(cart));
  const countEl = document.getElementById('cart-count');
  const itemsEl = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  const emptyEl = document.getElementById('cart-empty');
  const totalEl = document.getElementById('cart-total-amount');
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);

  countEl.textContent = totalItems;
  countEl.classList.toggle('show', totalItems > 0);

  if (cart.length === 0) {
    emptyEl.style.display = 'block';
    footerEl.style.display = 'none';
    itemsEl.querySelectorAll('.cart-item').forEach(el => el.remove());
  } else {
    emptyEl.style.display = 'none';
    footerEl.style.display = 'block';
    totalEl.textContent = `₹${totalPrice.toLocaleString()}`;
    const itemsHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-image"><img src="${item.image}" alt="${item.name}"></div>
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-price">&#8377;${item.price} / ${item.unit}</p>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="changeQty(${item.id},-1)">&#8722;</button>
            <span class="cart-item-qty">${item.qty}</span>
            <button class="qty-btn" onclick="changeQty(${item.id},1)">+</button>
            <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Remove</button>
          </div>
        </div>
      </div>
    `).join('');
    const existingItems = itemsEl.querySelectorAll('.cart-item');
    existingItems.forEach(el => el.remove());
    emptyEl.insertAdjacentHTML('afterend', itemsHTML);
  }
}

// ===== CART SIDEBAR =====
const cartBtn = document.getElementById('cart-btn');
const cartSidebar = document.getElementById('cart-sidebar');
const cartOverlay = document.getElementById('cart-overlay');
const cartClose = document.getElementById('cart-close');
const cartShopLink = document.getElementById('cart-shop-link');

function openCart() { cartSidebar.classList.add('open'); cartOverlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { cartSidebar.classList.remove('open'); cartOverlay.classList.remove('open'); document.body.style.overflow = ''; }

cartBtn.addEventListener('click', openCart);
cartOverlay.addEventListener('click', closeCart);
cartClose.addEventListener('click', closeCart);
cartShopLink.addEventListener('click', () => { closeCart(); });

// ===== TOAST =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  toastMsg.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== NAVBAR =====
const navbar = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navLinks.classList.toggle('open');
});

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

const sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY + 200;
  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');
    const link = document.querySelector(`.nav-link[href="#${id}"]`);
    if (link) { link.classList.toggle('active', scrollY >= top && scrollY < top + height); }
  });
});

// ===== SCROLL ANIMATIONS =====
function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => entry.target.classList.add('visible'), parseInt(delay));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
}

// ===== CONTACT FORM =====
document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      showToast("Message sent! We'll get back to you soon.");
      e.target.reset();
    } else {
      showToast('Failed to send message. Please try again.');
    }
  } catch (err) {
    showToast('Network error. Please try again.');
  }
});

// ===== CHECKOUT =====
document.getElementById('checkout-btn').addEventListener('click', () => {
  if (cart.length === 0) {
    alert('Please add items to cart before proceeding to checkout.');
    return;
  }
  // Require user login before checkout
  if (!currentUser) {
    closeCart();
    pendingCheckout = true;
    openAuthModal();
    showToast('Please sign in or create an account to place your order.');
    return;
  }
  window.location.href = 'checkout.html';
});

// ===== USER AUTH =====
let currentUser = null;
let pendingCheckout = false;

const authOverlay = document.getElementById('auth-overlay');
const authClose = document.getElementById('auth-close');
const authLoginView = document.getElementById('auth-login-view');
const authRegisterView = document.getElementById('auth-register-view');
const authOtpView = document.getElementById('auth-otp-view');
const authProfileView = document.getElementById('auth-profile-view');
const userBtn = document.getElementById('user-btn');
const userBadge = document.getElementById('user-name-badge');

function openAuthModal() {
  authOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  authOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

function showAuthView(view) {
  authLoginView.style.display = 'none';
  authRegisterView.style.display = 'none';
  authOtpView.style.display = 'none';
  authProfileView.style.display = 'none';
  // Clear errors
  document.querySelectorAll('.auth-error').forEach(el => { el.classList.remove('visible'); el.textContent = ''; });
  if (view === 'login') authLoginView.style.display = 'block';
  else if (view === 'register') authRegisterView.style.display = 'block';
  else if (view === 'otp') authOtpView.style.display = 'block';
  else if (view === 'profile') authProfileView.style.display = 'block';
}

function updateUserUI() {
  if (currentUser) {
    userBadge.textContent = currentUser.name.charAt(0).toUpperCase();
    userBadge.style.display = 'inline-flex';
    userBtn.style.color = 'var(--green)';
    // Update profile view
    document.getElementById('auth-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('auth-profile-name').textContent = currentUser.name;
    document.getElementById('auth-profile-email').textContent = currentUser.email;
  } else {
    userBadge.style.display = 'none';
    userBtn.style.color = '';
  }
}

// Check user session on page load
async function checkUserSession() {
  try {
    const res = await fetch('/api/user/check', { credentials: 'include' });
    const data = await res.json();
    if (data.authenticated) {
      currentUser = data.user;
      updateUserUI();
    }
  } catch (err) { /* not logged in */ }
}

// User button click
userBtn.addEventListener('click', () => {
  if (currentUser) {
    showAuthView('profile');
  } else {
    showAuthView('login');
  }
  openAuthModal();
});

// Close modal
authClose.addEventListener('click', closeAuthModal);
authOverlay.addEventListener('click', (e) => {
  if (e.target === authOverlay) closeAuthModal();
});

// Toggle between login and register
document.getElementById('show-register').addEventListener('click', (e) => {
  e.preventDefault();
  showAuthView('register');
});
document.getElementById('show-login').addEventListener('click', (e) => {
  e.preventDefault();
  showAuthView('login');
});

// Login form
document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('auth-login-error');
  const btn = document.getElementById('auth-login-btn');
  errorEl.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const email = document.getElementById('auth-login-email').value;
  const password = document.getElementById('auth-login-password').value;

  try {
    const res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser = data.user;
      updateUserUI();
      closeAuthModal();
      showToast(`Welcome back, ${currentUser.name}!`);
      if (pendingCheckout) {
        pendingCheckout = false;
        window.location.href = 'checkout.html';
      }
    } else {
      errorEl.textContent = data.error || 'Login failed.';
      errorEl.classList.add('visible');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// Register form
document.getElementById('auth-register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('auth-register-error');
  const btn = document.getElementById('auth-register-btn');
  errorEl.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Sending code...';

  const name = document.getElementById('auth-reg-name').value;
  const email = document.getElementById('auth-reg-email').value;
  const password = document.getElementById('auth-reg-password').value;

  try {
    const res = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById('auth-otp-instructions').textContent = `We sent a 6-digit code to ${email}`;
      document.getElementById('auth-otp-code').value = '';
      showAuthView('otp');
      showToast('Verification code sent! Please check your inbox.');
    } else {
      errorEl.textContent = data.error || 'Registration failed.';
      errorEl.classList.add('visible');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

// Cancel OTP / Go back
document.getElementById('cancel-otp').addEventListener('click', (e) => {
  e.preventDefault();
  showAuthView('register');
});

// OTP verification form submit
document.getElementById('auth-otp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('auth-otp-error');
  const btn = document.getElementById('auth-otp-btn');
  errorEl.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  const code = document.getElementById('auth-otp-code').value.trim();

  try {
    const res = await fetch('/api/user/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser = data.user;
      updateUserUI();
      closeAuthModal();
      showToast(`Welcome to Harvest Root, ${currentUser.name}! 🌿`);
      if (pendingCheckout) {
        pendingCheckout = false;
        window.location.href = 'checkout.html';
      }
    } else {
      errorEl.textContent = data.error || 'Verification failed.';
      errorEl.classList.add('visible');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify Code';
  }
});

// Logout
document.getElementById('auth-logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/user/logout', { method: 'POST', credentials: 'include' });
  } catch (err) {}
  currentUser = null;
  updateUserUI();
  closeAuthModal();
  showToast('You have been signed out.');
});

// ===== INIT =====
fetchProducts();
updateCart();
checkUserSession();
