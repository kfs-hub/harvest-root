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
  grid.innerHTML = products.map((p, i) => {
    const isOutOfStock = p.stock <= 0;
    const isLowStock = p.stock > 0 && p.stock <= 10;
    
    let badgeHtml = '';
    if (isOutOfStock) {
      badgeHtml = `<span class="product-badge out-of-stock" style="background:#c0392b;color:white;">Out of Stock</span>`;
    } else if (p.badge) {
      badgeHtml = `<span class="product-badge">${p.badge}</span>`;
    }

    let stockWarningHtml = '';
    if (isLowStock) {
      stockWarningHtml = `<p class="stock-warning" style="color:#e67e22;font-size:0.75rem;font-weight:600;margin-bottom:8px;margin-top:4px;display:flex;align-items:center;gap:4px;">⚠️ Only ${p.stock} left in stock!</p>`;
    } else if (isOutOfStock) {
      stockWarningHtml = `<p class="stock-warning" style="color:#c0392b;font-size:0.75rem;font-weight:600;margin-bottom:8px;margin-top:4px;display:flex;align-items:center;gap:4px;">❌ Temporarily Sold Out</p>`;
    } else {
      stockWarningHtml = `<p class="stock-warning" style="color:#27ae60;font-size:0.75rem;font-weight:600;margin-bottom:8px;margin-top:4px;display:flex;align-items:center;gap:4px;">✓ In Stock</p>`;
    }

    let btnHtml = '';
    if (isOutOfStock) {
      btnHtml = `<button class="add-to-cart-btn out-of-stock" disabled style="background:#e4d8c9;color:#8c7e6c;cursor:not-allowed;box-shadow:none;border:1px solid #d1c7bd;">Sold Out</button>`;
    } else {
      btnHtml = `<button class="add-to-cart-btn" data-id="${p.id}" onclick="addToCart(${p.id})">Add to Cart</button>`;
    }

    return `
      <div class="product-card" data-animate="fade-up" data-delay="${i * 100}" style="${isOutOfStock ? 'opacity: 0.85;' : ''}">
        <div class="product-image" style="${isOutOfStock ? 'filter: grayscale(0.4);' : ''}">
          <img src="${p.image}" alt="${p.name}" loading="lazy">
          ${badgeHtml}
        </div>
        <div class="product-info" style="display:flex; flex-direction:column;">
          <h3 class="product-name">${p.name}</h3>
          <p class="product-origin">${p.origin}</p>
          <p class="product-desc">${p.desc}</p>
          <div class="product-footer-container" style="margin-top:auto; width:100%;">
            ${stockWarningHtml}
            <div class="product-footer" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
              <div class="product-price">&#8377;${p.price} <span>/ ${p.unit}</span></div>
              ${btnHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  initAnimations();
}

// ===== CART =====
function addToCart(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const existing = cart.find(item => item.id === id);
  const currentQty = existing ? existing.qty : 0;

  // Enforce stock check
  if (currentQty + 1 > product.stock) {
    showToast(`Sorry, only ${product.stock} units of ${product.name} are available.`);
    return;
  }

  if (existing) { 
    existing.qty++; 
  } else { 
    cart.push({ ...product, qty: 1 }); 
  }
  updateCart();
  showToast(`${product.name} added to cart!`);
  const btn = document.querySelector(`.add-to-cart-btn[data-id="${id}"]`);
  if (btn) { 
    btn.classList.add('added'); 
    btn.textContent = '✓ Added'; 
    setTimeout(() => { 
      btn.classList.remove('added'); 
      btn.textContent = 'Add to Cart'; 
    }, 1500); 
  }
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  updateCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;

  // Enforce stock check when incrementing quantity in the cart
  const product = products.find(p => p.id === id);
  if (product && delta > 0 && item.qty + delta > product.stock) {
    showToast(`Sorry, only ${product.stock} units of ${product.name} are available in stock.`);
    return;
  }

  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  updateCart();
}

function updateCart() {
  localStorage.setItem('harvestRootCart', JSON.stringify(cart));

  const countEl       = document.getElementById('cart-count');
  const itemsEl       = document.getElementById('cart-items');
  const footerEl      = document.getElementById('cart-footer');
  const emptyEl       = document.getElementById('cart-empty');
  const totalEl       = document.getElementById('cart-total-amount');
  const itemCountEl   = document.getElementById('cart-item-count');
  const savingsEl     = document.getElementById('cart-savings');
  const savingsTxtEl  = document.getElementById('cart-savings-text');
  const shippingBar   = document.getElementById('cart-shipping-bar');
  const shippingFill  = document.getElementById('shipping-bar-fill');
  const shippingMsg   = document.getElementById('shipping-bar-msg');
  const shippingLeft  = document.getElementById('shipping-amount-left');

  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Navbar badge
  countEl.textContent = totalItems;
  countEl.classList.toggle('show', totalItems > 0);

  // Item count label
  if (itemCountEl) {
    itemCountEl.textContent = totalItems === 0 ? '0 items'
      : totalItems === 1 ? '1 item' : `${totalItems} items`;
  }

  // Free shipping bar (threshold ₹500)
  const FREE_SHIPPING = 500;
  if (cart.length > 0 && shippingBar) {
    shippingBar.classList.add('visible');
    const pct = Math.min((totalPrice / FREE_SHIPPING) * 100, 100);
    shippingFill.style.width = pct + '%';
    const left = Math.max(FREE_SHIPPING - totalPrice, 0);
    if (left === 0) {
      shippingMsg.innerHTML = `<strong>✓ You've unlocked free shipping!</strong>`;
      shippingFill.style.background = 'var(--green)';
    } else {
      shippingLeft.textContent = `₹${left.toLocaleString()}`;
      shippingMsg.innerHTML = `Add <strong id="shipping-amount-left">₹${left.toLocaleString()}</strong> more for free shipping!`;
    }
  } else if (shippingBar) {
    shippingBar.classList.remove('visible');
  }

  if (cart.length === 0) {
    emptyEl.style.display = 'flex';
    footerEl.style.display = 'none';
    itemsEl.querySelectorAll('.cart-item').forEach(el => el.remove());
    return;
  }

  emptyEl.style.display = 'none';
  footerEl.style.display = 'block';
  totalEl.textContent = `₹${totalPrice.toLocaleString()}`;

  // Savings (if any item has originalPrice)
  const savedTotal = cart.reduce((s, i) => {
    return s + ((i.originalPrice ? (i.originalPrice - i.price) : 0) * i.qty);
  }, 0);
  if (savingsEl) {
    if (savedTotal > 0) {
      savingsEl.style.display = 'flex';
      savingsTxtEl.textContent = `You're saving ₹${savedTotal.toLocaleString()}!`;
    } else {
      savingsEl.style.display = 'none';
    }
  }

  // Rebuild items
  itemsEl.querySelectorAll('.cart-item').forEach(el => el.remove());
  const fragment = document.createDocumentFragment();
  cart.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.dataset.id = item.id;
    div.style.animationDelay = `${idx * 55}ms`;
    div.innerHTML = `
      <div class="cart-item-image">
        <img src="${item.image}" alt="${item.name}" loading="lazy">
      </div>
      <div class="cart-item-info">
        <div class="cart-item-top">
          <div>
            <p class="cart-item-name">${item.name}</p>
            <p class="cart-item-unit">per ${item.unit}</p>
          </div>
          <button class="cart-item-remove" data-remove="${item.id}" aria-label="Remove ${item.name}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cart-item-controls">
          <div class="qty-stepper">
            <button class="qty-btn" data-qty="${item.id}" data-delta="-1">−</button>
            <span class="cart-item-qty">${item.qty}</span>
            <button class="qty-btn" data-qty="${item.id}" data-delta="1">+</button>
          </div>
          <span class="cart-item-line-price">₹${(item.price * item.qty).toLocaleString()}</span>
        </div>
      </div>
    `;
    fragment.appendChild(div);
  });
  // Insert items right after the empty state element
  emptyEl.parentNode.insertBefore(fragment, emptyEl.nextSibling);
}

