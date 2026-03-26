/**
 * Outbound call routes.
 * All routes require admin auth (Bearer token).
 *
 * POST /api/outbound/trigger  ← single call
 * POST /api/outbound/batch    ← batch campaign
 */

import { requireAdminAuth } from '../middleware/admin-auth.js';
import { createOutboundCall, createBatchCalls } from '../services/retell.js';

export default async function outboundRoutes(fastify) {
  // Apply admin auth to all routes in this plugin
  fastify.addHook('preHandler', requireAdminAuth);

  /**
   * POST /api/outbound/trigger
   * Initiate a single outbound call.
   *
   * Body: { phone, businessName, ownerName, industry, callType }
   */
  fastify.post('/trigger', async (request, reply) => {
    const { phone, businessName, ownerName, industry, callType = 'cold_call' } = request.body;

    if (!phone) {
      return reply.status(400).send({ error: 'phone is required' });
    }

    const call = await createOutboundCall(
      { phone, businessName, ownerName, industry },
      callType
    );

    return {
      callId: call.call_id,
      status: call.call_status,
    };
  });

  /**
   * POST /api/outbound/batch
   * Initiate a batch calling campaign.
   *
   * Body: { prospects: [{ phone, businessName, ownerName, industry }], callType }
   */
  fastify.post('/batch', async (request, reply) => {
    const { prospects, callType = 'cold_call' } = request.body;

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return reply.status(400).send({ error: 'prospects array is required' });
    }

    const batch = await createBatchCalls(prospects, callType);

    return {
      batchId: batch.batch_call_id,
      count: prospects.length,
    };
  });
}
