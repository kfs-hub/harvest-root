const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// 1. Contact Form Submission
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    const sql = `INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)`;
    db.run(sql, [name, email, message], function(err) {
        if (err) {
            console.error('Error saving contact:', err.message);
            return res.status(500).json({ error: 'Failed to save contact message.' });
        }
        res.status(201).json({ success: true, message: 'Message sent successfully!', id: this.lastID });
    });
});

// 2. Checkout / Create Order
app.post('/api/orders', (req, res) => {
    const { customerName, customerEmail, customerAddress, cartItems, totalAmount } = req.body;

    if (!customerName || !customerEmail || !customerAddress || !cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: 'Incomplete order details.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const insertOrderSql = `INSERT INTO orders (customer_name, customer_email, customer_address, total_amount) VALUES (?, ?, ?, ?)`;
        db.run(insertOrderSql, [customerName, customerEmail, customerAddress, totalAmount], function(err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to create order.' });
            }

            const orderId = this.lastID;
            const insertItemSql = `INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)`;
            
            const stmt = db.prepare(insertItemSql);
            for (let item of cartItems) {
                stmt.run([orderId, item.id, item.name, item.qty, item.price], (err) => {
                    if (err) {
                        console.error('Error inserting order item:', err.message);
                    }
                });
            }
            stmt.finalize();

            db.run('COMMIT', (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to commit order.' });
                }
                res.status(201).json({ success: true, message: 'Order placed successfully!', orderId: orderId });
            });
        });
    });
});

// 3. Admin: Get all contacts
app.get('/api/admin/contacts', (req, res) => {
    db.all(`SELECT * FROM contacts ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch contacts.' });
        }
        res.json({ contacts: rows });
    });
});

// 4. Admin: Get all orders with items
app.get('/api/admin/orders', (req, res) => {
    const sql = `
        SELECT o.id, o.customer_name, o.customer_email, o.customer_address, o.total_amount, o.status, o.created_at,
               json_group_array(json_object(
                   'product_name', oi.product_name,
                   'quantity', oi.quantity,
                   'price', oi.price
               )) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch orders.' });
        }
        
        // parse the JSON string for items
        const formattedRows = rows.map(row => ({
            ...row,
            items: JSON.parse(row.items)
        }));

        res.json({ orders: formattedRows });
    });
});

// 5. Admin: Update order status
app.put('/api/admin/orders/:id/status', (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update order status.' });
        }
        res.json({ success: true });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