// ===== CART SIDEBAR =====
const cartBtn     = document.getElementById('cart-btn');
const cartSidebar = document.getElementById('cart-sidebar');
const cartOverlay = document.getElementById('cart-overlay');
const cartClose   = document.getElementById('cart-close');
const cartShopLink = document.getElementById('cart-shop-link');

function openCart()  { cartSidebar.classList.add('open'); cartOverlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { cartSidebar.classList.remove('open'); cartOverlay.classList.remove('open'); document.body.style.overflow = ''; }

cartBtn.addEventListener('click', openCart);
cartOverlay.addEventListener('click', closeCart);
cartClose.addEventListener('click', closeCart);
if (cartShopLink) cartShopLink.addEventListener('click', closeCart);

// Event delegation for qty + remove buttons
document.getElementById('cart-items').addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove]');
  const qtyBtn    = e.target.closest('[data-qty]');

  if (removeBtn) {
    const id = parseInt(removeBtn.dataset.remove);
    const itemEl = removeBtn.closest('.cart-item');
    if (itemEl) {
      itemEl.classList.add('removing');
      itemEl.addEventListener('animationend', () => { removeFromCart(id); }, { once: true });
    } else {
      removeFromCart(id);
    }
  }

  if (qtyBtn) {
    const id    = parseInt(qtyBtn.dataset.qty);
    const delta = parseInt(qtyBtn.dataset.delta);
    changeQty(id, delta);
  }
});

