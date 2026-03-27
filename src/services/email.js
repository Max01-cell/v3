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
  const best = comparison.comparisons.find(c => c.bestForMerchant) || comparison.comparisons[0];
  const noSavings = rec.action === 'NO_SWITCH';

  const currentCost = comparison.currentCost.toFixed(2);
  const proposedCost = best ? best.proposedCost.toFixed(2) : null;
  const monthlySavings = best ? best.merchantSavings.toFixed(2) : '0.00';
  const annualSavings = best ? (best.merchantSavings * 12).toFixed(2) : '0.00';

  const subjectLine = noSavings
    ? `Your Processing Statement Review — ${comparison.merchantName}`
    : `We found $${monthlySavings}/mo in savings — ${comparison.merchantName}`;

  const bodyHtml = noSavings ? `
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Hi ${ownerName || 'there'},</p>
  </td></tr>
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">We reviewed your processing statement for <strong>${comparison.merchantName}</strong> and ran the numbers against our rates.</p>
  </td></tr>
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Based on your current setup, the savings opportunity isn't significant enough right now to make a switch worthwhile. ${rec.reason}</p>
  </td></tr>
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">If your volume changes or you'd like a second opinion down the road, don't hesitate to reach out.</p>
  </td></tr>` : `
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Hi ${ownerName || 'there'},</p>
  </td></tr>
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">We reviewed your processing statement for <strong>${comparison.merchantName}</strong>. Here's what we found:</p>
  </td></tr>

  <!-- Numbers table -->
  <tr><td style="padding-bottom:32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;">
        <td style="padding:14px 18px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">What you currently pay</td>
        <td style="padding:14px 18px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">$${currentCost}/mo</td>
      </tr>
      <tr>
        <td style="padding:14px 18px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-top:1px solid #e5e7eb;">With one of our partners</td>
        <td style="padding:14px 18px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-top:1px solid #e5e7eb;">$${proposedCost}/mo</td>
      </tr>
      <tr style="background:#000000;">
        <td style="padding:16px 18px;font-size:15px;font-weight:700;color:#ffffff;">Your monthly savings</td>
        <td style="padding:16px 18px;font-size:15px;font-weight:700;color:#ffffff;text-align:right;">$${monthlySavings}/mo</td>
      </tr>
      <tr>
        <td style="padding:14px 18px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">That's annually</td>
        <td style="padding:14px 18px;font-size:13px;font-weight:600;color:#000000;text-align:right;border-top:1px solid #e5e7eb;">$${annualSavings}/yr</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">We work with multiple processing partners and match each business to the best fit based on their volume, industry, and equipment. I'll walk you through exactly which option makes the most sense for you.</p>
  </td></tr>
  <tr><td style="padding-bottom:24px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#000000;">Ready to move forward? It takes about 10 minutes and there's zero downtime to your business. Reply to this email or give me a call and I'll walk you through it.</p>
  </td></tr>`;

  return getResend().emails.send({
    from: `Alex <${getFrom()}>`,
    to: email,
    subject: subjectLine,
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

  ${bodyHtml}

  <tr><td style="border-top:1px solid #e5e7eb;padding-top:24px;">
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">Alex &middot; 01 Payments &middot; (916) 661-4050<br>Questions? Just reply to this email.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  });
}

/**
 * Send post-call follow-up email to merchant with savings estimate.
 *
 * @param {{ email, ownerName, currentProcessor, monthlyVolume, currentRate, monthlySavings, annualSavings, savingsExplanation }} params
 */
export async function sendPostCallFollowUp({ email, ownerName, currentProcessor, monthlyVolume, currentRate, monthlySavings, annualSavings, savingsExplanation, formattedVolume, displayRate }) {
  const publicUrl    = process.env.PUBLIC_URL   || 'https://01payments.com';
  const calendarLink = process.env.CALENDAR_LINK || `${publicUrl}/get-quote`;

  const subject = monthlySavings
    ? `Your savings estimate — ${monthlySavings}/mo`
    : 'Great chatting with you — 01 Payments';

  const savingsBox = monthlySavings ? `
<!-- Savings box -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:28px;text-align:center;">
<p style="color:#2e7d32;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Estimated monthly savings</p>
<p style="color:#1b5e20;font-size:42px;font-weight:700;margin:0 0 4px;letter-spacing:-1px;">${monthlySavings}</p>
<p style="color:#388e3c;font-size:14px;margin:0;">That's roughly <strong>${annualSavings}/year</strong> back in your pocket</p>
</td>
</tr>
</table>` : '';

  const howWeGetThere = savingsExplanation ? `
<!-- How we get there -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f5;border-radius:8px;margin-bottom:28px;">
<tr>
<td style="padding:24px;">
<p style="color:#999999;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">How we get you there</p>
<p style="color:#555555;font-size:14px;line-height:1.6;margin:0;">${savingsExplanation}</p>
</td>
</tr>
</table>` : '';

  return getResend().emails.send({
    from: `Alex <${getFrom()}>`,
    to: email,
    subject,
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f0;padding:40px 20px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background-color:#1a1a1a;padding:32px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">01</span>
<span style="color:#999999;font-size:22px;font-weight:300;letter-spacing:-0.5px;"> Payments</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Main content -->
<tr>
<td style="padding:40px;">

<p style="color:#1a1a1a;font-size:18px;font-weight:600;margin:0 0 8px;">Hey ${ownerName || 'there'},</p>
<p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 28px;">Thanks for chatting with Alex earlier. Based on what you shared about your processing setup, we put together a quick savings estimate for you.</p>

<!-- What you told us -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f5;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:24px;">
<p style="color:#999999;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">What you told us</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:4px 0;color:#555555;font-size:14px;">Current processor</td>
<td align="right" style="padding:4px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${currentProcessor || '—'}</td>
</tr>
<tr>
<td style="padding:4px 0;color:#555555;font-size:14px;">Estimated monthly volume</td>
<td align="right" style="padding:4px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${formattedVolume || monthlyVolume || '—'}</td>
</tr>
<tr>
<td style="padding:4px 0;color:#555555;font-size:14px;">Current rate</td>
<td align="right" style="padding:4px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${displayRate || currentRate || '—'}</td>
</tr>
</table>
</td>
</tr>
</table>

${savingsBox}

${howWeGetThere}

<!-- CTA -->
<p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 24px;">If these numbers look interesting, I'd love to hop on a quick call and walk you through the details. No pressure — just want to make sure you have the full picture.</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
<tr>
<td style="background-color:#1a1a1a;border-radius:8px;">
<a href="${calendarLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Schedule a 5-min call</a>
</td>
</tr>
</table>

<p style="color:#999999;font-size:13px;line-height:1.6;margin:0 0 4px;">Or just reply to this email — I'll get right back to you.</p>

<!-- Divider -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td style="border-top:1px solid #eeeeee;"></td></tr>
</table>

<p style="color:#999999;font-size:12px;line-height:1.6;margin:0 0 4px;">This estimate is based on the information you shared during your call with Alex. Actual savings may vary once we review your full processing details. There's no obligation and no cost for the comparison.</p>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#fafaf8;padding:24px 40px;border-top:1px solid #eeeeee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<p style="color:#1a1a1a;font-size:14px;font-weight:600;margin:0 0 2px;">Max</p>
<p style="color:#999999;font-size:13px;margin:0 0 2px;">01 Payments</p>
<p style="color:#999999;font-size:13px;margin:0;">max@01payments.com</p>
</td>
<td align="right" valign="top">
<p style="color:#999999;font-size:13px;margin:0;">Sacramento, CA</p>
</td>
</tr>
</table>
</td>
</tr>

</table>
</td>
</tr>
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
export async function sendLeadCaptureNotification({ ownerName, ownerEmail, businessName, businessType, city, callOutcome, objectionGiven, leadQuality, currentProcessor, currentRate, monthlyVolume, callbackTime, engineBreakdown }) {
  const qualityColor = leadQuality?.toLowerCase() === 'hot' ? '#c62828'
    : leadQuality?.toLowerCase() === 'warm' ? '#e65100'
    : '#37474f';

  const row = (label, value) => value && value !== 'n/a' ? `
    <tr>
      <td style="padding:8px 0;color:#999999;font-size:14px;width:160px;">${label}</td>
      <td style="padding:8px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${value}</td>
    </tr>` : '';

  const engineSection = engineBreakdown ? (() => {
    const bd = engineBreakdown;
    const processorRowsHtml = bd.processorRows.map(p => `
      <tr style="${p.best ? 'background-color:#f0fdf4;' : ''}">
        <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;border-top:1px solid #eeeeee;">${p.name}${p.best ? ' ★' : ''}</td>
        <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;text-align:right;border-top:1px solid #eeeeee;">$${p.floorCost.toFixed(2)}/mo</td>
        <td style="padding:8px 12px;font-size:13px;color:${p.merchantSavings > 0 ? '#2e7d32' : '#c62828'};font-weight:600;text-align:right;border-top:1px solid #eeeeee;">${p.merchantSavings > 0 ? '+' : ''}$${p.merchantSavings.toFixed(0)} saved</td>
        <td style="padding:8px 12px;font-size:13px;color:#999999;text-align:right;border-top:1px solid #eeeeee;">$${p.ourResidual.toFixed(0)} residual</td>
      </tr>`).join('');

    return `
<!-- Engine analysis -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f5;border-radius:8px;margin-bottom:24px;">
<tr><td style="padding:24px;">
<p style="color:#999999;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Engine Analysis</p>

<!-- Rate derivation -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  <tr>
    <td style="padding:4px 0;color:#999999;font-size:13px;width:160px;">Rate used</td>
    <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${bd.effectiveRatePct}</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#999999;font-size:13px;">Rate source</td>
    <td style="padding:4px 0;color:#555555;font-size:13px;">${bd.rateSource}</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#999999;font-size:13px;">Volume modeled</td>
    <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${bd.formattedVolume}/mo</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#999999;font-size:13px;">Current est. cost</td>
    <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">$${bd.currentMonthlyCost.toFixed(2)}/mo</td>
  </tr>
  <tr>
    <td style="padding:4px 0;color:#999999;font-size:13px;">Recommendation</td>
    <td style="padding:4px 0;font-size:13px;font-weight:600;color:${bd.recommendation === 'SWITCH' ? '#2e7d32' : '#555555'};">${bd.recommendation}</td>
  </tr>
  ${bd.recommendationReason ? `<tr>
    <td style="padding:4px 0;color:#999999;font-size:13px;vertical-align:top;">Reason</td>
    <td style="padding:4px 0;color:#555555;font-size:13px;">${bd.recommendationReason}</td>
  </tr>` : ''}
</table>

<!-- Processor comparison table -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
  <tr style="background-color:#f0f0ec;">
    <td style="padding:8px 12px;font-size:11px;font-weight:600;color:#999999;text-transform:uppercase;letter-spacing:0.5px;">Processor / Tier</td>
    <td style="padding:8px 12px;font-size:11px;font-weight:600;color:#999999;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Floor Cost</td>
    <td style="padding:8px 12px;font-size:11px;font-weight:600;color:#999999;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Merchant Saves</td>
    <td style="padding:8px 12px;font-size:11px;font-weight:600;color:#999999;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Our Residual</td>
  </tr>
  ${processorRowsHtml}
</table>

</td></tr>
</table>`;
  })() : '';

  return getResend().emails.send({
    from: getFrom(),
    to: getAdmin(),
    subject: `New Lead — ${leadQuality?.toUpperCase() || 'CALL'} | ${businessName || ownerName || ownerEmail}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f0;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background-color:#1a1a1a;padding:32px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
  <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">01</span>
  <span style="color:#999999;font-size:22px;font-weight:300;letter-spacing:-0.5px;"> Payments</span>
</td>
<td align="right">
  <span style="display:inline-block;background-color:${qualityColor};color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 10px;border-radius:4px;">${leadQuality || 'Lead'}</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Content -->
<tr>
<td style="padding:40px;">

<p style="color:#1a1a1a;font-size:18px;font-weight:600;margin:0 0 4px;">New lead captured post-call</p>
<p style="color:#999999;font-size:14px;margin:0 0 28px;">Email extracted from Retell call analysis</p>

<!-- Contact info -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f5;border-radius:8px;margin-bottom:24px;">
<tr><td style="padding:24px;">
<p style="color:#999999;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Contact</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${row('Name', ownerName)}
  ${row('Email', ownerEmail)}
  ${row('Business', businessName)}
  ${row('Business type', businessType)}
  ${row('City', city)}
</table>
</td></tr>
</table>

<!-- Call analysis -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f5;border-radius:8px;margin-bottom:24px;">
<tr><td style="padding:24px;">
<p style="color:#999999;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Call Analysis</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${row('Call outcome', callOutcome)}
  ${row('Objection', objectionGiven)}
  ${row('Processor', currentProcessor)}
  ${row('Current rate', currentRate)}
  ${row('Monthly volume', monthlyVolume)}
  ${row('Callback time', callbackTime)}
</table>
</td></tr>
</table>

${engineSection}

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#fafaf8;padding:20px 40px;border-top:1px solid #eeeeee;">
<p style="color:#999999;font-size:13px;margin:0;">01 Payments · Internal notification · max@01payments.com</p>
</td>
</tr>

</table>
</td></tr>
</table>

</body>
</html>`,
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
