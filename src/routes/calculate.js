/**
 * Real-time savings calculation endpoint.
 * Called by Retell Custom Function mid-call so Alex can quote savings live.
 *
 * POST /api/calculate-savings   — Retell calls this during the conversation
 * GET  /api/calculate-savings/test — smoke test after deploy
 */

import { runCallEstimate } from '../services/estimate.js';

function formatDollars(amount) {
  return '$' + Math.round(amount).toLocaleString('en-US');
}

const FALLBACK = { monthly_savings: 'significant', annual_savings: 'significant' };

export default async function calculateRoutes(fastify) {
  /**
   * GET /api/calculate-savings/test
   * Smoke test — confirms route is live after deploy.
   */
  fastify.get('/calculate-savings/test', async () => {
    return { status: 'ok', example: { monthly_savings: '$560', annual_savings: '$6,720' } };
  });

  /**
   * POST /api/calculate-savings
   * Retell Custom Function — called mid-call with merchant info.
   * Returns formatted savings numbers Alex reads to the merchant.
   */
  fastify.post('/calculate-savings', async (request, reply) => {
    console.log('[calculate-savings] payload format:', request.body?.args ? 'args wrapper' : 'flat');
    const args = request.body?.args || request.body;
    const { current_processor, current_rate, monthly_volume, business_type } = args;

    request.log.info(
      { current_processor, current_rate, monthly_volume, business_type },
      '[calculate-savings] incoming request'
    );

    try {
      const estimate = runCallEstimate({
        currentProcessor: current_processor,
        rawRate:          current_rate,
        rawVolume:        monthly_volume,
        businessName:     business_type,
      });

      if (!estimate.canEstimate || !estimate.monthlySavings) {
        request.log.info('[calculate-savings] no estimate — returning fallback');
        return FALLBACK;
      }

      // Strip the leading '$' from monthlySavings/annualSavings (already formatted strings)
      // and reformat via formatDollars for consistent output
      const monthlyNum = parseFloat(estimate.monthlySavings.replace(/[$,]/g, ''));
      const annualNum  = parseFloat(estimate.annualSavings.replace(/[$,]/g, ''));

      const result = {
        monthly_savings: formatDollars(monthlyNum),
        annual_savings:  formatDollars(annualNum),
      };

      request.log.info({ result }, '[calculate-savings] result');
      return result;

    } catch (err) {
      request.log.error({ err }, '[calculate-savings] error — returning fallback');
      return FALLBACK;
    }
  });
}
