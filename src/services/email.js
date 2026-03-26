/**
 * Email service using Resend.
 * From: alex@01payments.com
 * Admin notifications: maxh707@gmail.com
 *
 * TODO: Wire up HTML templates from src/templates/.
 */

import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { join } from 'path';

let resend;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const getFrom = () => process.env.FROM_EMAIL || 'alex@01payments.com';
const getAdmin = () => process.env.NOTIFICATION_EMAIL || 'max@01payments.com';

/**
 * Send statement upload link to merchant after cold call.
 *
 * @param {{ email, ownerName, leadId }} params
 */
export async function sendUploadLink({ email, ownerName, leadId }) {
  const publicUrl = process.env.PUBLIC_URL || 'https://01payments.com';
  const uploadUrl = `${publicUrl}/get-quote?ref=${leadId}`;

  return getResend().emails.send({
    from: getFrom(),
    to: email,
    subject: 'Upload Your Processing Statement — Free Savings Audit',
    html: `
      <p>Hi ${ownerName || 'there'},</p>
      <p>Thanks for taking my call! As promised, here's your secure link to upload
      your most recent processing statement:</p>
      <p><a href="${uploadUrl}">Upload Your Statement →</a></p>
      <p>This is 100% free — we'll analyze your statement and show you exactly
      what you're overpaying. Most businesses save $200–$800/month.</p>
      <p>Questions? Reply to this email or call me at (916) 661-4050.</p>
      <p>Alex<br>01 Payments</p>
    `,
  });
}

/**
 * Send savings report to merchant after analysis completes.
 *
 * @param {{ email, ownerName, comparison }} params
 */
export async function sendSavingsReport({ email, ownerName, comparison }) {
  const rec = comparison.recommendation;
  const savings = rec.monthlySavings.toFixed(2);
  const annual = rec.annualSavings.toFixed(2);
  const proposed = rec.monthlySavings > 0
    ? `$${(comparison.currentCost - rec.monthlySavings).toFixed(2)}`
    : 'similar to current';

  return getResend().emails.send({
    from: getFrom(),
    to: email,
    subject: `Your Processing Savings Report — ${comparison.merchantName}`,
    html: `
      <p>Hi ${ownerName || 'there'},</p>
      <p>Great news — we found real savings on your processing fees.</p>
      <table>
        <tr><td>Current monthly processing cost:</td><td><strong>$${comparison.currentCost.toFixed(2)}</strong></td></tr>
        <tr><td>Proposed monthly cost:</td><td><strong>${proposed}</strong></td></tr>
        <tr><td><strong>YOUR MONTHLY SAVINGS:</strong></td><td><strong>$${savings}</strong></td></tr>
        <tr><td><strong>YOUR ANNUAL SAVINGS:</strong></td><td><strong>$${annual}</strong></td></tr>
      </table>
      <p><strong>Recommendation:</strong> ${rec.reason}</p>
      <p>Ready to switch? It takes about 10 minutes and there's zero downtime.
      Reply to this email or I'll give you a call to walk through it.</p>
      <p>Alex<br>01 Payments</p>
    `,
  });
}

/**
 * Send post-call follow-up email to merchant asking for statement photo.
 *
 * @param {{ email, ownerName }} params
 */
