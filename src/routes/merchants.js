/**
 * Merchant pipeline CRUD routes.
 *
 * GET    /api/merchants            — list all (filterable)
 * GET    /api/merchants/stats      — pipeline summary
 * GET    /api/merchants/:id        — single merchant
 * POST   /api/merchants            — create
 * PUT    /api/merchants/:id        — partial update
 * PUT    /api/merchants/:id/stage  — advance stage
 * DELETE /api/merchants/:id        — soft delete (stage = dead)
 */

import {
  getAllMerchants,
  getMerchant,
  getMerchantStats,
  upsertMerchant,
  updateMerchant,
  updateMerchantStage,
} from '../services/merchants.js';

export default async function merchantRoutes(fastify) {
  // Stats must be before /:id so "stats" isn't treated as an id
  fastify.get('/merchants/stats', async () => {
    return getMerchantStats();
  });

  fastify.get('/merchants', async (request) => {
    const { stage, iso, quality } = request.query;
    const merchants = getAllMerchants({ stage, iso, quality });
    const stats = getMerchantStats();
    return { merchants, stage_counts: stats.by_stage, total: stats.total };
  });

  fastify.get('/merchants/:id', async (request, reply) => {
    const merchant = getMerchant(Number(request.params.id));
    if (!merchant) return reply.status(404).send({ error: 'Not found' });
    return merchant;
  });

  fastify.post('/merchants', async (request, reply) => {
    // Accept snake_case body — map to camelCase for upsertMerchant
    const b = request.body || {};
    const id = upsertMerchant({
      ownerName:               b.owner_name,
      ownerEmail:              b.owner_email,
      ownerPhone:              b.owner_phone,
      businessName:            b.business_name,
      businessType:            b.business_type,
      city:                    b.city,
      currentProcessor:        b.current_processor,
      currentRate:             b.current_rate,
      monthlyVolume:           b.monthly_volume,
      contractStatus:          b.contract_status,
      estimatedMonthlySavings: b.estimated_monthly_savings,
      estimatedAnnualSavings:  b.estimated_annual_savings,
      matchedIso:              b.matched_iso,
      matchedTier:             b.matched_tier,
      ourResidual:             b.our_residual,
      merchantFloorCost:       b.merchant_floor_cost,
      stage:                   b.stage,
      retellCallId:            b.retell_call_id,
      callRecordingUrl:        b.call_recording_url,
      leadQuality:             b.lead_quality,
      objectionGiven:          b.objection_given,
      callbackTime:            b.callback_time,
      notes:                   b.notes,
    });
    return reply.status(201).send(getMerchant(id));
  });

  fastify.put('/merchants/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!getMerchant(id)) return reply.status(404).send({ error: 'Not found' });
    return updateMerchant(id, request.body || {});
  });

  fastify.put('/merchants/:id/stage', async (request, reply) => {
    const id = Number(request.params.id);
    const { stage } = request.body || {};
    if (!stage) return reply.status(400).send({ error: 'stage required' });
    if (!getMerchant(id)) return reply.status(404).send({ error: 'Not found' });
    return updateMerchantStage(id, stage);
  });

  fastify.delete('/merchants/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!getMerchant(id)) return reply.status(404).send({ error: 'Not found' });
    updateMerchantStage(id, 'dead');
    return { success: true };
  });
}
