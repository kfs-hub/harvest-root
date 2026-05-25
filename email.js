/**
 * Email delivery — real SMTP in production, Ethereal preview in local dev only.
 */
const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : '';
const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.trim() : '';
const emailService = process.env.EMAIL_SERVICE ? process.env.EMAIL_SERVICE.trim() : 'gmail';
const smtpHost = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : '';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true';

let transporter = null;
let initPromise = null;
/** @type {'smtp'|'ethereal'|'none'} */
let mode = 'none';

function buildTransport() {
    if (smtpHost) {
        return {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: { user: emailUser, pass: emailPass },
            tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
        };
    }
    if (emailService === 'gmail') {
        return {
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: { user: emailUser, pass: emailPass }
        };
    }
    return {
        service: emailService,
        auth: { user: emailUser, pass: emailPass }
    };
}

async function initEmail() {
    if (emailUser && emailPass) {
        transporter = nodemailer.createTransport({
            ...buildTransport(),
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000
        });
        // Do not block deploy on verify() — Render often times out; test on first send
        try {
            await transporter.verify();
            console.log(`✉️ SMTP verified — sending from ${emailUser}`);
        } catch (err) {
            console.warn(`✉️ SMTP verify skipped (${err.message}). Will retry when sending mail.`);
        }
        mode = 'smtp';
        return;
    }

    if (process.env.NODE_ENV === 'production') {
        mode = 'none';
        transporter = null;
        console.error('✉️ EMAIL NOT CONFIGURED: Set EMAIL_USER and EMAIL_PASS on your host (e.g. Render).');
        console.error('   Gmail: use an App Password (Google Account → Security → 2-Step Verification → App passwords).');
        return;
    }

    const account = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass }
    });
    mode = 'ethereal';
    console.warn('✉️ DEV EMAIL MODE: OTP emails are NOT delivered to real inboxes.');
    console.warn('   Set EMAIL_USER + EMAIL_PASS in .env to send real mail locally.');
    console.warn('   Or check the server console for an Ethereal preview link after signup.');
}

function ensureInit() {
    if (!initPromise) {
        initPromise = initEmail().catch((err) => {
            initPromise = null;
            console.warn('✉️ Email init:', err.message);
            if (process.env.NODE_ENV === 'production' && emailUser && emailPass) {
                // Still allow smtp mode so send can retry
                transporter = nodemailer.createTransport(buildTransport());
                mode = 'smtp';
            }
            return null;
        });
    }
    return initPromise;
}

function getFromAddress() {
    if (emailUser) {
        return `"Harvest Root" <${emailUser}>`;
    }
    return '"Harvest Root" <no-reply@harvestroot.com>';
}

function canSendToRealInboxes() {
    return mode === 'smtp';
}

function getEmailStatus() {
    return {
        mode,
        configured: canSendToRealInboxes(),
        from: emailUser || null
    };
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
        })
    ]);
}

async function sendMail(mailOptions) {
    await ensureInit();
    if (!transporter) {
        throw new Error('Email service is not configured. Contact the store administrator.');
    }
    const info = await withTimeout(
        transporter.sendMail({
            ...mailOptions,
            from: mailOptions.from || getFromAddress()
        }),
        12000,
        'SMTP send'
    );
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
        console.log(`\n✉️ [Dev preview — not delivered to inbox]: ${previewUrl}\n`);
    }
    return info;
}

async function sendOTPEmail(toEmail, toName, otpCode) {
    return sendMail({
        to: toEmail,
        subject: `${otpCode} is your Harvest Root verification code`,
        html: `
            <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:2rem;border:1px solid #f0eae1;border-radius:12px;background:#fdfcf7;">
                <div style="text-align:center;margin-bottom:1.5rem;">
                    <h2 style="font-family:Georgia,serif;color:#2d5a3d;margin:0;">Harvest Root</h2>
                    <p style="color:#8c7e6c;font-size:0.85rem;">Pure Organic Spices from Coorg</p>
                </div>
                <h3 style="text-align:center;color:#2c2420;">Verify your email</h3>
                <p style="color:#554a42;">Hi ${toName},</p>
                <p style="color:#554a42;">Use this code to complete your signup. It expires in <strong>10 minutes</strong>.</p>
                <div style="text-align:center;margin:2rem 0;">
                    <span style="font-size:2rem;font-weight:700;letter-spacing:6px;color:#2d5a3d;background:#f0eae1;padding:0.75rem 2rem;border-radius:8px;display:inline-block;">${otpCode}</span>
                </div>
                <p style="color:#8c7e6c;font-size:0.8rem;text-align:center;">If you didn't sign up, ignore this email. Check spam/junk if you don't see it in your inbox.</p>
            </div>
        `
    });
}

async function sendOrderConfirmationEmail(orderId, customerName, customerEmail, cartItems, totalAmount) {
    const itemsHtml = cartItems.map(item =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eae1;">${item.name} × ${item.qty}</td>
         <td style="padding:8px 0;border-bottom:1px solid #f0eae1;text-align:right;">₹${(item.price * item.qty).toLocaleString()}</td></tr>`
    ).join('');

    try {
        await sendMail({
            to: customerEmail,
            subject: `Order #${orderId} confirmed — Harvest Root`,
            html: `
                <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:2rem;border:1px solid #f0eae1;border-radius:12px;">
                    <h2 style="color:#2d5a3d;">Harvest Root</h2>
                    <p>Hi ${customerName}, thank you for your order!</p>
                    <p><strong>Order #${orderId}</strong></p>
                    <table style="width:100%;">${itemsHtml}</table>
                    <p style="text-align:right;font-weight:700;">Total: ₹${totalAmount.toLocaleString()}</p>
                </div>
            `
        });
    } catch (err) {
        console.warn('Order confirmation email failed:', err.message);
    }
}

module.exports = {
    ensureInit,
    getEmailStatus,
    canSendToRealInboxes,
    sendOTPEmail,
    sendOrderConfirmationEmail
};
