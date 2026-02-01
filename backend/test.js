const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'mail.sidneyapparels.com',
    port: 587,
    secure: false,
    auth: {
        user: 'management.trainee@sidneyapparels.com',
        pass: 'MT@#2026'
    }
});

async function test() {
    try {
        await transporter.verify();
        console.log('SMTP connection successful!');

        const info = await transporter.sendMail({
            from: '"Sidney ME" <management.trainee@sidneyapparels.com>',
            to: 'shantanu.guin281203@gmail.com',
            subject: 'Test Email',
            text: 'This is a test email from Changeover System'
        });

        console.log('Test email sent:', info.messageId);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();