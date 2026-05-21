function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    event.currentTarget.classList.add('active');
}

async function fetchOrders() {
    try {
        const res = await fetch('api/admin/orders');
        const data = await res.json();
        const tbody = document.getElementById('orders-tbody');
        
        if (data.orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No orders found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.orders.map(o => `
            <tr>
                <td>#${o.id}</td>
                <td>${new Date(o.created_at).toLocaleString()}</td>
                <td>
                    <strong>${o.customer_name}</strong><br>
                    <small>${o.customer_email}</small><br>
                    <small>${o.customer_address}</small>
                </td>
                <td class="order-items">
                    ${o.items && o.items[0] && o.items[0].product_name ? o.items.map(i => `${i.quantity}x ${i.product_name}`).join('<br>') : 'No items'}
                </td>
                <td>₹${o.total_amount}</td>
                <td>
                    <select onchange="updateOrderStatus(${o.id}, this.value)" class="badge ${o.status}" style="border:none; cursor:pointer;">
                        <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>pending</option>
                        <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>completed</option>
                        <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>cancelled</option>
                    </select>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        document.getElementById('orders-tbody').innerHTML = '<tr><td colspan="6">Error loading orders.</td></tr>';
    }
}

async function fetchContacts() {
    try {
        const res = await fetch('api/admin/contacts');
        const data = await res.json();
        const tbody = document.getElementById('contacts-tbody');
        
        if (data.contacts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No messages found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.contacts.map(c => `
            <tr>
                <td>${new Date(c.created_at).toLocaleString()}</td>
                <td>${c.name}</td>
                <td>${c.email}</td>
                <td>${c.message}</td>
            </tr>
        `).join('');
    } catch (err) {
        document.getElementById('contacts-tbody').innerHTML = '<tr><td colspan="4">Error loading messages.</td></tr>';
    }
}

async function updateOrderStatus(id, status) {
    try {
        const res = await fetch(`api/admin/orders/${id}/status`, {
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

// Init
fetchOrders();
fetchContacts();