export async function sendPostCallFollowUp({ email, ownerName }) {
  const publicUrl = process.env.PUBLIC_URL || 'https://01payments.com';
  const formUrl = `${publicUrl}/get-quote`;

  return getResend().emails.send({
    from: `Alex <${getFrom()}>`,
    to: email,
    subject: 'Get your free audit. — 01 Payments',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000000;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

  <!-- Logo -->
  <tr><td style="padding-bottom:40px;">
    <span style="font-size:15px;font-weight:700;letter-spacing:-0.3px;color:#000000;">01 Payments</span>
  </td></tr>

  <!-- Heading -->
  <tr><td style="padding-bottom:12px;">
    <h1 style="margin:0;font-size:36px;font-weight:700;letter-spacing:-1px;line-height:1.1;color:#000000;">Get your free audit.</h1>
  </td></tr>

  <!-- Subheading -->
  <tr><td style="padding-bottom:36px;">
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Fill out the form below and upload a recent processing statement. We'll review it and show you where you can save.</p>
  </td></tr>

  <!-- Full Name -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Full Name</p>
    <div style="border:1px solid #d1d5db;border-radius:6px;padding:12px 14px;font-size:14px;color:#9ca3af;">Jane Martinez</div>
  </td></tr>

  <!-- Business Name -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Business Name</p>
    <div style="border:1px solid #d1d5db;border-radius:6px;padding:12px 14px;font-size:14px;color:#9ca3af;">Martinez Coffee Co.</div>
  </td></tr>

  <!-- Phone Number -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Phone Number</p>
    <div style="border:1px solid #d1d5db;border-radius:6px;padding:12px 14px;font-size:14px;color:#9ca3af;">(555) 123-4567</div>
  </td></tr>

  <!-- Email -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Email</p>
    <div style="border:1px solid #d1d5db;border-radius:6px;padding:12px 14px;font-size:14px;color:#9ca3af;">jane@martinezcoffee.com</div>
  </td></tr>

  <!-- POS -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">What POS or terminal do you use?</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d1d5db;border-radius:6px;background:#ffffff;">
      <tr>
        <td style="padding:12px 14px;font-size:14px;color:#9ca3af;">Select your POS / terminal</td>
        <td style="padding:12px 14px;text-align:right;font-size:14px;color:#9ca3af;">&#8964;</td>
      </tr>
    </table>
    <p style="margin:6px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">Clover &middot; Square &middot; Toast &middot; Pax &middot; Dejavoo &middot; Verifone &middot; Ingenico &middot; Heartland / Genius &middot; SpotOn &middot; Lightspeed &middot; Revel &middot; Shopify POS &middot; Stripe Terminal &middot; NCR / Aloha &middot; Micros / Oracle &middot; Standalone terminal &middot; Online only &middot; Other</p>
  </td></tr>

  <!-- Volume -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Estimated monthly card volume</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d1d5db;border-radius:6px;background:#ffffff;">
      <tr>
        <td style="padding:12px 14px;font-size:14px;color:#9ca3af;">Select estimated volume</td>
        <td style="padding:12px 14px;text-align:right;font-size:14px;color:#9ca3af;">&#8964;</td>
      </tr>
    </table>
    <p style="margin:6px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">Less than $10,000 &middot; $10,000&ndash;$25,000 &middot; $25,000&ndash;$50,000 &middot; $50,000&ndash;$100,000 &middot; $100,000+ &middot; I don't know</p>
  </td></tr>

  <!-- Best time -->
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Best time to reach you?</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d1d5db;border-radius:6px;background:#ffffff;">
      <tr>
        <td style="padding:12px 14px;font-size:14px;color:#9ca3af;">Select preferred time</td>
        <td style="padding:12px 14px;text-align:right;font-size:14px;color:#9ca3af;">&#8964;</td>
      </tr>
    </table>
    <p style="margin:6px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">Morning (8am&ndash;12pm) &middot; Afternoon (12pm&ndash;4pm) &middot; Evening (4pm&ndash;7pm) &middot; Anytime</p>
  </td></tr>

  <!-- Processing Statement -->
  <tr><td style="padding-bottom:32px;">
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:500;color:#000000;">Processing Statement</p>
    <div style="border:1px dashed #d1d5db;border-radius:6px;padding:28px 14px;text-align:center;background:#fafafa;">
      <p style="margin:0 0 6px 0;font-size:22px;color:#9ca3af;">&#8679;</p>
      <p style="margin:0;font-size:13px;color:#9ca3af;">Drag &amp; drop or click to upload PDF, PNG, or JPG</p>
    </div>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding-bottom:40px;">
    <a href="${formUrl}" style="display:block;background:#000000;color:#ffffff;text-align:center;padding:16px;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.2px;">Submit for Free Audit</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #e5e7eb;padding-top:24px;">
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">Alex &middot; 01 Payments &middot; (916) 661-4050<br>Questions? Reply to this email.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  });
}

/**
 * Send admin notification when a hot lead email is captured post-call.
 *
 * @param {{ ownerName, email, businessType, currentProcessor, leadQuality, callOutcome }} params
 */
export async function sendLeadCaptureNotification({ ownerName, ownerEmail, businessName, businessType, city, callOutcome, objectionGiven, leadQuality, currentProcessor, currentRate, callbackTime }) {
  return getResend().emails.send({
    from: getFrom(),
    to: getAdmin(),
    subject: `New Lead — ${leadQuality?.toUpperCase() || 'UNKNOWN'} | ${businessName || ownerName || ownerEmail}`,
    html: `
      <h2>Email captured from post-call analysis</h2>
      <p>
        <strong>Name:</strong> ${ownerName || 'n/a'}<br>
        <strong>Business:</strong> ${businessName || 'n/a'}<br>
        <strong>Business Type:</strong> ${businessType || 'n/a'}<br>
        <strong>City:</strong> ${city || 'n/a'}<br>
        <strong>Email:</strong> ${ownerEmail}<br>
      </p>
      <h3>Call Analysis</h3>
      <p>
        <strong>Lead Quality:</strong> ${leadQuality || 'n/a'}<br>
        <strong>Call Outcome:</strong> ${callOutcome || 'n/a'}<br>
        <strong>Objection:</strong> ${objectionGiven || 'n/a'}<br>
        <strong>Current Processor:</strong> ${currentProcessor || 'n/a'}<br>
        <strong>Current Rate:</strong> ${currentRate || 'n/a'}<br>
        <strong>Callback Time:</strong> ${callbackTime || 'n/a'}
      </p>
    `,
  });
}

/**
 * Send admin notification with full comparison output.
 *
 * @param {{ leadData, comparison }} params
 */
export async function sendAdminNotification({ leadData, comparison }) {
  const rec = comparison.recommendation;
  const bestMerchant = comparison.comparisons.find(c => c.bestForMerchant);
  const bestResidual = comparison.comparisons.find(c => c.bestResidual);
  const bestUpfront = comparison.comparisons.find(c => c.bestUpfront);

  const comparisonsText = comparison.comparisons.map(c =>
    `${c.processorName} (${c.tierName})${c.advanceScenario ? ` [${c.advanceScenario}]` : ''}: ` +
    `floor=$${c.floorCost.toFixed(2)}, gap=$${c.savingsGap.toFixed(2)}, ` +
    `merchant saves $${c.merchantSavings.toFixed(2)}/mo, our residual $${c.ourResidual.toFixed(2)}/mo, ` +
    `upfront $${c.totalUpfront.toFixed(2)}`
  ).join('\n');

  return getResend().emails.send({
    from: getFrom(),
    to: getAdmin(),
    subject: `New Statement Upload — ${comparison.merchantName}`,
    html: `
      <h2>New lead submitted a statement</h2>
      <p>
        <strong>Business:</strong> ${leadData.businessName}<br>
        <strong>Contact:</strong> ${leadData.name}<br>
        <strong>Phone:</strong> ${leadData.phone}<br>
        <strong>Email:</strong> ${leadData.email || 'n/a'}<br>
        <strong>POS System:</strong> ${leadData.posSystem || 'n/a'}<br>
        <strong>Estimated Volume:</strong> ${leadData.estimatedVolume || 'n/a'}<br>
        <strong>Best Time to Call:</strong> ${leadData.bestTimeToCall || 'n/a'}
      </p>
      <h3>Analysis Results</h3>
      <p>Current cost: $${comparison.currentCost.toFixed(2)}/month | Volume: $${comparison.totalVolume.toLocaleString()} | POS: ${comparison.posCategory} (${comparison.difficulty})</p>
      <pre>${comparisonsText}</pre>
      <h3>Recommendation: ${rec.action}</h3>
      <p>${rec.reason}</p>
      <p>
        <strong>Best for merchant:</strong> ${bestMerchant ? `${bestMerchant.processorName} (${bestMerchant.tierName}) — saves $${bestMerchant.merchantSavings.toFixed(2)}/mo` : 'n/a'}<br>
        <strong>Best residual for us:</strong> ${bestResidual ? `${bestResidual.processorName} (${bestResidual.tierName}) — $${bestResidual.ourResidual.toFixed(2)}/mo` : 'n/a'}<br>
        <strong>Best upfront:</strong> ${bestUpfront ? `${bestUpfront.processorName} (${bestUpfront.tierName}) — $${bestUpfront.totalUpfront.toFixed(2)}` : 'n/a'}<br>
        <strong>Deal difficulty:</strong> ${rec.difficulty}
      </p>
    `,
  });
}
