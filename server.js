require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const multer = require('multer');
const fs = require('fs');
const {
    clearAttempts,
    isValidEmail,
    validatePassword,
    clearUserSession,
    clearAdminSession,
    establishAdminSession,
    establishUserSession,
    requireAdmin,
    requireUser,
    createRequireVerifiedUser,
    loginRateLimit
} = require('./auth');

const requireVerifiedUser = createRequireVerifiedUser(db);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir = path.join(__dirname, 'public', 'images');
        const persistentDataDir = process.env.DATA_DIR || '/var/data';
        const usePersistentDisk = !!(process.env.DATA_DIR || process.env.RENDER_DISK_MOUNT_PATH);
        if (usePersistentDisk) {
            const prodDir = path.join(persistentDataDir, 'images');
            try {
                if (!fs.existsSync(prodDir)) {
                    fs.mkdirSync(prodDir, { recursive: true });
                }
                uploadDir = prodDir;
            } catch (e) {
                console.warn('⚠️ Could not write to persistent images directory. Falling back to local public/images.', e.message);
            }
        }
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

const email = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (e.g. Render's load balancer) for secure cookies
app.set('trust proxy', 1);

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
function resolveSessionSecret() {
    if (process.env.SESSION_SECRET?.trim()) {
        return process.env.SESSION_SECRET.trim();
    }
    if (process.env.RENDER || process.env.NODE_ENV === 'production') {
        console.error('⚠️ SESSION_SECRET is not set in Render Environment.');
        console.error('   Add a long random string (e.g. openssl rand -hex 32) and redeploy.');
        // Stable fallback per service so deploy succeeds; replace with SESSION_SECRET in dashboard
        return crypto.createHash('sha256')
            .update(`harvest-root:${process.env.RENDER_SERVICE_ID || 'render'}:set-session-secret`)
            .digest('hex');
    }
    console.warn('⚠️ Using dev SESSION_SECRET — set SESSION_SECRET in .env for production.');
    return 'harvest-root-dev-only-secret';
}

const sessionSecret = resolveSessionSecret();

app.use(session({
    name: 'hr.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));
const persistentDataDir = process.env.DATA_DIR || process.env.RENDER_DISK_MOUNT_PATH || '/var/data';
const usePersistentDisk = !!(process.env.DATA_DIR || process.env.RENDER_DISK_MOUNT_PATH);

// Serve uploaded images from persistent disk (if available)
if (usePersistentDisk) {
    const prodDir = path.join(persistentDataDir, 'images');
    try {
        if (fs.existsSync(prodDir)) {
            app.use('/images', express.static(prodDir));
        }
    } catch (e) {
        // No-op
    }
}

// Always serve public folder as fallback
app.use(express.static(path.join(__dirname, 'public')));

// ===== ADMIN AUTH ROUTES =====

app.post('/api/auth/login', loginRateLimit('admin-login'), (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    db.get('SELECT * FROM admins WHERE username = ?', [username.trim()], (err, admin) => {
        if (err) {
            console.error('Login DB error:', err.message);
            return res.status(500).json({ error: 'Server error.' });
        }
        if (!admin) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        bcrypt.compare(password, admin.password_hash, (err, match) => {
            if (err) {
                return res.status(500).json({ error: 'Server error.' });
            }
            if (!match) {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }

            clearAttempts(req._rateLimitKey);
            establishAdminSession(req, admin, (regErr) => {
                if (regErr) {
                    return res.status(500).json({ error: 'Failed to establish session.' });
                }
                res.json({ success: true, message: 'Login successful.', username: admin.username });
            });
        });
    });
});

app.post('/api/auth/logout', (req, res) => {
    clearAdminSession(req.session);
    req.session.save((err) => {
        if (err) return res.status(500).json({ error: 'Failed to logout.' });
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

// ===== USER (CUSTOMER) AUTH ROUTES =====

// User Register (sends OTP — account created after verify-otp)
app.post('/api/user/register', loginRateLimit('user-register'), (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const pwdError = validatePassword(password);
    if (pwdError) {
        return res.status(400).json({ error: pwdError });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    const emailNorm = email.toLowerCase().trim();
    const nameTrim = name.trim();

    db.get('SELECT id FROM users WHERE email = ?', [emailNorm], (err, existing) => {
        if (err) {
            return res.status(500).json({ error: 'Server error.' });
        }
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const otp = String(Math.floor(100000 + Math.random() * 900000));

        clearUserSession(req.session);
        clearAdminSession(req.session);

        req.session.tempUser = {
            name: nameTrim,
            email: emailNorm,
            password_hash: hash,
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        const emailStatus = email.getEmailStatus();
        if (!emailStatus.configured && process.env.NODE_ENV === 'production') {
            delete req.session.tempUser;
            return res.status(503).json({
                error: 'Sign-up email is not configured yet. Please contact harvestroot2020@gmail.com.',
                code: 'EMAIL_NOT_CONFIGURED'
            });
        }

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('Session save error:', saveErr.message);
                delete req.session.tempUser;
                return res.status(500).json({ error: 'Could not start signup. Please try again.' });
            }

            clearAttempts(req._rateLimitKey);
            const message = emailStatus.configured
                ? 'Check your email for the verification code (also check spam).'
                : 'Dev mode: check server logs for email preview link.';

            res.json({
                success: true,
                requiresVerification: true,
                message,
                email: emailNorm,
                emailMode: emailStatus.mode
            });

            // Send OTP in background so Render does not timeout the HTTP request
            email.sendOTPEmail(emailNorm, nameTrim, otp).catch((e) => {
                console.error('Background OTP email failed:', e.message);
            });
        });
    });
});

// Resend verification OTP
app.post('/api/user/resend-otp', loginRateLimit('resend-otp'), (req, res) => {
    const tempUser = req.session.tempUser;

    if (!tempUser) {
        return res.status(400).json({ error: 'Signup session expired. Please register again.' });
    }

    const emailStatus = email.getEmailStatus();
    if (!emailStatus.configured && process.env.NODE_ENV === 'production') {
        return res.status(503).json({
            error: 'Email service is not configured on the server.',
            code: 'EMAIL_NOT_CONFIGURED'
        });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    tempUser.otp = otp;
    tempUser.expiresAt = Date.now() + 10 * 60 * 1000;

    req.session.save((saveErr) => {
        if (saveErr) {
            return res.status(500).json({ error: 'Session error. Please register again.' });
        }

        res.json({
            success: true,
            message: 'Sending a new code — check inbox and spam in 1–2 minutes.',
            email: tempUser.email
        });

        email.sendOTPEmail(tempUser.email, tempUser.name, otp).catch((e) => {
            console.error('Background resend OTP failed:', e.message);
        });
    });
});

// Verify Registration OTP
app.post('/api/user/verify-otp', (req, res) => {
    const { code } = req.body;
    const tempUser = req.session.tempUser;

    if (!tempUser) {
        return res.status(400).json({ error: 'Session expired. Please sign up again.' });
    }

    if (Date.now() > tempUser.expiresAt) {
        delete req.session.tempUser;
        return res.status(400).json({ error: 'Verification code expired. Please sign up again.' });
    }

    const codeNorm = String(code || '').trim();
    if (!/^\d{6}$/.test(codeNorm) || codeNorm !== tempUser.otp) {
        return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    db.run('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 1)',
        [tempUser.name, tempUser.email, tempUser.password_hash], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create account.' });
            }
            const newUser = { id: this.lastID, name: tempUser.name, email: tempUser.email };
            delete req.session.tempUser;
            establishUserSession(req, newUser, (regErr) => {
                if (regErr) {
                    return res.status(500).json({ error: 'Account created but session failed. Please sign in.' });
                }
                res.status(201).json({
                    success: true,
                    message: 'Account verified & created!',
                    user: { name: newUser.name, email: newUser.email, address: '' }
                });
            });
        });
});

// User Login
app.post('/api/user/login', loginRateLimit('user-login'), (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Server error.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const match = bcrypt.compareSync(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (!user.email_verified) {
            return res.status(403).json({
                error: 'Email not verified. Please complete signup verification.',
                needsVerification: true
            });
        }

        clearAttempts(req._rateLimitKey);
        establishUserSession(req, user, (regErr) => {
            if (regErr) {
                return res.status(500).json({ error: 'Failed to establish session.' });
            }
            res.json({
                success: true,
                user: { name: user.name, email: user.email, address: user.address || '' }
            });
        });
    });
});

// User Logout
app.post('/api/user/logout', (req, res) => {
    clearUserSession(req.session);
    req.session.save((err) => {
        if (err) return res.status(500).json({ error: 'Failed to logout.' });
        res.json({ success: true });
    });
});

// User Check Session
app.get('/api/user/check', (req, res) => {
    if (req.session && req.session.userId) {
        db.get('SELECT name, email, address, email_verified FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                clearUserSession(req.session);
                return res.json({ authenticated: false });
            }
            if (!user.email_verified) {
                return res.json({ authenticated: false, needsVerification: true });
            }
            res.json({ authenticated: true, user: { name: user.name, email: user.email, address: user.address || '' } });
        });
    } else {
        res.json({ authenticated: false });
    }
});

// User order history (by email)
app.get('/api/user/orders', requireVerifiedUser, (req, res) => {

    db.get('SELECT email FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.status(500).json({ error: 'Failed to load orders.' });
        }

        const sql = `
            SELECT o.id, o.total_amount, o.status, o.created_at,
                   COALESCE(json_group_array(json_object(
                       'product_name', oi.product_name,
                       'quantity', oi.quantity,
                       'price', oi.price
                   )), '[]') as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.customer_email = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `;

        db.all(sql, [user.email], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch orders.' });
            }
            const orders = rows.map(row => ({
                ...row,
                items: JSON.parse(row.items || '[]')
            }));
            res.json({ orders });
        });
    });
});