// Clear cart button
document.getElementById('cart-clear-btn').addEventListener('click', () => {
  if (!confirm('Remove all items from your cart?')) return;
  cart = [];
  updateCart();
  showToast('Cart cleared.');
});

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
// ===== NAVBAR SCROLL INTERACTION + PROGRESS BAR =====
document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');

  const handleScroll = () => {
    const scrollY = window.scrollY;

    // Scrolled class for glass effect
    navbar.classList.toggle('scrolled', scrollY > 40);

    // Scroll progress bar (CSS custom property)
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
    navbar.style.setProperty('--scroll-progress', `${progress}%`);
  };

  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
});

// ===== SCROLL ANIMATIONS =====
function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.delay || 0);
        setTimeout(() => entry.target.classList.add('visible'), delay);

        // Stagger direct children if they have [data-animate] too
        const children = entry.target.querySelectorAll('[data-animate]');
        children.forEach((child, i) => {
          const childDelay = delay + (i * 80);
          setTimeout(() => child.classList.add('visible'), childDelay);
          observer.unobserve(child);
        });

        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-animate]').forEach(el => {
    // Don't re-observe already-visible elements
    if (!el.classList.contains('visible')) observer.observe(el);
  });
}

// ===== CONTACT FORM =====
(function initContactForm() {
  const form       = document.getElementById('contact-form');
  if (!form) return;

  const nameField  = document.getElementById('cf-name-field');
  const emailField = document.getElementById('cf-email-field');
  const msgField   = document.getElementById('cf-msg-field');
  const nameInput  = document.getElementById('cf-name');
  const emailInput = document.getElementById('cf-email');
  const msgInput   = document.getElementById('cf-message');
  const charCount  = document.getElementById('cf-char-count');
  const submitBtn  = document.getElementById('cf-submit');
  const progressFill = document.getElementById('form-progress-fill');
  const successEl  = document.getElementById('cf-success');
  const resetBtn   = document.getElementById('cf-reset');
  const chips      = document.querySelectorAll('.cf-chip');
  const inquiryInput = document.getElementById('cf-inquiry');

  // Progress: track how many of 3 fields are filled
  function updateProgress() {
    let filled = 0;
    if (nameInput.value.trim().length > 0)  filled++;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) filled++;
    if (msgInput.value.trim().length > 10) filled++;
    progressFill.style.width = Math.round((filled / 3) * 100) + '%';
  }

  // Validate a single field
  function validate(field, input, checkFn) {
    const ok = checkFn(input.value);
    field.classList.toggle('valid', ok);
    field.classList.toggle('error', !ok && input.value.length > 0);
    updateProgress();
    return ok;
  }

  const isName  = v => v.trim().length >= 2;
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isMsg   = v => v.trim().length >= 10;

  // Live validation
  nameInput.addEventListener('input',  () => validate(nameField,  nameInput,  isName));
  emailInput.addEventListener('input', () => validate(emailField, emailInput, isEmail));
  msgInput.addEventListener('input',   () => {
    validate(msgField, msgInput, isMsg);
    const len = msgInput.value.length;
    charCount.textContent = `${len} / 500`;
    charCount.classList.toggle('warn',  len > 400);
    charCount.classList.toggle('limit', len >= 500);
  });

  // Blur validation (show error only after leaving)
  nameInput.addEventListener('blur',  () => {
    if (!isName(nameInput.value) && nameInput.value.length > 0)
      nameField.classList.add('error');
  });
  emailInput.addEventListener('blur', () => {
    if (!isEmail(emailInput.value) && emailInput.value.length > 0)
      emailField.classList.add('error');
  });

  // Chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      inquiryInput.value = chip.dataset.chip;
    });
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameOk  = validate(nameField,  nameInput,  isName);
    const emailOk = validate(emailField, emailInput, isEmail);
    const msgOk   = validate(msgField,   msgInput,   isMsg);
    if (!nameOk)  { nameInput.focus(); return; }
    if (!emailOk) { emailInput.focus(); return; }
    if (!msgOk)   { msgInput.focus(); return; }

    submitBtn.classList.add('loading');

    const payload = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      message: msgInput.value.trim(),
      inquiry: inquiryInput.value
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        successEl.classList.add('show');
        progressFill.style.width = '100%';
      } else {
        showToast('Failed to send. Please try again.');
      }
    } catch {
      showToast('Network error. Please try again.');
    } finally {
      submitBtn.classList.remove('loading');
    }
  });

  // Reset back to form
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      successEl.classList.remove('show');
      form.reset();
      [nameField, emailField, msgField].forEach(f => f.classList.remove('valid','error'));
      charCount.textContent = '0 / 500';
      inquiryInput.value = 'General';
      chips.forEach((c, i) => c.classList.toggle('active', i === 0));
      progressFill.style.width = '0%';
    });
  }

  // Particle canvas
  const canvas = document.getElementById('contact-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], animId;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(Math.random() * 0.4 + 0.1),
      alpha: Math.random() * 0.5 + 0.1,
      flicker: Math.random() * Math.PI * 2
    };
  }

  for (let i = 0; i < 90; i++) particles.push(mkParticle());

  function tick() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p, i) => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.flicker += 0.03;
      const a = p.alpha * (0.7 + 0.3 * Math.sin(p.flicker));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(196,148,58,${a})`;
      ctx.fill();

      if (p.y < -5 || p.x < -5 || p.x > W + 5) particles[i] = mkParticle();
    });
    animId = requestAnimationFrame(tick);
  }

  // Only run canvas when section is visible
  const sectionObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { tick(); }
    else { cancelAnimationFrame(animId); }
  }, { threshold: 0.05 });
  sectionObserver.observe(document.getElementById('contact'));

})();

// ===== CHECKOUT =====
document.getElementById('checkout-btn').addEventListener('click', () => {
  if (cart.length === 0) {
    alert('Please add items to cart before proceeding to checkout.');
    return;
  }
  // Require user login before checkout
  if (!currentUser) {
    closeCart();
    window.location.href = 'login.html?redirect=checkout.html';
    return;
  }
  window.location.href = 'checkout.html';
});

// ===== USER AUTH =====
let currentUser = null;

const navSigninBtn = document.getElementById('nav-signin-btn');
const userProfileDropdown = document.getElementById('user-profile-dropdown');
const userAvatarBtn = document.getElementById('user-avatar-btn');
const userAvatarImg = document.getElementById('user-avatar-img');
const userDropdownMenu = document.getElementById('user-dropdown-menu');
const userDropdownName = document.getElementById('user-dropdown-name');
const userDropdownEmail = document.getElementById('user-dropdown-email');
const navLogoutBtn = document.getElementById('nav-logout-btn');

function updateUserUI() {
  if (currentUser) {
    if (navSigninBtn) navSigninBtn.style.display = 'none';
    if (userProfileDropdown) userProfileDropdown.style.display = 'inline-block';
    
    if (userDropdownName) userDropdownName.textContent = currentUser.name;
    if (userDropdownEmail) userDropdownEmail.textContent = currentUser.email;
    
    if (userAvatarImg) {
      if (currentUser.avatar) {
        userAvatarImg.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.name}">`;
      } else {
        userAvatarImg.textContent = currentUser.name.charAt(0).toUpperCase();
      }
    }
  } else {
    if (navSigninBtn) navSigninBtn.style.display = 'inline-block';
    if (userProfileDropdown) userProfileDropdown.style.display = 'none';
    if (userDropdownMenu) userDropdownMenu.classList.remove('show');
  }
}

// Toggle Dropdown Menu
if (userAvatarBtn) {
  userAvatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (userDropdownMenu) userDropdownMenu.classList.toggle('show');
  });
}

// Close Dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (userDropdownMenu && !userDropdownMenu.contains(e.target) && e.target !== userAvatarBtn && !userAvatarBtn.contains(e.target)) {
    userDropdownMenu.classList.remove('show');
  }
});

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

// Logout
if (navLogoutBtn) {
  navLogoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/user/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    currentUser = null;
    updateUserUI();
    showToast('You have been signed out.');
  });
}

// ===== INIT =====
fetchProducts();
updateCart();
checkUserSession();
