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
    subject: 'Great chatting with you — 01 Payments',
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000000;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  <tr><td style="padding-bottom:32px;">
    <span style="font-size:15px;font-weight:700;color:#000000;">01 Payments</span>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Hi ${ownerName || 'there'},</p>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Great talking with you today. As promised, I wanted to follow up with a link to get your free savings audit started.</p>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Just fill out the short form and upload your most recent processing statement — it takes about two minutes. We'll review it and send you a full breakdown of exactly what you're paying and where you can save.</p>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Most businesses we work with save between <strong>$200–$800/month</strong>. Completely free, no obligation.</p>
  </td></tr>

  <tr><td style="padding-bottom:36px;">
    <a href="${formUrl}" style="display:inline-block;background:#000000;color:#ffffff;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;">Get My Free Audit &rarr;</a>
  </td></tr>

  <tr><td style="border-top:1px solid #e5e7eb;padding-top:24px;">
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">Alex<br>01 Payments<br>(916) 661-4050<br>Questions? Just reply to this email.</p>
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
