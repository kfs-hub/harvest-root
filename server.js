require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');
const multer = require('multer');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
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

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport: serialize user ID into session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Passport: deserialize user from session by ID
passport.deserializeUser((id, done) => {
    db.get('SELECT id, name, email, avatar, auth_provider, address FROM users WHERE id = ?', [id], (err, user) => {
        done(err, user || null);
    });
});

// Configure Google OAuth 2.0 Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        proxy: true
    }, (accessToken, refreshToken, profile, done) => {
        const googleId = profile.id;
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
        const name = profile.displayName || 'Google User';
        const avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

        if (!email) {
            return done(new Error('No email found in Google profile.'));
        }

        // Check if a user with this google_id already exists
        db.get('SELECT * FROM users WHERE google_id = ?', [googleId], (err, existingByGoogle) => {
            if (err) return done(err);

            if (existingByGoogle) {
                // Returning Google user — update avatar in case it changed
                db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, existingByGoogle.id], () => {
                    existingByGoogle.avatar = avatar;
                    return done(null, existingByGoogle);
                });
            } else {
                // Check if a local user with the same email exists
                db.get('SELECT * FROM users WHERE email = ?', [email], (err, existingByEmail) => {
                    if (err) return done(err);

                    if (existingByEmail) {
                        // Link Google account to existing local user
                        db.run('UPDATE users SET google_id = ?, avatar = ?, auth_provider = ? WHERE id = ?',
                            [googleId, avatar, 'google', existingByEmail.id], (err) => {
                                if (err) return done(err);
                                existingByEmail.google_id = googleId;
                                existingByEmail.avatar = avatar;
                                existingByEmail.auth_provider = 'google';
                                return done(null, existingByEmail);
                            });
                    } else {
                        // Create a brand new Google user (no password)
                        db.run('INSERT INTO users (name, email, google_id, avatar, auth_provider) VALUES (?, ?, ?, ?, ?)',
                            [name, email, googleId, avatar, 'google'], function (err) {
                                if (err) return done(err);
                                const newUser = { id: this.lastID, name, email, google_id: googleId, avatar, auth_provider: 'google', address: '' };
                                return done(null, newUser);
                            });
                    }
                });
            }
        });
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

// Loginn
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

// ===== GOOGLE OAUTH ROUTES =====

