require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');
const multer = require('multer');
const fs = require('fs');
const { put, del } = require('@vercel/blob');

const isVercel = !!process.env.VERCEL;

// Configure multer for file uploads
const storage = isVercel ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir = path.join(__dirname, 'public', 'images');
        const persistentDataDir = process.env.DATA_DIR || '/var/data';
        const usePersistentDisk = process.env.NODE_ENV === 'production'
            || process.env.RENDER
            || process.env.RENDER_SERVICE_ID
            || process.env.DATA_DIR;
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
    store: new pgSession({
        pool: pool,
        tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'harvest-root-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport: serialize user ID into session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Passport: deserialize user from session by ID
passport.deserializeUser(async (id, done) => {
    try {
        const { rows } = await pool.query('SELECT id, name, email, avatar, auth_provider, address FROM users WHERE id = $1', [id]);
        done(null, rows[0] || null);
    } catch (err) {
        done(err, null);
    }
});

// Configure Google OAuth 2.0 Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        proxy: true
    }, async (accessToken, refreshToken, profile, done) => {
        const googleId = profile.id;
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
        const name = profile.displayName || 'Google User';
        const avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

        if (!email) {
            return done(new Error('No email found in Google profile.'));
        }

        try {
            // Check if a user with this google_id already exists
            const { rows: googleRows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
            const existingByGoogle = googleRows[0];

            if (existingByGoogle) {
                await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, existingByGoogle.id]);
                existingByGoogle.avatar = avatar;
                return done(null, existingByGoogle);
            } else {
                const { rows: emailRows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
                const existingByEmail = emailRows[0];

                if (existingByEmail) {
                    await pool.query('UPDATE users SET google_id = $1, avatar = $2, auth_provider = $3 WHERE id = $4',
                        [googleId, avatar, 'google', existingByEmail.id]);
                    existingByEmail.google_id = googleId;
                    existingByEmail.avatar = avatar;
                    existingByEmail.auth_provider = 'google';
                    return done(null, existingByEmail);
                } else {
                    const { rows: newRows } = await pool.query(
                        'INSERT INTO users (name, email, google_id, avatar, auth_provider) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                        [name, email, googleId, avatar, 'google']
                    );
                    const newUser = { id: newRows[0].id, name, email, google_id: googleId, avatar, auth_provider: 'google', address: '' };
                    return done(null, newUser);
                }
            }
        } catch (err) {
            return done(err);
        }
    }));
    console.log('✅ Google OAuth strategy configured with dynamic proxy trust.');
} else {
    console.warn('⚠️ GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. Google OAuth disabled.');
}

const persistentDataDir = process.env.DATA_DIR || '/var/data';
const usePersistentDisk = process.env.NODE_ENV === 'production'
    || process.env.RENDER
    || process.env.RENDER_SERVICE_ID
    || process.env.DATA_DIR;

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

// Auth middleware — protects admin API routes
function requireAuth(req, res, next) {
    if (req.session && req.session.adminId) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// ===== AUTH ROUTES =====

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        const admin = rows[0];

        if (!admin) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const match = await bcrypt.compare(password, admin.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        req.session.adminId = admin.id;
        req.session.adminUsername = admin.username;
        res.json({ success: true, message: 'Login successful.', username: admin.username });
    } catch (err) {
        console.error('Login DB error:', err.message);
        return res.status(500).json({ error: 'Server error.' });
    }
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

// ===== GOOGLE OAUTH ROUTES =====

// Initiate Google OAuth login
app.get('/api/auth/google', (req, res, next) => {
    if (req.query.redirect) {
        req.session.authRedirect = req.query.redirect;
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Google OAuth callback
app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html?error=google_failed' }),
    (req, res) => {
        req.session.userId = req.user.id;
        req.session.userName = req.user.name;
        req.session.userEmail = req.user.email;

        const redirect = req.session.authRedirect || '/';
        delete req.session.authRedirect;
        res.redirect(redirect);
    }
);

// ===== USER (CUSTOMER) AUTH ROUTES =====

// User Register
app.post('/api/user/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (rows.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const { rows: insertRows } = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [name.trim(), email.toLowerCase().trim(), hash]
        );

        req.session.userId = insertRows[0].id;
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
    } catch (err) {
        console.error('User registration DB error:', err.message);
        return res.status(500).json({ error: 'Failed to create account.' });
    }
});

