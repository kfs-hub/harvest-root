// ===== STATE =====
let allOrders = [];
let allProducts = [];
let currentFilter = 'all';
let isAuthenticated = false;

// Check session on page load
async function checkAuth() {
    try {
        const res = await fetch('/api/employee/check', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated && data.role === 'delivery') {
            isAuthenticated = true;
            document.getElementById('admin-username-display').textContent = data.username || 'Delivery Agent';
            fetchOrders();
            fetchProducts();
        } else if (data.authenticated) {
            // Wrong role
            window.location.href = 'employee-portal.html';
        } else {
            window.location.href = 'login-delivery.html';
        }
    } catch (err) {
        window.location.href = 'login-delivery.html';
    }
}

// Utility: handle 401 in any fetch
async function authFetch(url, options = {}) {
    options.credentials = 'include';
    const res = await fetch(url, options);
    if (res.status === 401) {
        window.location.href = 'login-delivery.html';
        throw new Error('Session expired');
    }
    return res;
}

// Sidebar toggle
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const mobileToggle = document.getElementById('mobile-toggle');

if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    });
}
if (overlay) {
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    });
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
        document.getElementById('orders-list-tbody').innerHTML =
            '<tr><td colspan="6" class="empty-state">Error loading orders. Is the server running?</td></tr>';
    }
}

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        const data = await res.json();
        allProducts = data.products || [];
    } catch (err) {
        console.error('Error loading products for modal:', err.message);
    }
}

// ===== STATS =====
function updateStats() {
    const totalOrders = allOrders.length;
    const pending = allOrders.filter(o => o.status === 'pending').length;
    const completed = allOrders.filter(o => o.status === 'completed').length;

    document.getElementById('stat-total-orders').textContent = totalOrders;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('orders-count-badge').textContent = totalOrders;
}

// ===== RENDER ORDERS =====
function renderOrders() {
    const tbody = document.getElementById('orders-list-tbody');
    if (!tbody) return;

    const filtered = currentFilter === 'all'
        ? allOrders
        : allOrders.filter(o => o.status === currentFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                        <p>${currentFilter === 'all' ? 'No shipments yet.' : `No ${currentFilter} shipments.`}</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(o => {
        const date = new Date(o.created_at);
        const dateStr = date.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit'
        });

        let statusBadgeClass = `status-badge ${o.status}`;
        
        return `
            <tr onclick="openOrderModal(${o.id})" class="clickable-row">
                <td class="td-order-id" data-label="Order">#${String(o.id).padStart(4, '0')}</td>
                <td class="td-order-date" data-label="Date">${dateStr} <span class="td-order-time">${timeStr}</span></td>
                <td class="td-order-customer" data-label="Customer">
                    <div class="customer-info-cell">
                        <span class="customer-name-cell">${o.customer_name}</span>
                        <span class="customer-email-cell">${o.customer_email}</span>
                    </div>
                </td>
                <td class="td-order-total" data-label="Total">₹${(o.total_amount || 0).toLocaleString()}</td>
                <td class="td-order-status" data-label="Status">
                    <span class="${statusBadgeClass}">${o.status}</span>
                </td>
                <td class="td-order-action" data-label="" onclick="event.stopPropagation()">
                    <select onchange="updateOrderStatus(${o.id}, this.value)"
                            class="order-status-select ${o.status}">
                        <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== FILTER ORDERS =====
function filterOrders(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(el => el.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        const idMap = { all: 'filter-all', pending: 'filter-pending', completed: 'filter-completed', cancelled: 'filter-cancelled' };
        const match = document.getElementById(idMap[filter]);
        if (match) match.classList.add('active');
    }
    renderOrders();
}

// ===== ORDER STATUS UPDATE =====
async function updateOrderStatus(orderId, status) {
    try {
        const res = await authFetch(`/api/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            // Update in local state
            const order = allOrders.find(o => o.id === orderId);
            if (order) order.status = status;
            updateStats();
            renderOrders();

            // Update modal if open
            const modal = document.getElementById('order-detail-modal');
            if (modal && modal.classList.contains('open')) {
                const currentModalIdText = document.getElementById('detail-order-id').textContent;
                const currentModalId = parseInt(currentModalIdText.replace('#', ''), 10);
                if (currentModalId === orderId) {
                    openOrderModal(orderId);
                }
            }
        } else {
            alert(data.error || 'Failed to update order status');
            fetchOrders(); // Revert select
        }
    } catch (err) {
        alert('Network error. Failed to update status.');
        fetchOrders();
    }
}