// Initiate Google OAuth login
app.get('/api/auth/google', (req, res, next) => {
    // Save the redirect destination (e.g. checkout page) in session
    if (req.query.redirect) {
        req.session.authRedirect = req.query.redirect;
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Google OAuth callback
app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html?error=google_failed' }),
    (req, res) => {
        // Passport has set req.user — sync to our session format
        req.session.userId = req.user.id;
        req.session.userName = req.user.name;
        req.session.userEmail = req.user.email;

        // Redirect to saved destination or home
        const redirect = req.session.authRedirect || '/';
        delete req.session.authRedirect;
        res.redirect(redirect);
    }
);

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
            [name.trim(), email.toLowerCase().trim(), hash], function (err) {
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
        [tempUser.name, tempUser.email, tempUser.password_hash], function (err) {
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

        // If user signed up via Google and has no password, prompt them to use Google
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
        db.get('SELECT name, email, address, avatar, auth_provider FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                return res.json({ authenticated: false });
            }
            res.json({ authenticated: true, user: { name: user.name, email: user.email, address: user.address || '', avatar: user.avatar || '', auth_provider: user.auth_provider || 'local' } });
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
    db.run('UPDATE users SET address = ? WHERE id = ?', [address || '', req.session.userId], function (err) {
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
    db.run(sql, [name, email, message], function (err) {
        if (err) {
            console.error('Error saving contact:', err.message);
            return res.status(500).json({ error: 'Failed to save contact message.' });
        }
        res.status(201).json({ success: true, message: 'Message sent successfully!', id: this.lastID });
    });
});

// 2. Checkout / Create Order (includes ACID-compliant stock level checks and updates)
app.post('/api/orders', (req, res) => {
    const { customerName, customerEmail, customerAddress, cartItems, totalAmount } = req.body;

    if (!customerName || !customerEmail || !customerAddress || !cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: 'Incomplete order details.' });
    }

    // Extract product IDs to query current stock from database
    const productIds = cartItems.map(item => item.id);
    const placeholders = productIds.map(() => '?').join(',');

    db.all(`SELECT id, name, stock FROM products WHERE id IN (${placeholders})`, productIds, (err, dbProducts) => {
        if (err) {
            console.error('Stock verification error:', err.message);
            return res.status(500).json({ error: 'Database error during stock verification.' });
        }

        const productMap = {};
        for (let p of dbProducts) {
            productMap[p.id] = p;
        }

        // Verify stock is sufficient for all items in the cart
        for (let item of cartItems) {
            const dbProduct = productMap[item.id];
            if (!dbProduct) {
                return res.status(400).json({ error: `Product "${item.name}" is no longer available in our store.` });
            }
            if (dbProduct.stock < item.qty) {
                return res.status(400).json({
                    error: `Only ${dbProduct.stock} unit(s) of "${item.name}" are currently available in stock, but you requested ${item.qty}. Please adjust your cart quantity.`
                });
            }
        }

        // Proceed to place order and deduct stock in a secure transaction
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const insertOrderSql = `INSERT INTO orders (customer_name, customer_email, customer_address, total_amount) VALUES (?, ?, ?, ?)`;
            db.run(insertOrderSql, [customerName, customerEmail, customerAddress, totalAmount], function (err) {
                if (err) {
                    console.error('Order creation error:', err.message);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to create order in database.' });
                }

                const orderId = this.lastID;
                const insertItemSql = `INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)`;
                const updateStockSql = `UPDATE products SET stock = stock - ? WHERE id = ?`;

                const stmtItem = db.prepare(insertItemSql);
                const stmtStock = db.prepare(updateStockSql);
                let txnError = false;

                for (let item of cartItems) {
                    stmtItem.run([orderId, item.id, item.name, item.qty, item.price], (err) => {
                        if (err) {
                            console.error('Error inserting order item:', err.message);
                            txnError = true;
                        }
                    });

                    stmtStock.run([item.qty, item.id], (err) => {
                        if (err) {
                            console.error('Error deducting product stock:', err.message);
                            txnError = true;
                        }
                    });
                }

                stmtItem.finalize();
                stmtStock.finalize();

                if (txnError) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to record order details or update stock levels.' });
                }

                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Commit transaction error:', err.message);
                        return res.status(500).json({ error: 'Failed to commit order transaction.' });
                    }
                    res.status(201).json({ success: true, message: 'Order placed successfully!', orderId: orderId });
                });
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

// 2.6. Admin: Update product details (handles both JSON and multipart/form-data for image uploads)
app.put('/api/admin/products/:id', requireAuth, (req, res, next) => {
    // If it's a JSON request (e.g. quick price update), bypass Multer
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
        return next();
    }
    // For full forms that can include files, use Multer to parse
    upload.single('photo')(req, res, next);
}, (req, res) => {
    const productId = req.params.id;
    const { name, origin, desc, price, unit, badge, stock } = req.body;

    db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, product) => {
        if (err) {
            if (req.file) fs.unlink(req.file.path, () => { });
            console.error('Error fetching product for update:', err.message);
            return res.status(500).json({ error: 'Failed to fetch product.' });
        }
        if (!product) {
            if (req.file) fs.unlink(req.file.path, () => { });
            return res.status(404).json({ error: 'Product not found.' });
        }

        // Merge field values
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
            updatedImage = `images/${req.file.filename}`;
            oldImageToDelete = product.image;
        }

        const sql = `UPDATE products SET name = ?, origin = ?, desc = ?, price = ?, unit = ?, badge = ?, image = ?, stock = ? WHERE id = ?`;
        db.run(sql, [updatedName, updatedOrigin, updatedDesc, updatedPrice, updatedUnit, updatedBadge, updatedImage, updatedStock, productId], function (err) {
            if (err) {
                console.error('Error updating product:', err.message);
                if (req.file) fs.unlink(req.file.path, () => { });
                return res.status(500).json({ error: 'Failed to update product.' });
            }

            if (this.changes === 0) {
                if (req.file) fs.unlink(req.file.path, () => { });
                return res.status(404).json({ error: 'Product not found.' });
            }

            // Delete old image file if a new one was successfully uploaded
            if (oldImageToDelete && oldImageToDelete !== updatedImage) {
                // Only delete default initial images if they are in the correct place, but generally safe to unlink
                const absoluteImagePath = path.join(__dirname, 'public', oldImageToDelete);
                fs.unlink(absoluteImagePath, (err) => {
                    if (err) {
                        console.warn('Could not delete old product image:', absoluteImagePath, err.message);
                    }
                });
            }

            res.json({ success: true, message: 'Product updated successfully.' });
        });
    });
});

// 2.7. Admin: Add new product
app.post('/api/admin/products', requireAuth, upload.single('photo'), (req, res) => {
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
            fs.unlink(req.file.path, () => { });
            return res.status(400).json({ error: 'Valid stock level is required.' });
        }
    }

    const imagePath = `images/${req.file.filename}`;

    const sql = `INSERT INTO products (name, origin, desc, price, unit, badge, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, origin, desc, priceNum, unit, badge || '', imagePath, stockNum], function (err) {
        if (err) {
            console.error('Error adding product:', err.message);
            fs.unlink(req.file.path, () => { });
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

        db.run(`DELETE FROM products WHERE id = ?`, [productId], function (err) {
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

// 5. Admin: Update order status
app.put('/api/admin/orders/:id/status', requireAuth, (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], function (err) {
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
