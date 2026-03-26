/**
 * Retell AI custom function + webhook routes.
 *
 * POST /api/retell/send-upload-link  ← agent captures email on cold call
 * POST /api/retell/save-lead         ← agent gathers lead info
 * POST /api/retell/webhook           ← call_started / call_ended / call_analyzed events
 *
 * All routes verify X-Retell-Signature.
 */

import { requireRetellSignature } from '../middleware/retell-verify.js';
import { upsertLead, updateLeadStatus, saveCallRecord } from '../services/leads.js';
import { sendUploadLink, sendPostCallFollowUp, sendLeadCaptureNotification } from '../services/email.js';

export default async function retellRoutes(fastify) {
  // Apply signature verification to all routes in this plugin
  fastify.addHook('preHandler', requireRetellSignature);

  /**
   * POST /api/retell/send-upload-link
   * Retell custom function — called when agent captures merchant email.
   * Sends upload link email via Resend.
   */
  fastify.post('/send-upload-link', async (request, reply) => {
    const { args, call } = request.body;
    const email = args?.email;
    const ownerName = args?.owner_name || call?.retell_llm_dynamic_variables?.owner_name;
    const leadId = call?.metadata?.lead_id;

    if (!email) {
      return reply.status(400).send({ result: 'Error: email is required' });
    }

    try {
      await sendUploadLink({ email, ownerName, leadId });

      // Update lead status if we have a lead id
      if (leadId) {
        updateLeadStatus(leadId, 'email_sent');
      }

      return { result: `Link sent to ${email}` };
    } catch (err) {
      request.log.error({ err }, 'Failed to send upload link');
      return { result: `Error sending link to ${email}: ${err.message}` };
    }
  });

  /**
   * POST /api/retell/save-lead
   * Retell custom function — called when agent gathers business info.
   * Upserts lead in SQLite.
   */
  fastify.post('/save-lead', async (request, reply) => {
    const { args, call } = request.body;
    const vars = call?.retell_llm_dynamic_variables || {};

    try {
      const id = upsertLead({
        name: args?.owner_name || vars.owner_name,
        businessName: args?.business_name || vars.business_name,
        phone: args?.phone || call?.to_number,
        email: args?.email,
        industry: args?.industry || vars.industry,
        posSystem: args?.pos_system,
        source: 'cold_call',
        status: 'called',
      });

      return { result: 'Lead saved', leadId: id };
    } catch (err) {
      request.log.error({ err }, 'Failed to save lead');
      return { result: `Error saving lead: ${err.message}` };
    }
  });

  /**
   * POST /api/retell/webhook
   * Retell webhook — fires on call_started, call_ended, call_analyzed.
   */
  fastify.post('/webhook', async (request, reply) => {
    const { event, call } = request.body;

    console.log('WEBHOOK RECEIVED:', JSON.stringify(request.body, null, 2));

    try {
      if (event === 'call_started') {
        // TODO: log call start, associate with lead by phone number
      }

      if (event === 'call_ended') {
        // TODO: update lead status, trigger follow-up scheduling if email was captured
      }

      if (event === 'call_analyzed') {
        console.log('call_analysis raw:', JSON.stringify(call?.call_analysis, null, 2));
        console.log('retell_llm_dynamic_variables raw:', JSON.stringify(call?.retell_llm_dynamic_variables, null, 2));

        // Retell returns custom analysis fields directly on call_analysis (not nested)
        // Fall back to custom_analysis_data in case Retell changes the structure
        const callAnalysis = call?.call_analysis || {};
        const rawExtracted = Object.keys(callAnalysis.custom_analysis_data || {}).length
          ? callAnalysis.custom_analysis_data
          : callAnalysis;
        // Normalize keys — trim whitespace to guard against Retell field name typos
        const extracted = Object.fromEntries(
          Object.entries(rawExtracted).map(([k, v]) => [k.trim(), v])
        );
        const vars = call?.retell_llm_dynamic_variables || {};

        console.log('extracted fields:', JSON.stringify(extracted, null, 2));

        // Merge: extracted analysis takes precedence, dynamic vars fill gaps
        const lead = {
          ownerName:        extracted.owner_name       || vars.owner_name,
          ownerEmail:       extracted.owner_email      || vars.owner_email,
          businessName:     vars.business_name,
          businessType:     vars.business_type,
          city:             vars.city,
          callOutcome:      extracted.call_outcome,
          objectionGiven:   extracted.objection_given,
          leadQuality:      extracted.lead_quality,
          currentProcessor: extracted.current_processor,
          currentRate:      extracted.current_rate,
          callbackTime:     extracted.callback_time,
        };

        console.log('owner_email found:', lead.ownerEmail, '| value:', JSON.stringify(lead.ownerEmail));

        const hasEmail = lead.ownerEmail && lead.ownerEmail !== 'none' && lead.ownerEmail.trim() !== '';
        console.log('hasEmail:', hasEmail);

        if (hasEmail) {
          console.log('Attempting to send follow-up email to:', lead.ownerEmail);
          try {
            const followUpResult = await sendPostCallFollowUp({ email: lead.ownerEmail, ownerName: lead.ownerName });
            console.log('Follow-up email result:', JSON.stringify(followUpResult, null, 2));
          } catch (err) {
            console.error('RESEND ERROR (follow-up):', err?.message, JSON.stringify(err, null, 2));
          }

          console.log('Attempting to send admin notification to:', process.env.NOTIFICATION_EMAIL);
          try {
            const notifResult = await sendLeadCaptureNotification(lead);
            console.log('Admin notification result:', JSON.stringify(notifResult, null, 2));
          } catch (err) {
            console.error('RESEND ERROR (admin notification):', err?.message, JSON.stringify(err, null, 2));
          }
        } else {
          console.log('No valid email found — skipping email sends');
        }
      }
    } catch (err) {
      console.error('WEBHOOK HANDLER ERROR:', err?.message, err?.stack);
    }

    return reply.status(200).send({ received: true });
  });
}
