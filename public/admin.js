// ===== STATE =====
let allOrders = [];
let allContacts = [];
let allProducts = [];
let currentFilter = 'all';
let isAuthenticated = false;

// ===== AUTH =====
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('visible');
}

function hideLoginError() {
    loginError.classList.remove('visible');
}

function showDashboard(username) {
    isAuthenticated = true;
    loginOverlay.classList.add('hidden');
    document.getElementById('admin-username-display').textContent = username || 'Admin';
}

function showLogin() {
    isAuthenticated = false;
    loginOverlay.classList.remove('hidden');
}

// Check session on page load
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/check', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
            showDashboard(data.username);
            fetchOrders();
            fetchContacts();
            fetchProducts();
        } else {
            showLogin();
        }
    } catch (err) {
        showLogin();
    }
}

// Login form submit
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showDashboard(data.username);
            fetchOrders();
            fetchContacts();
            fetchProducts();
        } else {
            showLoginError(data.error || 'Login failed.');
        }
    } catch (err) {
        showLoginError('Network error. Is the server running?');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
});

// Logout
async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    showLogin();
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    hideLoginError();
    // Clear data
    allOrders = [];
    allContacts = [];
    allProducts = [];
    updateStats();
}

// Utility: handle 401 in any fetch
async function authFetch(url, options = {}) {
    options.credentials = 'include';
    const res = await fetch(url, options);
    if (res.status === 401) {
        showLogin();
        throw new Error('Session expired');
    }
    return res;
}
// ===== SIDEBAR & TABS =====
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const mobileToggle = document.getElementById('mobile-toggle');

mobileToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
});
overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
});

function switchTab(tabId) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabId}-panel`).classList.add('active');

    // Update topbar title
    document.getElementById('topbar-title').textContent =
        tabId === 'orders' ? 'Orders' : (tabId === 'contacts' ? 'Messages' : 'Products');

    // Close mobile sidebar
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
}

// ===== DATA FETCHING =====
async function fetchOrders() {
    try {
        const res = await authFetch('/api/admin/orders');
        const data = await res.json();
        allOrders = data.orders || [];
        updateStats();
        renderOrders();
    } catch (err) {
        document.getElementById('orders-list').innerHTML =
            '<div class="empty-state"><p>Error loading orders. Is the server running?</p></div>';
    }
}

async function fetchContacts() {
    try {
        const res = await authFetch('/api/admin/contacts');
        const data = await res.json();
        allContacts = data.contacts || [];
        updateStats();
        renderContacts();
    } catch (err) {
        document.getElementById('contacts-list').innerHTML =
            '<div class="empty-state"><p>Error loading messages.</p></div>';
    }
}

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        const data = await res.json();
        allProducts = data.products || [];
        updateStats();
        renderProducts();
    } catch (err) {
        document.getElementById('products-list-admin').innerHTML =
            '<div class="empty-state"><p>Error loading products.</p></div>';
    }
}

// ===== STATS =====
function updateStats() {
    const totalOrders = allOrders.length;
    const pending = allOrders.filter(o => o.status === 'pending').length;
    const completedRevenue = allOrders
        .filter(o => o.status === 'completed')
        .reduce((s, o) => s + (o.total_amount || 0), 0);

    document.getElementById('stat-total-orders').textContent = totalOrders;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-revenue').textContent = `₹${completedRevenue.toLocaleString()}`;
    document.getElementById('stat-messages').textContent = allContacts.length;
    document.getElementById('orders-count-badge').textContent = totalOrders;
    document.getElementById('contacts-count-badge').textContent = allContacts.length;
    document.getElementById('products-count-badge').textContent = allProducts.length;
}

// ===== RENDER ORDERS =====
function renderOrders() {
    const container = document.getElementById('orders-list');
    const filtered = currentFilter === 'all'
        ? allOrders
        : allOrders.filter(o => o.status === currentFilter);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                <p>${currentFilter === 'all' ? 'No orders yet.' : `No ${currentFilter} orders.`}</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(o => {
        const date = new Date(o.created_at);
        const dateStr = date.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit'
        });

        const itemsHTML = (o.items && Array.isArray(o.items) && o.items.length > 0 && o.items[0].product_name)
            ? o.items.filter(i => i && i.product_name).map(i => `
                <div class="order-item-row">
                    <span class="order-item-name">${i.product_name}</span>
                    <span class="order-item-qty">×${i.quantity}</span>
                    <span class="order-item-price">₹${(i.price * i.quantity).toLocaleString()}</span>
                </div>
            `).join('')
            : '<div style="color:var(--text-muted);font-size:0.85rem;">No items</div>';

        return `
            <div class="order-card">
                <div class="order-card-top">
                    <span class="order-id">#${String(o.id).padStart(4, '0')}</span>
                    <span class="order-date">${dateStr} · ${timeStr}</span>
                    <span class="order-total">₹${(o.total_amount || 0).toLocaleString()}</span>
                    <select onchange="updateOrderStatus(${o.id}, this.value)"
                            class="order-status-select ${o.status}">
                        <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>
                <div class="order-card-body">
                    <div class="order-detail-block">
                        <div class="order-detail-label">Customer</div>
                        <div class="order-detail-value">
                            <strong>${o.customer_name}</strong><br>
                            <a href="mailto:${o.customer_email}">${o.customer_email}</a>
                        </div>
                    </div>
                    <div class="order-detail-block">
                        <div class="order-detail-label">Delivery Address</div>
                        <div class="order-address">${o.customer_address}</div>
                    </div>
                    <div class="order-detail-block">
                        <div class="order-detail-label">Items Ordered</div>
                        <div class="order-detail-value">${itemsHTML}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== FILTER ORDERS =====
