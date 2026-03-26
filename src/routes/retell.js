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
import { sendUploadLink } from '../services/email.js';

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

    request.log.info({ event, callId: call?.call_id }, 'Retell webhook received');

    try {
      if (event === 'call_started') {
        // TODO: log call start, associate with lead by phone number
      }

      if (event === 'call_ended') {
        // TODO: update lead status, trigger follow-up scheduling if email was captured
        const phone = call?.to_number;
        if (phone) {
          // TODO: look up lead by phone and update status
        }
      }

      if (event === 'call_analyzed') {
        // Store transcript
        // TODO: look up lead by call id and save transcript
        const transcript = call?.transcript;
        request.log.info({ callId: call?.call_id, hasTranscript: !!transcript }, 'Call analyzed');
      }
    } catch (err) {
      request.log.error({ err, event }, 'Error handling Retell webhook');
    }

    return reply.status(200).send({ received: true });
  });
}
