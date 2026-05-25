document.addEventListener('DOMContentLoaded', async () => {
    const cart = JSON.parse(localStorage.getItem('harvestRootCart')) || [];
    
    const itemsContainer = document.getElementById('summary-items');
    const totalEl = document.getElementById('summary-total-price');
    const form = document.getElementById('checkout-form');
    const placeBtn = document.getElementById('place-order-btn');

    // Check if user is logged in — auto-fill their info
    let currentUser = null;
    try {
        const res = await fetch('/api/user/check', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
            currentUser = data.user;
            // Auto-fill form fields from user profile
            document.getElementById('name').value = currentUser.name || '';
            document.getElementById('email').value = currentUser.email || '';
            document.getElementById('address').value = currentUser.address || '';
            // Make name and email read-only since they come from the account
            document.getElementById('name').readOnly = true;
            document.getElementById('email').readOnly = true;
            document.getElementById('name').style.opacity = '0.7';
            document.getElementById('email').style.opacity = '0.7';
        } else {
            // Not logged in — redirect back to home
            window.location.href = '/';
            return;
        }
    } catch (err) {
        window.location.href = '/';
        return;
    }

    if (cart.length === 0) {
        itemsContainer.innerHTML = '<p class="empty-cart-msg">Your cart is empty.</p>';
        totalEl.textContent = '₹0';
        placeBtn.disabled = true;
    } else {
        const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        totalEl.textContent = `₹${total.toLocaleString()}`;
        
        itemsContainer.innerHTML = cart.map(item => `
            <div class="summary-item">
                <div class="summary-item-info">
                    <h4>${item.name}</h4>
                    <p>Qty: ${item.qty} × ₹${item.price} (${item.unit})</p>
                </div>
                <div class="summary-item-price">
                    ₹${(item.price * item.qty).toLocaleString()}
                </div>
            </div>
        `).join('');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (cart.length === 0) return;

        const customerName = document.getElementById('name').value;
        const customerEmail = document.getElementById('email').value;
        const customerAddress = document.getElementById('address').value;
        const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

        // Save address to user profile for future orders
        if (customerAddress && currentUser) {
            try {
                await fetch('/api/user/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: customerAddress }),
                    credentials: 'include'
                });
            } catch (err) { /* non-critical */ }
        }

        const orderData = {
            customerName,
            customerEmail,
            customerAddress,
            cartItems: cart,
            totalAmount: total
        };

        placeBtn.disabled = true;
        placeBtn.textContent = 'Processing...';

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData),
                credentials: 'include'
            });
            
            const data = await res.json();
            
            if (res.ok) {
                localStorage.removeItem('harvestRootCart');
                const orderIdEl = document.getElementById('success-order-id');
                if (orderIdEl && data.orderId) {
                    orderIdEl.textContent = `Your order number is #${data.orderId}.`;
                }
                document.getElementById('checkout-content').style.display = 'none';
                document.getElementById('success-message').style.display = 'block';
            } else {
                if (res.status === 401 || res.status === 403) {
                    window.location.href = '/';
                    return;
                }
                alert(data.error || 'Order failed. Please try again.');
                if (data.error && /stock|available/i.test(data.error)) {
                    setTimeout(() => { window.location.href = '/#products'; }, 500);
                }
                placeBtn.disabled = false;
                placeBtn.textContent = 'Place Order';
            }
        } catch (err) {
            console.error('Checkout error:', err);
            alert(`Error: ${err.message || 'Network error. Please try again.'}`);
            placeBtn.disabled = false;
            placeBtn.textContent = 'Place Order';
        }
    });
});