async function updateOrderStatusFromModal(orderId, status) {
    await updateOrderStatus(orderId, status);
}

// ===== ORDER DETAIL MODAL LOGIC =====
const orderModal = document.getElementById('order-detail-modal');
const orderModalBody = document.getElementById('order-detail-modal-body');
const detailOrderId = document.getElementById('detail-order-id');

function openOrderModal(orderId) {
    const o = allOrders.find(order => order.id === orderId);
    if (!o) return;

    detailOrderId.textContent = `#${String(o.id).padStart(4, '0')}`;

    const date = new Date(o.created_at);
    const dateStr = date.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const itemsHTML = (o.items && Array.isArray(o.items) && o.items.length > 0 && o.items[0].product_name)
        ? o.items.filter(i => i && i.product_name).map(i => {
            const product = allProducts.find(p => 
                (i.product_id && p.id == i.product_id) || 
                (p.name && i.product_name && p.name.toLowerCase() === i.product_name.toLowerCase())
            );
            const imgPath = product ? `${product.image}` : 'images/harvest root logo.png';
            
            return `
                <div class="modal-order-item">
                    <img src="${imgPath}" alt="${i.product_name}" class="modal-item-img" onerror="this.src='images/harvest root logo.png'">
                    <div class="modal-item-details">
                        <div class="modal-item-name">${i.product_name}</div>
                        <div class="modal-item-meta">₹${i.price} × ${i.quantity}</div>
                    </div>
                    <div class="modal-item-total">₹${(i.price * i.quantity).toLocaleString()}</div>
                </div>
            `;
        }).join('')
        : '<div class="empty-items-state">No items found in this order.</div>';

    orderModalBody.innerHTML = `
        <div class="order-detail-grid">
            <div class="order-info-section">
                <div class="detail-group">
                    <span class="detail-label">Customer Info</span>
                    <div class="detail-value-card">
                        <div class="customer-name">${o.customer_name}</div>
                        <div class="customer-email"><a href="mailto:${o.customer_email}">${o.customer_email}</a></div>
                        <div class="order-timestamp">Ordered on ${dateStr}</div>
                    </div>
                </div>
                
                <div class="detail-group" style="margin-top: 20px;">
                    <span class="detail-label">Shipping Address</span>
                    <div class="detail-value-card address-card">
                        ${o.customer_address}
                    </div>
                </div>
            </div>
            
            <div class="order-items-section">
                <span class="detail-label">Order Items</span>
                <div class="modal-items-list">
                    ${itemsHTML}
                </div>
                
                <div class="modal-order-total-row">
                    <span>Order Total</span>
                    <span class="modal-total-amount">₹${(o.total_amount || 0).toLocaleString()}</span>
                </div>
            </div>
        </div>
        
        <div class="order-status-management">
            <div class="status-manage-left">
                <span class="detail-label">Current Status: <strong class="status-text ${o.status}">${o.status.toUpperCase()}</strong></span>
            </div>
            <div class="status-manage-actions">
                <label for="modal-status-select" style="margin-right: 8px; font-size: 0.8rem; font-weight:600; text-transform: uppercase; color: var(--text-light);">Change Status:</label>
                <select id="modal-status-select" class="order-status-select ${o.status}" onchange="updateOrderStatusFromModal(${o.id}, this.value)">
                    <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </div>
        </div>
    `;

    orderModal.classList.add('open');
}

function closeOrderModal() {
    orderModal.classList.remove('open');
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeOrderModal();
    }
});

// ===== REFRESH DATA =====
function refreshData() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('refreshing');
    fetchOrders().finally(() => {
        setTimeout(() => btn.classList.remove('refreshing'), 600);
    });
}

// ===== LOGOUT =====
async function handleLogout() {
    try {
        await fetch('/api/employee/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    window.location.href = 'login-delivery.html';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', checkAuth);
