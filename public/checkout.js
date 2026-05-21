document.addEventListener('DOMContentLoaded', () => {
    const cart = JSON.parse(localStorage.getItem('harvestRootCart')) || [];
    
    const itemsContainer = document.getElementById('summary-items');
    const totalEl = document.getElementById('summary-total-price');
    const form = document.getElementById('checkout-form');
    const placeBtn = document.getElementById('place-order-btn');

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
            const res = await fetch('api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            
            const data = await res.json();
            
            if (res.ok) {
                // Clear cart
                localStorage.removeItem('harvestRootCart');
                
                // Show success message
                document.getElementById('checkout-content').style.display = 'none';
                document.getElementById('success-message').style.display = 'block';
            } else {
                alert(`Order failed: ${data.error || 'Please try again.'}`);
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
