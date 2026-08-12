require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY
    }
});

async function run() {
    console.log('API Key prefix:', process.env.RESEND_API_KEY.substring(0, 8));

    try {
        await transporter.verify();
        console.log('✅ RESEND SMTP verified OK');
    } catch (err) {
        console.error('❌ SMTP verify failed:', err.message);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: 'Harvest Root <onboarding@resend.dev>',
            to: 'syednayeemuddinkaif@gmail.com',
            subject: '448271 is your Harvest Root verification code',
            html: '<h2>Your OTP: <strong>448271</strong></h2>'
        });
        console.log('✅ Email sent! Message ID:', info.messageId);
        console.log('Check ysis782004@gmail.com inbox NOW');
    } catch (err) {
        console.error('❌ Send failed:', err.message);
    }
}

run();
