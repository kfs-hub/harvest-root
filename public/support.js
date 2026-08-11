// ===== STATE =====
let allContacts = [];
let isAuthenticated = false;

// Check session on page load
async function checkAuth() {
    try {
        const res = await fetch('/api/employee/check', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated && data.role === 'support') {
            isAuthenticated = true;
            document.getElementById('admin-username-display').textContent = data.username || 'Support Exec';
            fetchContacts();
        } else if (data.authenticated) {
            // Wrong role
            window.location.href = 'employee-portal.html';
        } else {
            window.location.href = 'login-support.html';
        }
    } catch (err) {
        window.location.href = 'login-support.html';
    }
}

// Utility: handle 401 in any fetch
async function authFetch(url, options = {}) {
    options.credentials = 'include';
    const res = await fetch(url, options);
    if (res.status === 401) {
        window.location.href = 'login-support.html';
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

// ===== STATS =====
function updateStats() {
    const totalMessages = allContacts.length;
    document.getElementById('stat-messages').textContent = totalMessages;
    document.getElementById('contacts-count-badge').textContent = totalMessages;
}

// ===== RENDER CONTACTS =====
function renderContacts() {
    const container = document.getElementById('contacts-list');
    if (!container) return;

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
        const initials = c.name ? c.name.charAt(0).toUpperCase() : 'C';

        return `
            <div class="contact-card">
                <div class="contact-card-header">
                    <div class="contact-person">
                        <div class="contact-avatar">${initials}</div>
                        <div>
                            <div class="contact-name">${c.name}</div>
                            <div class="contact-email"><a href="mailto:${c.email}">${c.email}</a></div>
                        </div>
                    </div>
                    <span class="contact-date">${dateStr} · ${timeStr}</span>
                </div>
                <div class="contact-message">${c.message}</div>
            </div>
        `;
    }).join('');
}

// ===== REFRESH DATA =====
function refreshData() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('refreshing');
    fetchContacts().finally(() => {
        setTimeout(() => btn.classList.remove('refreshing'), 600);
    });
}

// ===== LOGOUT =====
async function handleLogout() {
    try {
        await fetch('/api/employee/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    window.location.href = 'login-support.html';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', checkAuth);