// User Login
app.post('/api/user/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (!user.password_hash && user.auth_provider === 'google') {
            return res.status(401).json({ error: 'This account uses Google sign-in. Please use the "Sign in with Google" button.' });
        }

        const match = bcrypt.compareSync(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        res.json({ success: true, user: { name: user.name, email: user.email, address: user.address || '', avatar: user.avatar || '', auth_provider: user.auth_provider || 'local' } });
    } catch (err) {
        return res.status(500).json({ error: 'Server error.' });
    }
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
app.get('/api/user/check', async (req, res) => {
    if (req.session && req.session.userId) {
        try {
            const { rows } = await pool.query('SELECT name, email, address, avatar, auth_provider FROM users WHERE id = $1', [req.session.userId]);
            const user = rows[0];
            if (!user) {
                return res.json({ authenticated: false });
            }
            res.json({ authenticated: true, user: { name: user.name, email: user.email, address: user.address || '', avatar: user.avatar || '', auth_provider: user.auth_provider || 'local' } });
        } catch (err) {
            return res.json({ authenticated: false });
        }
    } else {
        res.json({ authenticated: false });
    }
});

// User Update Profile
app.put('/api/user/profile', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Please log in.' });
    }
    const { address } = req.body;
    try {
        await pool.query('UPDATE users SET address = $1 WHERE id = $2', [address || '', req.session.userId]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// ===== API ROUTES =====

// 1. Contact Form
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    try {
        const { rows } = await pool.query(
            'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3) RETURNING id',
            [name, email, message]
        );
        res.status(201).json({ success: true, message: 'Message sent successfully!', id: rows[0].id });
    } catch (err) {
        console.error('Error saving contact:', err.message);
        return res.status(500).json({ error: 'Failed to save contact message.' });
    }
});

// 2. Checkout / Create Order
app.post('/api/orders', async (req, res) => {
    const { customerName, customerEmail, customerAddress, cartItems, totalAmount } = req.body;

    if (!customerName || !customerEmail || !customerAddress || !cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: 'Incomplete order details.' });
    }

    const productIds = cartItems.map(item => item.id);
    // Dynamic placeholders: $1, $2, etc
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check stock
        const { rows: dbProducts } = await client.query(`SELECT id, name, stock FROM products WHERE id IN (${placeholders})`, productIds);

        const productMap = {};
        for (let p of dbProducts) {
            productMap[p.id] = p;
        }

        for (let item of cartItems) {
            const dbProduct = productMap[item.id];
            if (!dbProduct) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Product "${item.name}" is no longer available in our store.` });
            }
            if (dbProduct.stock < item.qty) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Only ${dbProduct.stock} unit(s) of "${item.name}" are currently available in stock, but you requested ${item.qty}. Please adjust your cart quantity.`
                });
            }
        }

        // Create Order
        const { rows: orderRows } = await client.query(
            `INSERT INTO orders (customer_name, customer_email, customer_address, total_amount) VALUES ($1, $2, $3, $4) RETURNING id`,
            [customerName, customerEmail, customerAddress, totalAmount]
        );
        const orderId = orderRows[0].id;

        for (let item of cartItems) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
                [orderId, item.id, item.name, item.qty, item.price]
            );

            await client.query(
                `UPDATE products SET stock = stock - $1 WHERE id = $2`,
                [item.qty, item.id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Order placed successfully!', orderId: orderId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Order creation error:', err.message);
        return res.status(500).json({ error: 'Failed to record order details or update stock levels.' });
    } finally {
        client.release();
    }
});

// 2.5. Products: Get all products
app.get('/api/products', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
        res.json({ products: rows });
    } catch (err) {
        console.error('Error fetching products:', err.message);
        return res.status(500).json({ error: 'Failed to fetch products.' });
    }
});