function filterOrders(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderOrders();
}

// ===== RENDER CONTACTS =====
function renderContacts() {
    const container = document.getElementById('contacts-list');

    if (allContacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <p>No messages yet.</p>
            </div>`;
        return;
    }

    container.innerHTML = allContacts.map(c => {
        const date = new Date(c.created_at);
        const dateStr = date.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit'
        });
        const initials = c.name.charAt(0).toUpperCase();

        return `
            <div class="contact-card">
                <div class="contact-card-header">
                    <div class="contact-person">
                        <div class="contact-avatar">${initials}</div>
                        <div>
                            <div class="contact-name">${c.name}</div>
                            <div class="contact-email">${c.email}</div>
                        </div>
                    </div>
                    <span class="contact-date">${dateStr} · ${timeStr}</span>
                </div>
                <div class="contact-message">${c.message}</div>
            </div>
        `;
    }).join('');
}

// ===== RENDER PRODUCTS (ADMIN) =====
// ===== RENDER PRODUCTS (ADMIN) =====
function renderProducts() {
    const container = document.getElementById('products-list-admin');
    if (!container) return;

    if (allProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                <p>No products found.</p>
            </div>`;
        return;
    }

    container.innerHTML = allProducts.map(p => {
        // Stock status badge
        let stockClass = 'instock';
        let stockText = `In Stock (${p.stock})`;
        if (p.stock <= 0) {
            stockClass = 'outofstock';
            stockText = 'Out of Stock';
        } else if (p.stock <= 15) {
            stockClass = 'lowstock';
            stockText = `Low Stock (${p.stock})`;
        }

        const badgeHtml = p.badge ? `<span style="background:var(--green);color:white;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:600;display:inline-block;">${p.badge}</span>` : '';

        return `
            <div class="admin-product-card" id="admin-product-card-${p.id}">
                <img src="../${p.image}" class="admin-product-img" alt="${p.name}" onerror="this.src='https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=80&w=400'">
                <div class="admin-product-info">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                        <span class="admin-product-name" style="margin-bottom:0;font-weight:600;font-size:1.15rem;font-family:var(--font-serif);">${p.name}</span>
                        ${badgeHtml}
                    </div>
                    <div class="admin-product-meta" style="margin-bottom:8px;">${p.origin} · per ${p.unit}</div>
                    
                    <div>
                        <span class="stock-badge ${stockClass}">${stockText}</span>
                    </div>

                    <div class="admin-product-edit-group" style="margin-top:8px;">
                        <span class="admin-product-price-label">₹${p.price}</span>
                        <button class="btn-edit-details" onclick="openEditModal(${p.id})">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            Edit Details
                        </button>
                        <button class="btn-delete-product" onclick="deleteProduct(${p.id})" title="Delete Product" style="margin-left:0;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== EDIT MODAL LOGIC =====
const editModal = document.getElementById('edit-product-modal');
const editForm = document.getElementById('edit-product-form');

function openEditModal(productId) {
    const p = allProducts.find(prod => prod.id === productId);
    if (!p) return;

    // Fill form fields
    document.getElementById('edit-product-id').value = p.id;
    document.getElementById('edit-product-name').value = p.name;
    document.getElementById('edit-product-origin').value = p.origin;
    document.getElementById('edit-product-price').value = p.price;
    document.getElementById('edit-product-stock').value = p.stock !== undefined ? p.stock : 50;
    document.getElementById('edit-product-unit').value = p.unit;
    document.getElementById('edit-product-badge').value = p.badge || '';
    document.getElementById('edit-product-desc').value = p.desc;
    
    // Preview current photo
    document.getElementById('edit-product-photo-preview').src = `../${p.image}`;
    
    // Reset file input
    document.getElementById('edit-product-photo').value = '';

    // Open overlay
    editModal.classList.add('open');
}

function closeEditModal() {
    if (editModal) {
        editModal.classList.remove('open');
    }
}

// Handle product updates via Edit Form
if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('edit-product-id').value;
        const formData = new FormData(editForm);
        
        const submitBtn = editForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving Changes...';

        try {
            const res = await authFetch(`/api/admin/products/${id}`, {
                method: 'PUT',
                body: formData
            });

            if (res.ok) {
                alert('Product details updated successfully!');
                closeEditModal();
                fetchProducts();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to update product.');
            }
        } catch (err) {
            alert('Network error. Failed to update product.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ===== UPDATE ORDER STATUS =====
async function updateOrderStatus(id, status) {
    try {
        const res = await authFetch(`/api/admin/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            fetchOrders();
        } else {
            alert('Failed to update status');
        }
    } catch (err) {
        alert('Network error');
    }
}

// ===== REFRESH =====
function refreshData() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('spinning');
    Promise.all([fetchOrders(), fetchContacts(), fetchProducts()]).finally(() => {
        setTimeout(() => btn.classList.remove('spinning'), 600);
    });
}

// ===== DELETE PRODUCT =====
async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
        return;
    }

    try {
        const res = await authFetch(`/api/admin/products/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            alert('Product deleted successfully.');
            fetchProducts();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to delete product.');
        }
    } catch (err) {
        alert('Network error. Failed to delete product.');
    }
}

// ===== ADD NEW PRODUCT =====
const addProductForm = document.getElementById('add-product-form');
if (addProductForm) {
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(addProductForm);
        
        try {
            const res = await authFetch('/api/admin/products', {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                alert('Product added successfully!');
                addProductForm.reset();
                fetchProducts();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to add product.');
            }
        } catch (err) {
            alert('Network error. Failed to add product.');
        }
    });
}


// ===== INIT =====
checkAuth();
