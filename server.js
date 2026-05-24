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
        let uploadDir = path.join(__dirname, 'public', 'images');
        if (process.env.NODE_ENV === 'production') {
            const prodDir = '/var/data/images';
            try {
                if (!fs.existsSync(prodDir)) {
                    fs.mkdirSync(prodDir, { recursive: true });
                }
                uploadDir = prodDir;
            } catch (e) {
                console.warn('⚠️ Could not write to /var/data/images. Falling back to local public/images.', e.message);
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

// ===== EMAIL / OTP VERIFICATION CONFIG =====
const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : '';
const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.trim() : '';
const emailService = process.env.EMAIL_SERVICE ? process.env.EMAIL_SERVICE.trim() : 'gmail';

let transporter;
if (emailUser && emailPass) {
    // Production SMTP
    transporter = nodemailer.createTransport({
        service: emailService,
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });

    transporter.verify()
        .then(() => console.log('✉️ SMTP transporter verified.'))
        .catch(err => console.error('✉️ SMTP transporter verification failed:', err.message));
} else {
    // Development fallback using Ethereal Fake SMTP
    nodemailer.createTestAccount().then(account => {
        transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.user,
                pass: account.pass
            }
        });
        console.log('✉️ Dev Ethereal SMTP initialized. Emails will log in console.');
    }).catch(err => {
        console.error('Failed to initialize Dev SMTP:', err.message);
    });
}

async function sendOTPEmail(toEmail, toName, otpCode) {
    const mailOptions = {
        from: `"Harvest Root" <${emailUser || 'no-reply@harvestroot.com'}>`,
        to: toEmail,
        subject: `${otpCode} is your Harvest Root verification code`,
        html: `
            <div style="font-family: 'Inter', sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem; border: 1px solid #f0eae1; border-radius: 12px; background-color: #fdfcf7;">
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <h2 style="font-family: 'Playfair Display', serif; color: #2d5a3d; margin: 0; font-size: 1.8rem;">Harvest Root</h2>
                    <p style="color: #8c7e6c; font-size: 0.85rem; margin-top: 0.25rem;">Pure Organic Spices from Coorg</p>
                </div>
                <h3 style="font-family: 'Playfair Display', serif; color: #2c2420; text-align: center; font-size: 1.3rem;">Verify your email address</h3>
                <p style="color: #554a42; font-size: 0.95rem; line-height: 1.5;">Hi ${toName},</p>
                <p style="color: #554a42; font-size: 0.95rem; line-height: 1.5;">Thank you for creating an account with Harvest Root. Please use the following 6-digit verification code to complete your signup. This code is valid for 10 minutes.</p>
                <div style="text-align: center; margin: 2rem 0;">
                    <span style="font-size: 2.2rem; font-weight: 700; letter-spacing: 6px; color: #2d5a3d; background: #f0eae1; padding: 0.75rem 2rem; border-radius: 8px; border: 1px dashed #d1c7bd; display: inline-block;">${otpCode}</span>
                </div>
                <p style="color: #8c7e6c; font-size: 0.8rem; line-height: 1.4; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #f0eae1; margin: 2rem 0;">
                <p style="color: #8c7e6c; font-size: 0.8rem; text-align: center; margin: 0;">© 2026 Harvest Root. Coorg Plantation, Karnataka, India.</p>
            </div>
        `
    };

    if (!transporter) {
        throw new Error('Email transporter not ready');
    }
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
        console.log(`\n✉️ [Test Email Preview Link]: ${previewUrl}\n`);
    }
}

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
if (process.env.NODE_ENV === 'production') {
    const prodDir = '/var/data/images';
    try {
        if (fs.existsSync(prodDir)) {
            app.use('/images', express.static(prodDir));
        }
    } catch (e) {
        // No-op
    }
}
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

// ===== USER (CUSTOMER) AUTH ROUTES =====

// User Register (Initiates OTP sending)
app.post('/api/user/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if email already exists
    db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], async (err, existing) => {
        if (err) {
            return res.status(500).json({ error: 'Server error.' });
        }
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        }

        const hash = bcrypt.hashSync(password, 10);

        db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name.trim(), email.toLowerCase().trim(), hash], function(err) {
                if (err) {
                    console.error('User registration DB error:', err.message);
                    return res.status(500).json({ error: 'Failed to create account.' });
                }

                req.session.userId = this.lastID;
                req.session.userName = name.trim();
                req.session.userEmail = email.toLowerCase().trim();

                res.status(201).json({
                    success: true,
                    message: 'Account created successfully.',
                    user: {
                        name: name.trim(),
                        email: email.toLowerCase().trim()
                    }
                });
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

    if (code !== tempUser.otp) {
        return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    // Insert user into database
    db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [tempUser.name, tempUser.email, tempUser.password_hash], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create account.' });
            }
            req.session.userId = this.lastID;
            req.session.userName = tempUser.name;
            req.session.userEmail = tempUser.email;
            delete req.session.tempUser; // Clear temp user state
            res.status(201).json({ success: true, message: 'Account verified & created!', user: { name: tempUser.name, email: tempUser.email } });
        });
});

// User Login
app.post('/api/user/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
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

        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        res.json({ success: true, user: { name: user.name, email: user.email, address: user.address || '' } });
    });
});

// User Logout
app.post('/api/user/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// User Check Session
app.get('/api/user/check', (req, res) => {
    if (req.session && req.session.userId) {
        db.get('SELECT name, email, address FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                return res.json({ authenticated: false });
            }
            res.json({ authenticated: true, user: { name: user.name, email: user.email, address: user.address || '' } });
        });
    } else {
        res.json({ authenticated: false });
    }
});

// User Update Profile (address)
app.put('/api/user/profile', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Please log in.' });
    }
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