// User Update Profile (address)
app.put('/api/user/profile', requireVerifiedUser, (req, res) => {
    const { address } = req.body;
    db.run('UPDATE users SET address = ? WHERE id = ?', [address || '', req.session.userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update profile.' });
        }
        res.json({ success: true });
    });
});

// API Routes

// 1. Contact Form Submission
app.post('/api/contact', (req, res) => {
    const { name, email, message, inquiry } = req.body;
    
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    const inquiryType = (inquiry || 'General').trim().slice(0, 50);
    const fullMessage = inquiryType !== 'General'
        ? `[${inquiryType}] ${message}`
        : message;

    const sql = `INSERT INTO contacts (name, email, inquiry, message) VALUES (?, ?, ?, ?)`;
    db.run(sql, [name, email, inquiryType, fullMessage], function(err) {
        if (err) {
            console.error('Error saving contact:', err.message);
            return res.status(500).json({ error: 'Failed to save contact message.' });
        }
        res.status(201).json({ success: true, message: 'Message sent successfully!', id: this.lastID });
    });
});

// Validate cart stock before checkout
function validateCartStock(cartItems, callback) {
    const ids = [...new Set(cartItems.map(i => i.id))];
    if (ids.length === 0) return callback(null, []);

    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT id, name, price, stock FROM products WHERE id IN (${placeholders})`, ids, (err, rows) => {
        if (err) return callback(err);
        const byId = Object.fromEntries(rows.map(r => [r.id, r]));
        for (const item of cartItems) {
            const p = byId[item.id];
            const qty = parseInt(item.qty, 10);
            if (!p) return callback(null, { error: `"${item.name}" is no longer available.` });
            if (!qty || qty < 1) return callback(null, { error: 'Invalid quantity in cart.' });
            if (p.stock < qty) {
                const msg = p.stock === 0
                    ? `"${p.name}" is out of stock.`
                    : `Only ${p.stock} left in stock for "${p.name}".`;
                return callback(null, { error: msg });
            }
        }
        callback(null, null);
    });
}

function processOrderItems(orderId, cartItems, index, done) {
    if (index >= cartItems.length) {
        return db.run('COMMIT', done);
    }
    const item = cartItems[index];
    const qty = parseInt(item.qty, 10);
    db.run(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.id, item.name, qty, item.price],
        (err) => {
            if (err) return done(err);
            db.run(
                `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`,
                [qty, item.id, qty],
                function(updateErr) {
                    if (updateErr || this.changes === 0) {
                        return done(new Error(`STOCK:${item.name}`));
                    }
                    processOrderItems(orderId, cartItems, index + 1, done);
                }
            );
        }
    );
}

// Checkout / Create Order (requires verified customer + stock check)
app.post('/api/orders', requireVerifiedUser, (req, res) => {
    const { customerName, customerEmail, customerAddress, cartItems, totalAmount } = req.body;

    if (!customerName || !customerEmail || !customerAddress || !cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: 'Incomplete order details.' });
    }

    if (req.session.userEmail && customerEmail.toLowerCase().trim() !== req.session.userEmail) {
        return res.status(403).json({ error: 'Order email must match your account email.' });
    }

    validateCartStock(cartItems, (stockErr, stockMsg) => {
        if (stockErr) {
            return res.status(500).json({ error: 'Failed to validate inventory.' });
        }
        if (stockMsg) {
            return res.status(400).json({ error: stockMsg.error });
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run(
                `INSERT INTO orders (customer_name, customer_email, customer_address, total_amount) VALUES (?, ?, ?, ?)`,
                [customerName, customerEmail, customerAddress, totalAmount],
                function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to create order.' });
                    }

                    const orderId = this.lastID;
                    processOrderItems(orderId, cartItems, 0, (commitErr) => {
                        if (commitErr) {
                            db.run('ROLLBACK');
                            const msg = String(commitErr.message || '').startsWith('STOCK:')
                                ? `${commitErr.message.replace('STOCK:', '')} — insufficient stock. Please refresh your cart.`
                                : 'Failed to complete order.';
                            return res.status(400).json({ error: msg });
                        }
                        email.sendOrderConfirmationEmail(orderId, customerName, customerEmail, cartItems, totalAmount);
                        res.status(201).json({ success: true, message: 'Order placed successfully!', orderId });
                    });
                }
            );
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

// 2.6. Admin: Update product price and/or stock
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const productId = req.params.id;
    const { price, stock } = req.body;

    if (price === undefined && stock === undefined) {
        return res.status(400).json({ error: 'Provide price and/or stock to update.' });
    }
    if (price !== undefined && (isNaN(price) || price < 0)) {
        return res.status(400).json({ error: 'Valid price is required.' });
    }
    if (stock !== undefined && (isNaN(stock) || stock < 0 || !Number.isInteger(Number(stock)))) {
        return res.status(400).json({ error: 'Stock must be a non-negative whole number.' });
    }

    const updates = [];
    const params = [];
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (stock !== undefined) { updates.push('stock = ?'); params.push(parseInt(stock, 10)); }
    params.push(productId);

    db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update product.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.json({ success: true, message: 'Product updated successfully.' });
    });
});

// 2.7. Admin: Add new product
app.post('/api/admin/products', requireAdmin, upload.single('photo'), (req, res) => {
    const { name, origin, desc, price, unit, badge, stock } = req.body;
    
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

    const stockNum = stock !== undefined && stock !== '' ? parseInt(stock, 10) : 50;
    if (isNaN(stockNum) || stockNum < 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Valid stock quantity is required.' });
    }

    const imagePath = `images/${req.file.filename}`;

    const sql = `INSERT INTO products (name, origin, desc, price, unit, badge, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, origin, desc, priceNum, unit, badge || '', imagePath, stockNum], function(err) {
        if (err) {
            console.error('Error adding product:', err.message);
            fs.unlink(req.file.path, () => {});
            return res.status(500).json({ error: 'Failed to add product.' });
        }
        res.status(201).json({ success: true, message: 'Product added successfully!', id: this.lastID });
    });
});

