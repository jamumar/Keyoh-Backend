const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_EMAIL_KEY);

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'KEYOH <noreply@keyoh.co.uk>';

async function sendEmail({ to, subject, html, text }) {
    if (!process.env.RESEND_EMAIL_KEY) {
        throw new Error('RESEND_EMAIL_KEY is not configured');
    }

    const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
        text,
    });

    if (error) {
        throw new Error(error.message || 'Failed to send email');
    }

    return data;
}

function buildPasswordResetEmail(code) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                background-color: #f9f9f9;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            }
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                padding: 40px 20px;
                text-align: center;
                color: white;
            }
            .content {
                padding: 40px 30px;
                background-color: white;
                text-align: center;
            }
            .code-box {
                background-color: #f0f4f8;
                border: 2px dashed #c9a84c;
                border-radius: 8px;
                padding: 20px;
                margin: 30px 0;
                display: inline-block;
            }
            .code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #1a1a1a;
            }
            .footer {
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #888;
                background-color: #f9f9f9;
            }
            h1 { margin: 0; font-size: 24px; }
            p { color: #555; line-height: 1.6; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>KEYOH</h1>
                <p style="color: rgba(255,255,255,0.8); margin-top: 10px;">Password reset</p>
            </div>
            <div class="content">
                <h2>Hello,</h2>
                <p>We received a request to reset your password. Use the verification code below in the KEYOH app:</p>
                <div class="code-box">
                    <div class="code">${code}</div>
                </div>
                <p>This code is valid for <b>15 minutes</b>. If you didn't request this, you can safely ignore this email.</p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} KEYOH. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

    const text = `Your KEYOH password reset code is: ${code}. It expires in 15 minutes.`;

    return { html, text };
}

