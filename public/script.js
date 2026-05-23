// ===== PRODUCT DATA =====
const products = [
  { id: 1, name: "Black Pepper", origin: "Coorg Estate", desc: "Bold, aromatic Tellicherry-grade peppercorns. Sun-dried for maximum pungency.", price: 350, unit: "250g", badge: "Bestseller", image: "images/black-pepper.png" },
  { id: 2, name: "Cloves", origin: "Coorg Hills", desc: "Intensely fragrant whole cloves, hand-sorted for premium quality.", price: 420, unit: "100g", badge: "Premium", image: "images/clove2.webp" },
  { id: 3, name: "Green Cardamom", origin: "Western Ghats", desc: "Plump, green pods bursting with sweet, floral aroma. Perfect for chai and desserts.", price: 580, unit: "100g", badge: "Popular", image: "images/cardomom.webp" },
  { id: 4, name: "Cinnamon Sticks", origin: "Coorg Plantation", desc: "True Ceylon-style cinnamon with delicate sweetness. Rolled by hand.", price: 310, unit: "100g", badge: "", image: "images/Cinnamon_1.webp" },
  { id: 5, name: "Star Anise", origin: "Spice Valley", desc: "Whole star anise with rich licorice notes. Essential for biryanis and stews.", price: 390, unit: "100g", badge: "", image: "images/Star Anise.jpg" },
  { id: 6, name: "Turmeric Powder", origin: "Coorg Organic Farm", desc: "Deep golden turmeric with high curcumin content. Stone-ground fresh.", price: 180, unit: "250g", badge: "Organic", image: "images/turmaric.webp" }
];

let cart = JSON.parse(localStorage.getItem('harvestRootCart')) || [];

// ===== RENDER PRODUCTS =====
function renderProducts() {
  const grid = document.getElementById('products-grid');
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
          <div class="product-price">₹${p.price} <span>/ ${p.unit}</span></div>
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
          <p class="cart-item-price">₹${item.price} / ${item.unit}</p>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="changeQty(${item.id},-1)">−</button>
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

// Close mobile menu on link click
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// Active link on scroll
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
    const res = await fetch('api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      showToast('Message sent! We\'ll get back to you soon.');
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
  window.location.href = 'checkout.html';
});

// ===== INIT =====
renderProducts();
updateCart();
