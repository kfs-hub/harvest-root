/**
 * Authentication helpers — validation, rate limiting, session roles
 */

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const attemptLog = new Map();

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.ip
        || req.socket?.remoteAddress
        || 'unknown';
}

function rateLimit(key) {
    const now = Date.now();
    let entry = attemptLog.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
        attemptLog.set(key, entry);
    }
    entry.count++;
    if (entry.count > MAX_ATTEMPTS) {
        const mins = Math.ceil((entry.resetAt - now) / 60000);
        return { blocked: true, retryAfterMins: Math.max(mins, 1) };
    }
    return { blocked: false };
}

function clearAttempts(key) {
    attemptLog.delete(key);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email).trim());
}

function validatePassword(password) {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return 'Password must include at least one letter and one number.';
    }
    return null;
}

function clearUserSession(session) {
    delete session.userId;
    delete session.userName;
    delete session.userEmail;
    delete session.tempUser;
}

function clearAdminSession(session) {
    delete session.adminId;
    delete session.adminUsername;
}

function regenerateSession(req, sessionData, callback) {
    req.session.regenerate((err) => {
        if (err) return callback(err);
        Object.assign(req.session, sessionData);
        callback(null);
    });
}

function establishAdminSession(req, admin, callback) {
    regenerateSession(req, {
        adminId: admin.id,
        adminUsername: admin.username,
        role: 'admin'
    }, callback);
}

function establishUserSession(req, user, callback) {
    regenerateSession(req, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: 'user'
    }, callback);
}

function requireAdmin(req, res, next) {
    if (req.session?.adminId) {
        return next();
    }
    return res.status(401).json({ error: 'Admin login required.' });
}

function requireUser(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Please sign in to continue.' });
    }
    next();
}

function createRequireVerifiedUser(db) {
    return function requireVerifiedUser(req, res, next) {
        if (!req.session?.userId) {
            return res.status(401).json({ error: 'Please sign in to continue.' });
        }
        db.get('SELECT email_verified FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Session invalid. Please sign in again.' });
            }
            if (!user.email_verified) {
                return res.status(403).json({
                    error: 'Please verify your email before continuing.',
                    needsVerification: true
                });
            }
            next();
        });
    };
}

function loginRateLimit(scope) {
    return (req, res, next) => {
        const key = `${scope}:${getClientIp(req)}`;
        const result = rateLimit(key);
        if (result.blocked) {
            return res.status(429).json({
                error: `Too many attempts. Try again in ${result.retryAfterMins} minute(s).`
            });
        }
        req._rateLimitKey = key;
        next();
    };
}

module.exports = {
    getClientIp,
    rateLimit,
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
};
