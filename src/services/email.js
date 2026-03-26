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
  return getResend().emails.send({
    from: `Alex <${FROM}>`,
    to: email,
    subject: 'Your Free Processing Statement Analysis — 01 Payments',
    html: `
      <p>Hi ${ownerName || 'there'},</p>
      <p>Great chatting with you! As promised, just reply to this email with a photo
      (or PDF) of your most recent processing statement and a real person will send
      you a full savings breakdown within 24 hours — completely free, no obligation.</p>
      <p>Most businesses we work with save between $200–$800/month, so it's worth
      the two minutes to find out.</p>
      <p>Looking forward to it!</p>
      <p>Alex<br>01 Payments<br>(916) 661-4050</p>
    `,
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
