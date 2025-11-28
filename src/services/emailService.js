const nodemailer = require('nodemailer');

/**
 * Email Service
 * Handles sending email notifications
 */

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

/**
 * Send alert email
 */
const sendAlertEmail = async (userEmail, alert, product) => {
  try {
    // Check if email is configured
    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your_email@gmail.com') {
      console.log('Email not configured, skipping email notification');
      return false;
    }

    const transporter = createTransporter();

    // Build email content based on alert type
    let subject = '';
    let message = '';

    switch (alert.type) {
      case 'price_increase':
        subject = `Price Alert: ${product.title} - Price Increased`;
        message = `
          <h2>Price Increase Alert</h2>
          <p>The price for <strong>${product.title}</strong> has increased.</p>
          <ul>
            <li><strong>Old Price:</strong> $${alert.oldValue}</li>
            <li><strong>New Price:</strong> $${alert.newValue}</li>
            <li><strong>Change:</strong> +$${(alert.newValue - alert.oldValue).toFixed(2)}</li>
          </ul>
          <p><a href="${product.ebayUrl}">View Product on eBay</a></p>
        `;
        break;

      case 'price_decrease':
        subject = `Price Alert: ${product.title} - Price Decreased`;
        message = `
          <h2>Price Decrease Alert</h2>
          <p>Good news! The price for <strong>${product.title}</strong> has decreased.</p>
          <ul>
            <li><strong>Old Price:</strong> $${alert.oldValue}</li>
            <li><strong>New Price:</strong> $${alert.newValue}</li>
            <li><strong>Savings:</strong> -$${(alert.oldValue - alert.newValue).toFixed(2)}</li>
          </ul>
          <p><a href="${product.ebayUrl}">View Product on eBay</a></p>
        `;
        break;

      case 'out_of_stock':
        subject = `Stock Alert: ${product.title} - Out of Stock`;
        message = `
          <h2>Out of Stock Alert</h2>
          <p><strong>${product.title}</strong> is now out of stock.</p>
          <p>Source: ${alert.oldValue === 'ebay' ? 'eBay' : 'Supplier'}</p>
          <p><a href="${product.ebayUrl}">View Product on eBay</a></p>
        `;
        break;

      case 'back_in_stock':
        subject = `Stock Alert: ${product.title} - Back In Stock`;
        message = `
          <h2>Back In Stock Alert</h2>
          <p>Great news! <strong>${product.title}</strong> is back in stock.</p>
          <p>Source: ${alert.newValue === 'ebay' ? 'eBay' : 'Supplier'}</p>
          <p><a href="${product.ebayUrl}">View Product on eBay</a></p>
        `;
        break;

      case 'supplier_unavailable':
        subject = `Supplier Alert: ${product.title} - Supplier Unavailable`;
        message = `
          <h2>Supplier Unavailable</h2>
          <p>The supplier for <strong>${product.title}</strong> is currently unavailable.</p>
          <p><a href="${product.supplierUrl}">Check Supplier</a></p>
        `;
        break;

      default:
        subject = `Product Alert: ${product.title}`;
        message = `
          <h2>Product Alert</h2>
          <p>${alert.message}</p>
          <p><a href="${product.ebayUrl}">View Product</a></p>
        `;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: userEmail,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            h2 { color: #0066c0; }
            ul { list-style: none; padding: 0; }
            li { padding: 5px 0; }
            a { color: #0066c0; text-decoration: none; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          ${message}
          <div class="footer">
            <p>This is an automated notification from your eBay Monitoring System.</p>
            <p>To manage your alert preferences, log in to your dashboard.</p>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Alert email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

/**
 * Send test email
 */
const sendTestEmail = async (email) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'eBay Monitor - Test Email',
      html: `
        <h2>Test Email</h2>
        <p>Your email configuration is working correctly!</p>
        <p>You will receive alerts when products you're monitoring have price or stock changes.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Test email error:', error);
    return false;
  }
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (userEmail, resetUrl, resetToken) => {
  try {
    // Check if email is configured
    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your_email@gmail.com') {
      console.log('Email not configured, skipping password reset email');
      // In development, log the reset URL
      console.log('Password reset URL:', resetUrl);
      console.log('Reset token:', resetToken);
      return false;
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: userEmail,
      subject: 'eBay Monitor - Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            h2 { color: #0066c0; }
            .button { display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .button:hover { background-color: #2563eb; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
            .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password for your eBay Monitor account.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
          <div class="warning">
            <strong>Warning:</strong> This link will expire in 10 minutes. If you didn't request this, please ignore this email.
          </div>
          <div class="footer">
            <p>This is an automated email from your eBay Monitoring System.</p>
            <p>If you didn't request a password reset, please contact support.</p>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Password reset email error:', error);
    return false;
  }
};

module.exports = {
  sendAlertEmail,
  sendTestEmail,
  sendPasswordResetEmail
};

