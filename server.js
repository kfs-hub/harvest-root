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

const persistentDataDir = process.env.DATA_DIR || '/var/data';
const usePersistentDisk = process.env.NODE_ENV === 'production'
    || process.env.RENDER
    || process.env.RENDER_SERVICE_ID
    || process.env.DATA_DIR;

// Configure multer for file uploads
const storage = isVercel ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir = path.join(__dirname, 'public', 'images');
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

// ===== EMAIL / OTP CONFIG =====
const nodemailer = require('nodemailer');

const resendApiKey = process.env.RESEND_API_KEY || '';

// Use Resend SMTP if key is set, otherwise fall back to Gmail
const transporter = resendApiKey
    ? nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: resendApiKey }
    })
    : nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER || '',
            pass: process.env.EMAIL_PASS || ''
        }
    });

transporter.verify()
    .then(() => console.log('✉️  Email transporter ready.'))
    .catch(err => console.warn('⚠️  Email transporter issue:', err.message));

async function sendOTPEmail(toEmail, toName, otpCode) {
    if (!otpCode) {
        console.warn('sendOTPEmail called with no OTP code — skipping.');
        return;
    }

    const fromAddress = resendApiKey
        ? 'Harvest Root <onboarding@resend.dev>'
        : `Harvest Root <${process.env.EMAIL_USER}>`;

    const html = `
        <div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:2rem;border:1px solid #f0eae1;border-radius:12px;background:#fdfcf7;">
            <div style="text-align:center;margin-bottom:1.5rem;">
                <h2 style="font-family:Georgia,serif;color:#2d5a3d;margin:0;font-size:1.8rem;">Harvest Root</h2>
                <p style="color:#8c7e6c;font-size:0.85rem;margin-top:4px;">Pure Organic Spices from Coorg</p>
            </div>
            <h3 style="color:#2c2420;text-align:center;font-size:1.2rem;margin-bottom:0.5rem;">Your verification code</h3>
            <p style="color:#554a42;font-size:0.95rem;line-height:1.6;">Hi ${toName},</p>
            <p style="color:#554a42;font-size:0.95rem;line-height:1.6;">Use the code below to verify your email. It expires in <strong>10 minutes</strong>.</p>
            <div style="text-align:center;margin:2rem 0;">
                <span style="font-size:2.4rem;font-weight:700;letter-spacing:10px;color:#2d5a3d;background:#f0eae1;padding:0.75rem 2rem;border-radius:8px;border:1px dashed #c8b99a;display:inline-block;">${otpCode}</span>
            </div>
            <p style="color:#8c7e6c;font-size:0.8rem;text-align:center;">If you didn't request this, ignore this email.</p>
            <hr style="border:none;border-top:1px solid #f0eae1;margin:1.5rem 0;">
            <p style="color:#8c7e6c;font-size:0.75rem;text-align:center;margin:0;">© 2026 Harvest Root · Coorg, Karnataka, India</p>
        </div>`;

    await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject: `${otpCode} — your Harvest Root verification code`,
        html
    });

    console.log(`✉️  OTP email sent to ${toEmail}`);
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
    if (req.session && (req.session.employeeId || req.session.adminId)) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// Role middleware - checks role of logged-in employee
function requireRole(roles) {
    return (req, res, next) => {
        // If logged in via old admin session, treat as manager
        if (req.session && req.session.adminId && !req.session.employeeRole) {
            req.session.employeeRole = 'manager';
            req.session.employeeId = req.session.adminId;
            req.session.employeeUsername = req.session.adminUsername;
        }

        if (req.session && req.session.employeeRole && roles.includes(req.session.employeeRole)) {
            return next();
        }
        return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    };
}

// ===== RATE LIMITER (Login Protection) =====
function createRateLimiter({ windowMs = 15 * 60 * 1000, maxAttempts = 5 } = {}) {
    const attempts = new Map(); // key: IP, value: { count, firstAttempt }

    // Cleanup stale entries every 10 minutes
    setInterval(() => {
        const now = Date.now();
        for (const [ip, data] of attempts) {
            if (now - data.firstAttempt > windowMs) {
                attempts.delete(ip);
            }
        }
    }, 10 * 60 * 1000).unref();

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        const record = attempts.get(ip);

        if (record) {
            // Reset if outside the window
            if (now - record.firstAttempt > windowMs) {
                attempts.set(ip, { count: 1, firstAttempt: now });
                return next();
            }

            if (record.count >= maxAttempts) {
                const retryAfter = Math.ceil((windowMs - (now - record.firstAttempt)) / 1000);
                const retryMinutes = Math.ceil(retryAfter / 60);
                res.set('Retry-After', String(retryAfter));
                return res.status(429).json({
                    error: `Too many login attempts. Please try again in ${retryMinutes} minute${retryMinutes > 1 ? 's' : ''}.`,
                    retryAfter: retryAfter
                });
            }

            record.count++;
        } else {
            attempts.set(ip, { count: 1, firstAttempt: now });
        }

        next();
    };
}