// 2.8. Admin: Delete product
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
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
app.get('/api/admin/contacts', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM contacts ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch contacts.' });
        }
        res.json({ contacts: rows });
    });
});

// 4. Admin: Get all orders with items
app.get('/api/admin/orders', requireAdmin, (req, res) => {
    const sql = `
        SELECT o.id, o.customer_name, o.customer_email, o.customer_address, o.total_amount, o.status, o.created_at,
               COALESCE(json_group_array(json_object(
                   'product_name', oi.product_name,
                   'quantity', oi.quantity,
                   'price', oi.price
               )), '[]') as items
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
            items: JSON.parse(row.items || '[]')
        }));

        res.json({ orders: formattedRows });
    });
});

// 5. Admin: Update order status (restores stock when cancelled)
app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
    const allowed = ['pending', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }

    db.get('SELECT status FROM orders WHERE id = ?', [orderId], (err, order) => {
        if (err || !order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const restoreStock = status === 'cancelled' && order.status !== 'cancelled';

        db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ error: 'Failed to update order status.' });
            }

            if (!restoreStock) {
                return res.json({ success: true });
            }

            db.all('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId], (itemsErr, items) => {
                if (itemsErr || !items.length) {
                    return res.json({ success: true });
                }
                let done = 0;
                items.forEach(item => {
                    db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id], () => {
                        done++;
                        if (done === items.length) {
                            res.json({ success: true, stockRestored: true });
                        }
                    });
                });
            });
        });
    });
});

// Health check for Render / uptime monitors
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        email: email.getEmailStatus(),
        sessionSecretSet: !!process.env.SESSION_SECRET
    });
});

// Catch-all: API 404 JSON, unknown pages → 404.html
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    if (req.method === 'GET') {
        const filePath = path.join(__dirname, 'public', '404.html');
        if (fs.existsSync(filePath)) {
            return res.status(404).sendFile(filePath);
        }
    }
    res.status(404).json({ error: 'Not found' });
});

// Start server — email init must not block deploy (SMTP verify can timeout on Render)
function startServer() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
        const status = email.getEmailStatus();
        if (!status.configured) {
            console.warn('⚠️ Set EMAIL_USER + EMAIL_PASS in Render for verification emails.');
        }
    });
}

email.ensureInit()
    .then(() => startServer())
    .catch((err) => {
        console.warn('✉️ Email init warning (starting anyway):', err.message);
        startServer();
    });
