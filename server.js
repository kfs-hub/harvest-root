const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const multer = require('multer');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'images');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images are allowed (jpeg, jpg, png, webp, gif)'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'harvest-root-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware — protects admin API routes
function requireAuth(req, res, next) {
    if (req.session && req.session.adminId) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// ===== AUTH ROUTES =====

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
        if (err) {
            console.error('Login DB error:', err.message);
            return res.status(500).json({ error: 'Server error.' });
        }
        if (!admin) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        bcrypt.compare(password, admin.password_hash, (err, match) => {
            if (err) {
                console.error('Bcrypt error:', err.message);
                return res.status(500).json({ error: 'Server error.' });
            }
            if (!match) {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }

            req.session.adminId = admin.id;
            req.session.adminUsername = admin.username;
            res.json({ success: true, message: 'Login successful.', username: admin.username });
        });
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out.' });
    });
});

// Check session
app.get('/api/auth/check', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.json({ authenticated: true, username: req.session.adminUsername });
    }
    res.json({ authenticated: false });
});

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

// 2.5. Products: Get all products
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY id ASC`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching products:', err.message);
            return res.status(500).json({ error: 'Failed to fetch products.' });
        }
        res.json({ products: rows });
    });
});

// 2.6. Admin: Update product price
app.put('/api/admin/products/:id', requireAuth, (req, res) => {
    const productId = req.params.id;
    const { price } = req.body;

    if (price === undefined || isNaN(price) || price < 0) {
        return res.status(400).json({ error: 'Valid price is required.' });
    }

    db.run(`UPDATE products SET price = ? WHERE id = ?`, [price, productId], function(err) {
        if (err) {
            console.error('Error updating product price:', err.message);
            return res.status(500).json({ error: 'Failed to update product price.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.json({ success: true, message: 'Product price updated successfully.' });
    });
});

// 2.7. Admin: Add new product
app.post('/api/admin/products', requireAuth, upload.single('photo'), (req, res) => {
    const { name, origin, desc, price, unit, badge } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ error: 'Photo/image file is required.' });
    }

    if (!name || !origin || !desc || price === undefined || !unit) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Name, origin, description, price, and unit are required.' });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Valid price is required.' });
    }

    const imagePath = `images/${req.file.filename}`;

    const sql = `INSERT INTO products (name, origin, desc, price, unit, badge, image) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, origin, desc, priceNum, unit, badge || '', imagePath], function(err) {
        if (err) {
            console.error('Error adding product:', err.message);
            fs.unlink(req.file.path, () => {});
            return res.status(500).json({ error: 'Failed to add product.' });
        }
        res.status(201).json({ success: true, message: 'Product added successfully!', id: this.lastID });
    });
});

// 2.8. Admin: Delete product
app.delete('/api/admin/products/:id', requireAuth, (req, res) => {
    const productId = req.params.id;

    db.get(`SELECT image FROM products WHERE id = ?`, [productId], (err, product) => {
        if (err) {
            console.error('Error fetching product for deletion:', err.message);
            return res.status(500).json({ error: 'Failed to fetch product.' });
        }
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        if (product.image) {
            const absoluteImagePath = path.join(__dirname, 'public', product.image);
            fs.unlink(absoluteImagePath, (err) => {
                if (err) {
                    console.warn('Could not delete product image file:', absoluteImagePath, err.message);
                }
            });
        }

        db.run(`DELETE FROM products WHERE id = ?`, [productId], function(err) {
            if (err) {
                console.error('Error deleting product from DB:', err.message);
                return res.status(500).json({ error: 'Failed to delete product.' });
            }
            res.json({ success: true, message: 'Product deleted successfully.' });
        });
    });
});

// 3. Admin: Get all contacts
app.get('/api/admin/contacts', requireAuth, (req, res) => {
    db.all(`SELECT * FROM contacts ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch contacts.' });
        }
        res.json({ contacts: rows });
    });
});

// 4. Admin: Get all orders with items
app.get('/api/admin/orders', requireAuth, (req, res) => {
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
app.put('/api/admin/orders/:id/status', requireAuth, (req, res) => {
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