// 5 attempts per 15 minutes for login routes
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 5 });

// ===== AUTH ROUTES =====

// Login (Legacy Admin Login)
app.post('/api/auth/login', loginLimiter, async (req, res) => {
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
        
        req.session.employeeId = admin.id;
        req.session.employeeUsername = admin.username;
        req.session.employeeRole = 'manager';

        res.json({ success: true, message: 'Login successful.', username: admin.username });
    } catch (err) {
        console.error('Login DB error:', err.message);
        return res.status(500).json({ error: 'Server error.' });
    }
});

// Employee Login
app.post('/api/employee/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM employees WHERE username = $1', [username]);
        const employee = rows[0];

        if (!employee) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const match = await bcrypt.compare(password, employee.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        req.session.employeeId = employee.id;
        req.session.employeeUsername = employee.username;
        req.session.employeeRole = employee.role;

        if (employee.role === 'manager') {
            req.session.adminId = employee.id;
            req.session.adminUsername = employee.username;
        }

        res.json({
            success: true,
            message: 'Login successful.',
            username: employee.username,
            role: employee.role
        });
    } catch (err) {
        console.error('Employee login DB error:', err.message);
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

// Employee Logout
app.post('/api/employee/logout', (req, res) => {
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
    if (req.session && req.session.employeeId) {
        return res.json({ authenticated: true, username: req.session.employeeUsername, role: req.session.employeeRole });
    }
    if (req.session && req.session.adminId) {
        return res.json({ authenticated: true, username: req.session.adminUsername, role: 'manager' });
    }
    res.json({ authenticated: false });
});

// Employee Check session
app.get('/api/employee/check', (req, res) => {
    if (req.session && req.session.employeeId) {
        return res.json({ authenticated: true, username: req.session.employeeUsername, role: req.session.employeeRole });
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

// User Signup (Email + Password)
app.post('/api/user/signup', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        // Check if email already exists
        const { rows: existing } = await pool.query('SELECT id, auth_provider FROM users WHERE email = $1', [cleanEmail]);
        if (existing.length > 0) {
            const provider = existing[0].auth_provider;
            if (provider === 'google') {
                return res.status(409).json({ error: 'This email is already registered with Google. Please use "Continue with Google" to sign in.' });
            }
            return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        // Insert user (unverified — OTP must be confirmed before session is granted)
        await pool.query(
            `INSERT INTO users (name, email, password_hash, auth_provider) VALUES ($1, $2, $3, 'local')
             ON CONFLICT (email) DO NOTHING`,
            [cleanName, cleanEmail, passwordHash]
        );

        // Generate OTP, save to DB, and email it
        const signupOtp      = Math.floor(100000 + Math.random() * 900000).toString();
        const signupOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await pool.query(`UPDATE otp_verifications SET used = TRUE WHERE email = $1 AND used = FALSE`, [cleanEmail]);
        await pool.query(
            `INSERT INTO otp_verifications (email, otp_code, expires_at) VALUES ($1, $2, $3)`,
            [cleanEmail, signupOtp, signupOtpExpiry]
        );

        let emailWarning = null;
        try {
            await sendOTPEmail(cleanEmail, cleanName, signupOtp);
        } catch (emailErr) {
            console.error('OTP email send failed (non-fatal):', emailErr.message);
            emailWarning = 'Account created but email delivery failed. Use "Resend code" on the next screen.';
        }

        res.status(201).json({
            success: true,
            message: emailWarning || 'Account created! Please check your email for a verification code.',
            emailWarning: !!emailWarning
        });
    } catch (err) {
        console.error('Signup error:', err.message);
        return res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }
});

// User Login (Email + Password)
app.post('/api/user/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'No account found with this email. Please sign up.' });
        }

        if (user.auth_provider === 'google' && !user.password_hash) {
            return res.status(401).json({ error: 'This email is registered with Google. Please use "Continue with Google" to sign in.' });
        }

        if (!user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Incorrect password. Please try again.' });
        }

        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;

        res.json({
            success: true,
            user: {
                name: user.name,
                email: user.email,
                address: user.address || '',
                avatar: user.avatar || '',
                auth_provider: user.auth_provider || 'local'
            }
        });
    } catch (err) {
        console.error('User login error:', err.message);
        return res.status(500).json({ error: 'Server error. Please try again.' });
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

// User Verify OTP and complete login after signup
app.post('/api/user/verify-and-login', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and verification code are required.' });

    const cleanEmail = email.trim().toLowerCase();

    try {
        // Validate OTP against our own DB
        const { rows: otpRows } = await pool.query(
            `SELECT * FROM otp_verifications
             WHERE email = $1 AND otp_code = $2 AND used = FALSE AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [cleanEmail, otp]
        );

        if (otpRows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
        }

        // Mark OTP as used
        await pool.query(`UPDATE otp_verifications SET used = TRUE WHERE id = $1`, [otpRows[0].id]);

        // Fetch user from our DB
        const { rows: userRows } = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ error: 'Account not found. Please sign up again.' });
        }

        // Establish Express session
        req.session.userId    = user.id;
        req.session.userName  = user.name;
        req.session.userEmail = user.email;

        res.json({
            success: true,
            user: {
                name:          user.name,
                email:         user.email,
                address:       user.address       || '',
                avatar:        user.avatar        || '',
                auth_provider: user.auth_provider || 'local'
            }
        });
    } catch (err) {
        console.error('Verify-and-login error:', err.message);
        return res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// User Forgot Password — generate OTP and email it
app.post('/api/user/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const cleanEmail = email.trim().toLowerCase();

    try {
        const { rows } = await pool.query(
            'SELECT id, name, auth_provider, password_hash FROM users WHERE email = $1',
            [cleanEmail]
        );
        const user = rows[0];

        // Always respond with success to prevent email enumeration
        if (!user || (user.auth_provider === 'google' && !user.password_hash)) {
            return res.json({ success: true, message: 'If an account exists, a reset code has been sent to your email.' });
        }

        const otp       = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(`UPDATE otp_verifications SET used = TRUE WHERE email = $1 AND used = FALSE`, [cleanEmail]);
        await pool.query(
            `INSERT INTO otp_verifications (email, otp_code, expires_at) VALUES ($1, $2, $3)`,
            [cleanEmail, otp, expiresAt]
        );

        try {
            await sendOTPEmail(cleanEmail, user.name, otp);
        } catch (emailErr) {
            console.error('Forgot password email failed (non-fatal):', emailErr.message);
        }

        res.json({ success: true, message: 'If an account exists, a reset code has been sent to your email.' });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        return res.status(500).json({ error: 'Failed to send reset code. Please try again.' });
    }
});

// User Reset Password — verify OTP + update password
app.post('/api/user/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
        return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        const { rows: otpRows } = await pool.query(
            `SELECT * FROM otp_verifications
             WHERE email = $1 AND otp_code = $2 AND used = FALSE AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [cleanEmail, otp]
        );

        if (otpRows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
        }

        await pool.query(`UPDATE otp_verifications SET used = TRUE WHERE id = $1`, [otpRows[0].id]);

        const newHash = bcrypt.hashSync(newPassword, 10);
        const result  = await pool.query(
            `UPDATE users SET password_hash = $1 WHERE email = $2`,
            [newHash, cleanEmail]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
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

// ===== OTP ROUTES =====

// Send OTP
app.post("/api/otp/send", async (req, res) => {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
        await pool.query(`UPDATE otp_verifications SET used = TRUE WHERE email = $1 AND used = FALSE`, [email.toLowerCase()]);
        await pool.query(
            `INSERT INTO otp_verifications (email, otp_code, expires_at) VALUES ($1, $2, $3)`,
            [email.toLowerCase(), otp, expiresAt]
        );
        try {
            await sendOTPEmail(email, name || 'there', otp);
        } catch (emailErr) {
            console.error('OTP resend email failed (non-fatal):', emailErr.message);
        }
        res.json({ success: true, message: "OTP sent to your email." });
    } catch (err) {
        console.error("OTP send error:", err.message);
        res.status(500).json({ error: "Failed to send OTP. Please try again." });
    }
});

// Verify OTP
app.post("/api/otp/verify", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required." });

    try {
        const { rows } = await pool.query(
            `SELECT * FROM otp_verifications 
             WHERE email = $1 AND otp_code = $2 AND used = FALSE AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [email.toLowerCase(), otp]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
        }

        // Mark OTP as used
        await pool.query(`UPDATE otp_verifications SET used = TRUE WHERE id = $1`, [rows[0].id]);

        res.json({ success: true, message: "OTP verified successfully." });
    } catch (err) {
        console.error("OTP verify error:", err.message);
        res.status(500).json({ error: "Failed to verify OTP." });
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
app.put('/api/admin/products/:id', requireAuth, requireRole(['manager']), (req, res, next) => {
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
app.post('/api/admin/products', requireAuth, requireRole(['manager']), upload.single('photo'), async (req, res) => {
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
app.delete('/api/admin/products/:id', requireAuth, requireRole(['manager']), async (req, res) => {
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
app.get('/api/admin/contacts', requireAuth, requireRole(['manager', 'support']), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json({ contacts: rows });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch contacts.' });
    }
});

// 4. Admin: Get all orders with items
app.get('/api/admin/orders', requireAuth, requireRole(['manager', 'delivery']), async (req, res) => {
    const sql = `
        SELECT o.id, o.customer_name, o.customer_email, o.customer_address, o.total_amount, o.status, o.created_at,
               COALESCE(json_agg(json_build_object(
                   'product_id', oi.product_id,
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
app.put('/api/admin/orders/:id/status', requireAuth, requireRole(['manager', 'delivery']), async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get current status before updating
        const { rows: orderRows } = await client.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        if (orderRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found.' });
        }
        const currentStatus = orderRows[0].status;

        // Fetch order items once for both cases
        const { rows: items } = await client.query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
            [orderId]
        );

        // If cancelling → restore stock
        if (status === 'cancelled' && currentStatus !== 'cancelled') {
            for (const item of items) {
                await client.query(
                    'UPDATE products SET stock = stock + $1 WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }
        }

        // If un-cancelling (cancelled → pending/completed) → deduct stock back
        if (currentStatus === 'cancelled' && status !== 'cancelled') {
            for (const item of items) {
                await client.query(
                    'UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }
        }

        await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating order status:', err.message);
        return res.status(500).json({ error: 'Failed to update order status.' });
    } finally {
        client.release();
    }
});

// ===== EMPLOYEE MANAGEMENT (MANAGER ONLY) =====

// 6. Manager: Get all employees
app.get('/api/admin/employees', requireAuth, requireRole(['manager']), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, username, role, created_at FROM employees ORDER BY created_at DESC');
        res.json({ employees: rows });
    } catch (err) {
        console.error('Error fetching employees:', err.message);
        return res.status(500).json({ error: 'Failed to fetch employees.' });
    }
});

// 7. Manager: Create a new employee
app.post('/api/admin/employees', requireAuth, requireRole(['manager']), async (req, res) => {
    const isMasterAdmin = (req.session.adminUsername === 'admin' || req.session.employeeUsername === 'admin');
    if (!isMasterAdmin) {
        return res.status(403).json({ error: 'Forbidden. Only the master admin can manage employees.' });
    }
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required.' });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedRole = role.trim().toLowerCase();

    if (!['manager', 'delivery', 'support'].includes(trimmedRole)) {
        return res.status(400).json({ error: 'Role must be manager, delivery, or support.' });
    }

    if (trimmedUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        // Check if username already exists
        const { rows: existing } = await pool.query('SELECT id FROM employees WHERE username = $1', [trimmedUsername]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'An employee with this username already exists.' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const { rows } = await pool.query(
            'INSERT INTO employees (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
            [trimmedUsername, hash, trimmedRole]
        );
        res.status(201).json({ success: true, message: 'Employee created successfully.', id: rows[0].id });
    } catch (err) {
        console.error('Error creating employee:', err.message);
        return res.status(500).json({ error: 'Failed to create employee.' });
    }
});

// 8. Manager: Delete an employee
app.delete('/api/admin/employees/:id', requireAuth, requireRole(['manager']), async (req, res) => {
    const isMasterAdmin = (req.session.adminUsername === 'admin' || req.session.employeeUsername === 'admin');
    if (!isMasterAdmin) {
        return res.status(403).json({ error: 'Forbidden. Only the master admin can manage employees.' });
    }
    const employeeId = req.params.id;

    try {
        // Prevent deleting yourself
        if (req.session.employeeId && parseInt(employeeId) === req.session.employeeId) {
            return res.status(400).json({ error: 'You cannot delete your own account.' });
        }

        const result = await pool.query('DELETE FROM employees WHERE id = $1', [employeeId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Employee not found.' });
        }
        res.json({ success: true, message: 'Employee removed successfully.' });
    } catch (err) {
        console.error('Error deleting employee:', err.message);
        return res.status(500).json({ error: 'Failed to delete employee.' });
    }
});

// ===== EMPLOYEE PASSWORD REQUESTS =====

// 1. Submit reset request (Forgot Password - Public)
app.post('/api/employee/request-reset', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
    }
    const cleanUsername = username.trim().toLowerCase();

    try {
        // Validate employee exists
        const { rows } = await pool.query('SELECT id FROM employees WHERE username = $1', [cleanUsername]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No employee account found with this username.' });
        }

        // Check if there is already a pending request to prevent spam
        const { rows: pending } = await pool.query(
            "SELECT id FROM employee_password_requests WHERE username = $1 AND status = 'pending' AND request_type = 'forgot'",
            [cleanUsername]
        );
        if (pending.length > 0) {
            return res.status(409).json({ error: 'A password reset request is already pending approval from the Manager.' });
        }

        await pool.query(
            "INSERT INTO employee_password_requests (username, request_type) VALUES ($1, 'forgot')",
            [cleanUsername]
        );

        res.json({ success: true, message: 'Password reset request sent to the Manager successfully.' });
    } catch (err) {
        console.error('Error submitting password reset request:', err.message);
        return res.status(500).json({ error: 'Server error. Failed to submit request.' });
    }
});

// 2. Submit change request (Change Password - Authenticated)
app.post('/api/employee/request-change', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const employeeId = req.session.employeeId;
    const employeeUsername = req.session.employeeUsername;

    try {
        // Get employee password hash
        const { rows } = await pool.query('SELECT password_hash FROM employees WHERE id = $1', [employeeId]);
        if (rows.length === 0) {
            // Also check old admin session table if needed
            const { rows: adminRows } = await pool.query('SELECT password_hash FROM admins WHERE id = $1', [employeeId]);
            if (adminRows.length === 0) {
                return res.status(404).json({ error: 'Account not found.' });
            }
            rows.push(adminRows[0]);
        }

        const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Incorrect current password.' });
        }

        // Insert password change request
        const newHash = bcrypt.hashSync(newPassword, 10);
        await pool.query(
            "INSERT INTO employee_password_requests (username, request_type, new_password_hash) VALUES ($1, 'change', $2)",
            [employeeUsername, newHash]
        );

        res.json({ success: true, message: 'Password change request submitted for Manager approval.' });
    } catch (err) {
        console.error('Error submitting password change request:', err.message);
        return res.status(500).json({ error: 'Server error. Failed to submit request.' });
    }
});

// 3. Manager: Get all password requests
app.get('/api/admin/password-requests', requireAuth, requireRole(['manager']), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM employee_password_requests ORDER BY created_at DESC');
        res.json({ requests: rows });
    } catch (err) {
        console.error('Error fetching password requests:', err.message);
        return res.status(500).json({ error: 'Failed to fetch password requests.' });
    }
});

// 4. Manager: Resolve a password request
app.post('/api/admin/password-requests/:id/resolve', requireAuth, requireRole(['manager']), async (req, res) => {
    const isMasterAdmin = (req.session.adminUsername === 'admin' || req.session.employeeUsername === 'admin');
    if (!isMasterAdmin) {
        return res.status(403).json({ error: 'Forbidden. Only the master admin can resolve password requests.' });
    }
    const requestId = req.params.id;
    const { action, newPassword } = req.body; // 'approve', 'reject', 'reset'

    if (!['approve', 'reject', 'reset'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be approve, reject, or reset.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch the request
        const { rows } = await client.query('SELECT * FROM employee_password_requests WHERE id = $1', [requestId]);
        const request = rows[0];

        if (!request) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Request not found.' });
        }

        if (request.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Request has already been resolved.' });
        }

        if (action === 'approve') {
            if (request.request_type !== 'change') {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Approval is only valid for change password requests.' });
            }
            // Update employee password
            await client.query('UPDATE employees SET password_hash = $1 WHERE username = $2', [request.new_password_hash, request.username]);
            await client.query("UPDATE employee_password_requests SET status = 'approved' WHERE id = $1", [requestId]);
        } else if (action === 'reject') {
            await client.query("UPDATE employee_password_requests SET status = 'rejected' WHERE id = $1", [requestId]);
        } else if (action === 'reset') {
            if (request.request_type !== 'forgot') {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Reset is only valid for forgot password requests.' });
            }
            if (!newPassword || newPassword.length < 6) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'A valid password of at least 6 characters is required.' });
            }
            // Generate hash and update employee
            const newHash = bcrypt.hashSync(newPassword, 10);
            await client.query('UPDATE employees SET password_hash = $1 WHERE username = $2', [newHash, request.username]);
            await client.query("UPDATE employee_password_requests SET status = 'approved' WHERE id = $1", [requestId]);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: `Request successfully resolved as ${action}.` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error resolving password request:', err.message);
        return res.status(500).json({ error: 'Server error. Failed to resolve request.' });
    } finally {
        client.release();
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
