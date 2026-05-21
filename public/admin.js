// ===== STATE =====
let allOrders = [];
let allContacts = [];
let currentFilter = 'all';

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
        tabId === 'orders' ? 'Orders' : 'Messages';

    // Close mobile sidebar
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
}

// ===== DATA FETCHING =====
async function fetchOrders() {
    try {
        const res = await fetch('/api/admin/orders');
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
        const res = await fetch('/api/admin/contacts');
        const data = await res.json();
        allContacts = data.contacts || [];
        updateStats();
        renderContacts();
    } catch (err) {
        document.getElementById('contacts-list').innerHTML =
            '<div class="empty-state"><p>Error loading messages.</p></div>';
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

        const itemsHTML = (o.items && o.items[0] && o.items[0].product_name)
            ? o.items.map(i => `
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

// ===== UPDATE ORDER STATUS =====
async function updateOrderStatus(id, status) {
    try {
        const res = await fetch(`/api/admin/orders/${id}/status`, {
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
    Promise.all([fetchOrders(), fetchContacts()]).finally(() => {
        setTimeout(() => btn.classList.remove('spinning'), 600);
    });
}

// ===== INIT =====
fetchOrders();
fetchContacts();
