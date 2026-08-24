const nodemailer = require('nodemailer');

class EmailProvider {
  static async send(to, subject, text) {
    const isConfigured = 
      process.env.SMTP_HOST && 
      process.env.SMTP_USER && 
      process.env.SMTP_PASS;

    let transporter;

    if (isConfigured) {
      // Use real SMTP transport
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Fallback: Use Ethereal test mail account
      try {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
      } catch (err) {
        console.log(`[Email Mock Fallback] Failed to create Ethereal account. Logging to console.`);
        console.log(`[Email Sent Mock] To: ${to} | Subject: ${subject} | Body: ${text}`);
        return { success: true, mock: true };
      }
    }

    try {
      const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@unthinkable-delivery.com';
      const info = await transporter.sendMail({
        from: `"Unthinkable Delivery" <${fromEmail}>`,
        to,
        subject,
        text
      });

      if (!isConfigured) {
        // Log the Ethereal sandbox link for development preview
        console.log(`[Email Sent Mock - Ethereal] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      } else {
        console.log(`[Email Sent] MessageID: ${info.messageId}`);
      }

      return { success: true, messageId: info.messageId, previewUrl: !isConfigured ? nodemailer.getTestMessageUrl(info) : null, mock: !isConfigured };
    } catch (error) {
      console.error('Email transmission error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailProvider;