function buildWelcomeEmailLayout({ title, greeting, bodyHtml }) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                background-color: #f9f9f9;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            }
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                padding: 40px 20px;
                text-align: center;
                color: white;
            }
            .content {
                padding: 40px 30px;
                background-color: white;
            }
            .footer {
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #888;
                background-color: #f9f9f9;
            }
            h1 { margin: 0; font-size: 24px; }
            h2 { color: #1a1a1a; margin-top: 0; }
            p { color: #555; line-height: 1.6; }
            ul { color: #555; line-height: 1.8; padding-left: 20px; }
            li { margin-bottom: 8px; }
            .gold { color: #c9a84c; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>KEYOH</h1>
                <p style="color: rgba(255,255,255,0.8); margin-top: 10px;">${title}</p>
            </div>
            <div class="content">
                <h2>${greeting}</h2>
                ${bodyHtml}
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} KEYOH. Direct Property Marketplace.
            </div>
        </div>
    </body>
    </html>
    `;

    return html;
}

function buildWelcomeEmail({ name, role }) {
    const displayName = name ? name.trim() : 'there';
    const isSeller = role === 'seller';
    const isAgent = role === 'agent';

    let title = 'Welcome to KEYOH';
    let subject = 'Welcome to KEYOH — Direct Property Marketplace';

    let bodyHtml = `
        <p>Welcome to KEYOH! We are excited to have you on board.</p>
        <p>KEYOH connects buyers, sellers, and estate agents directly — skipping unnecessary fees and delay.</p>
        <p><strong>What you can do next:</strong></p>
        <ul>
            <li>Browse video listings in your area</li>
            <li>Save properties to your wishlist</li>
            <li>Chat directly with sellers & agents</li>
        </ul>
        <p>If you have any questions, our support team is always here to help.</p>
    `;

    if (isSeller) {
        title = 'Welcome Seller — KEYOH';
        subject = 'Welcome to KEYOH — Start Selling Direct';
        bodyHtml = `
            <p>Welcome to KEYOH! You are registered as a <span class="gold">Private Seller</span>.</p>
            <p>You can list your property, upload video walkthroughs, and receive verified offers directly from buyers.</p>
            <p><strong>Seller checklist:</strong></p>
            <ul>
                <li>Create your property listing in the app</li>
                <li>Add vertical video walkthrough & high-res photos</li>
                <li>Set your asking price and tenure type</li>
                <li>Receive and manage live buyer offers</li>
            </ul>
        `;
    } else if (isAgent) {
        title = 'Welcome Estate Agent — KEYOH Pro';
        subject = 'Welcome to KEYOH Pro for Estate Agents';
        bodyHtml = `
            <p>Welcome to KEYOH Pro! You are registered as an <span class="gold">Estate Agent</span>.</p>
            <p>Manage your client portfolio, boost listings, and connect with serious local buyers on KEYOH.</p>
        `;
    }

    const html = buildWelcomeEmailLayout({
        title,
        greeting: `Hello ${displayName},`,
        bodyHtml,
    });

    const text = [
        `Hello ${displayName},`,
        '',
        isSeller
            ? 'Welcome to KEYOH as a Private Seller! Create your listing, upload videos, and receive direct buyer offers.'
            : isAgent
            ? 'Welcome to KEYOH Pro! Manage client listings and reach active buyers.'
            : 'Welcome to KEYOH! Browse video listings and connect directly with sellers.',
        '',
        'Open the KEYOH app to get started.',
    ].join('\n');

    return { subject, html, text };
}

function buildBoostPurchaseEmail({ name, tierLabel, price, description, propertyAddress }) {
    const displayName = name ? name.trim() : 'there';
    const bodyHtml = `
        <p>Thank you for promoting your listing on KEYOH!</p>
        <p>Your property boost is now <span class="gold">ACTIVE</span>.</p>
        <div style="background-color: #f0f4f8; border-left: 4px solid #c9a84c; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-weight: bold; color: #1a1a1a;">${tierLabel} Boost</p>
            <p style="margin: 5px 0 0 0; color: #555;">${description}</p>
            <p style="margin: 5px 0 0 0; color: #555;"><strong>Amount Paid:</strong> ${price}</p>
            ${propertyAddress ? `<p style="margin: 5px 0 0 0; color: #555;"><strong>Property:</strong> ${propertyAddress}</p>` : ''}
        </div>
        <p>Your property will now receive priority placement in buyer feeds across the platform.</p>
    `;

    const html = buildWelcomeEmailLayout({
        title: 'Boost activated',
        greeting: `Hello ${displayName},`,
        bodyHtml,
    });

    const text = [
        `Hello ${displayName},`,
        '',
        propertyAddress?.trim()
            ? `Your listing at ${propertyAddress.trim()} now has the ${tierLabel} boost.`
            : `Your listing now has the ${tierLabel} boost.`,
        '',
        `Plan: ${tierLabel}`,
        `Amount paid: ${price}`,
        `What you get: ${description}`,
        '',
        'Your home will appear higher in buyer feeds. Track views and enquiries from your seller dashboard in the KEYOH app.',
        '',
        'If you did not make this purchase, please contact support straight away.',
    ].join('\n');

    return {
        subject: `Your ${tierLabel} boost is now active on KEYOH`,
        html,
        text,
    };
}

function buildDeleteAccountRequestEmail(email) {
    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
      <h2>KEYOH account deletion request</h2>
      <p>A user requested permanent account deletion.</p>
      <p><strong>Email:</strong> ${email}</p>
      <p>Please verify the account and delete associated personal data within 7 days.</p>
    </body>
    </html>
    `;

    const text = [
        'KEYOH account deletion request',
        '',
        `Email: ${email}`,
        '',
        'Please verify the account and delete associated personal data within 7 days.',
    ].join('\n');

    return {
        subject: `Account deletion request — ${email}`,
        html,
        text,
    };
}

function buildVerificationOtpEmail(code) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                background-color: #0d0d0d;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                color: #ffffff;
            }
            .header {
                background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                padding: 40px 20px;
                text-align: center;
                color: white;
            }
            .content {
                padding: 40px 30px;
                background-color: #161616;
                text-align: center;
            }
            .code-box {
                background-color: #1a1a1a;
                border: 2px dashed #c9a84c;
                border-radius: 8px;
                padding: 20px;
                margin: 30px 0;
                display: inline-block;
            }
            .code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #c9a84c;
            }
            .footer {
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #888;
                background-color: #0d0d0d;
            }
            h1 { margin: 0; font-size: 24px; color: #c9a84c; letter-spacing: 2px; }
            p { color: #aaaaaa; line-height: 1.6; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>KEYOH</h1>
                <p style="color: rgba(255,255,255,0.8); margin-top: 10px;">Email Verification Code</p>
            </div>
            <div class="content">
                <h2 style="color: #ffffff;">Verify Your Account</h2>
                <p>Welcome to KEYOH. Use the 6-digit verification code below to complete your account setup:</p>
                <div class="code-box">
                    <div class="code">${code}</div>
                </div>
                <p>This code expires in <b>15 minutes</b>. Do not share this code with anyone.</p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} KEYOH. Direct Property Marketplace.
            </div>
        </div>
    </body>
    </html>
    `;

    const text = `Your KEYOH verification code is: ${code}. It expires in 15 minutes.`;
    return { html, text };
}

module.exports = {
    sendEmail,
    buildPasswordResetEmail,
    buildWelcomeEmail,
    buildBoostPurchaseEmail,
    buildDeleteAccountRequestEmail,
    buildVerificationOtpEmail,
};