// 2.6. Admin: Update product details
app.put('/api/admin/products/:id', requireAuth, (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
        return next();
    }
    upload.single('photo')(req, res, next);
}, async (req, res) => {
    const productId = req.params.id;
    const { name, origin, desc, price, unit, badge, stock } = req.body;

    try {
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        const product = rows[0];

        if (!product) {
            if (req.file) fs.unlink(req.file.path, () => { });
            return res.status(404).json({ error: 'Product not found.' });
        }

        const updatedName = name !== undefined ? name.trim() : product.name;
        const updatedOrigin = origin !== undefined ? origin.trim() : product.origin;
        const updatedDesc = desc !== undefined ? desc.trim() : product.desc;

        let updatedPrice = product.price;
        if (price !== undefined && price !== '') {
            updatedPrice = parseFloat(price);
            if (isNaN(updatedPrice) || updatedPrice < 0) {
                if (req.file) fs.unlink(req.file.path, () => { });
                return res.status(400).json({ error: 'Valid price is required.' });
            }
        }

        const updatedUnit = unit !== undefined ? unit.trim() : product.unit;
        const updatedBadge = badge !== undefined ? badge.trim() : product.badge;

        let updatedStock = product.stock;
        if (stock !== undefined && stock !== '') {
            updatedStock = parseInt(stock, 10);
            if (isNaN(updatedStock) || updatedStock < 0) {
                if (req.file) fs.unlink(req.file.path, () => { });
                return res.status(400).json({ error: 'Valid stock level is required.' });
            }
        }

        let updatedImage = product.image;
        let oldImageToDelete = null;
        if (req.file) {
            if (isVercel) {
                const blob = await put(`products/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
                    access: 'public',
                });
                updatedImage = blob.url;
            } else {
                updatedImage = `images/${req.file.filename}`;
            }
            oldImageToDelete = product.image;
        }

        const updateResult = await pool.query(
            `UPDATE products SET name = $1, origin = $2, "desc" = $3, price = $4, unit = $5, badge = $6, image = $7, stock = $8 WHERE id = $9`,
            [updatedName, updatedOrigin, updatedDesc, updatedPrice, updatedUnit, updatedBadge, updatedImage, updatedStock, productId]
        );

        if (updateResult.rowCount === 0) {
            if (req.file) fs.unlink(req.file.path, () => { });
            return res.status(404).json({ error: 'Product not found.' });
        }

        if (oldImageToDelete && oldImageToDelete !== updatedImage) {
            if (oldImageToDelete.includes('public.blob.vercel-storage.com')) {
                del(oldImageToDelete).catch(err => console.warn('Could not delete blob image:', err.message));
            } else if (!isVercel) {
                const absoluteImagePath = path.join(__dirname, 'public', oldImageToDelete);
                fs.unlink(absoluteImagePath, (err) => {
                    if (err) console.warn('Could not delete old product image:', err.message);
                });
            }
        }

        res.json({ success: true, message: 'Product updated successfully.' });
    } catch (err) {
        console.error('Error updating product:', err.message);
        if (req.file) fs.unlink(req.file.path, () => { });
        return res.status(500).json({ error: 'Failed to update product.' });
    }
});

// 2.7. Admin: Add new product
app.post('/api/admin/products', requireAuth, upload.single('photo'), async (req, res) => {
    const { name, origin, desc, price, unit, badge, stock } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'Photo/image file is required.' });
    }

    if (!name || !origin || !desc || price === undefined || !unit) {
        fs.unlink(req.file.path, () => { });
        return res.status(400).json({ error: 'Name, origin, description, price, and unit are required.' });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
        fs.unlink(req.file.path, () => { });
        return res.status(400).json({ error: 'Valid price is required.' });
    }

    let stockNum = 50;
    if (stock !== undefined && stock !== '') {
        stockNum = parseInt(stock, 10);
        if (isNaN(stockNum) || stockNum < 0) {
            if (req.file && !isVercel) fs.unlink(req.file.path, () => { });
            return res.status(400).json({ error: 'Valid stock level is required.' });
        }
    }

    try {
        let imagePath;
        if (isVercel) {
            const blob = await put(`products/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
                access: 'public',
            });
            imagePath = blob.url;
        } else {
            imagePath = `images/${req.file.filename}`;
        }

        const { rows } = await pool.query(
            `INSERT INTO products (name, origin, "desc", price, unit, badge, image, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [name, origin, desc, priceNum, unit, badge || '', imagePath, stockNum]
        );
        res.status(201).json({ success: true, message: 'Product added successfully!', id: rows[0].id });
    } catch (err) {
        console.error('Error adding product:', err.message);
        fs.unlink(req.file.path, () => { });
        return res.status(500).json({ error: 'Failed to add product.' });
    }
});

// 2.8. Admin: Delete product
app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
    const productId = req.params.id;

    try {
        const { rows } = await pool.query('SELECT image FROM products WHERE id = $1', [productId]);
        const product = rows[0];

        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        if (product.image) {
            if (product.image.includes('public.blob.vercel-storage.com')) {
                del(product.image).catch(err => console.warn('Could not delete blob image:', err.message));
            } else if (!isVercel) {
                const absoluteImagePath = path.join(__dirname, 'public', product.image);
                fs.unlink(absoluteImagePath, (err) => {
                    if (err) console.warn('Could not delete product image file:', err.message);
                });
            }
        }

        await pool.query('DELETE FROM products WHERE id = $1', [productId]);
        res.json({ success: true, message: 'Product deleted successfully.' });
    } catch (err) {
        console.error('Error deleting product from DB:', err.message);
        return res.status(500).json({ error: 'Failed to delete product.' });
    }
});

// 3. Admin: Get all contacts
app.get('/api/admin/contacts', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json({ contacts: rows });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch contacts.' });
    }
});

// 4. Admin: Get all orders with items
app.get('/api/admin/orders', requireAuth, async (req, res) => {
    const sql = `
        SELECT o.id, o.customer_name, o.customer_email, o.customer_address, o.total_amount, o.status, o.created_at,
               COALESCE(json_agg(json_build_object(
                   'product_name', oi.product_name,
                   'quantity', oi.quantity,
                   'price', oi.price
               )) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `;

    try {
        const { rows } = await pool.query(sql);
        res.json({ orders: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch orders.' });
    }
});

// 5. Admin: Update order status
app.put('/api/admin/orders/:id/status', requireAuth, async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
    try {
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update order status.' });
    }
});

// Export the app for Vercel Serverless
module.exports = app;

// Only start the server locally or on Render
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}
