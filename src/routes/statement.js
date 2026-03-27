/**
 * Statement submission and analysis routes.
 *
 * POST /api/statement/submit  ← website /get-quote form (multipart/form-data, rate-limited)
 * POST /api/statement/analyze ← internal — called by submit handler
 */

import { upsertLead, saveAnalysis } from '../services/leads.js';
import { analyzeStatement } from '../services/analysis.js';
import { sendSavingsReport, sendAdminNotification } from '../services/email.js';

export default async function statementRoutes(fastify) {
  /**
   * POST /api/statement/submit
   * Accepts PDF statement + merchant info from /get-quote form.
   * Rate limited: 5 requests per minute per IP.
   */
  fastify.post('/submit', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    // Parse multipart form
    const parts = request.parts();
    const fields = {};
    let pdfBuffer = null;

    for await (const part of parts) {
      if (part.type === 'file' && part.mimetype === 'application/pdf') {
        // Buffer the PDF in memory — do NOT write to disk
        pdfBuffer = await part.toBuffer();
      } else if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      }
    }

    if (!pdfBuffer) {
      return reply.status(400).send({ error: 'PDF statement is required' });
    }

    if (!fields.phone || !fields.businessName) {
      return reply.status(400).send({ error: 'phone and businessName are required' });
    }

    // Save lead to database
    const leadId = upsertLead({
      name: fields.name,
      businessName: fields.businessName,
      phone: fields.phone,
      email: fields.email || null,
      posSystem: fields.posSystem || null,
      estimatedVolume: fields.estimatedVolume || null,
      bestTimeToCall: fields.bestTimeToCall || null,
      status: 'statement_received',
      source: 'website',
    });

    // Run analysis in background — don't block the response
    reply.status(202).send({ success: true, leadId });

    // Continue processing after response is sent
    setImmediate(async () => {
      try {
        const { extractedStatement, comparison } = await analyzeStatement(pdfBuffer, fields);

        // Save analysis to database
        saveAnalysis(leadId, { extractedStatement, comparison });

        // Send savings report to merchant
        if (fields.email) {
          await sendSavingsReport({
            email: fields.email,
            ownerName: fields.name,
            comparison,
          });
        }

        // Send admin notification with full comparison
        await sendAdminNotification({
          leadData: { ...fields, leadId },
          comparison,
        });

        fastify.log.info({ leadId, action: comparison.recommendation.action }, 'Analysis complete');
      } catch (err) {
        fastify.log.error({ err, leadId }, 'Analysis pipeline failed');
      }
    });
  });

  /**
   * POST /api/statement/estimate
   * Quick savings estimate from call-extracted data (no statement required).
   * Used by Retell webhook and can be called directly for testing.
   *
   * Body: { current_processor, current_rate, monthly_volume }
   */
  fastify.post('/estimate', async (request, reply) => {
    const { current_processor, current_rate, monthly_volume } = request.body;

    if (!monthly_volume) {
      return reply.code(400).send({ error: 'monthly_volume is required' });
    }

    const { runCallEstimate } = await import('../services/estimate.js');
    const estimate = runCallEstimate({
      currentProcessor: current_processor,
      rawVolume: monthly_volume,
      rawRate: current_rate,
    });

    return reply.send(estimate);
  });

  /**
   * POST /api/statement/analyze
   * Internal endpoint — run comparison on pre-extracted data.
   * Not rate-limited; not exposed publicly.
   *
   * Body: { extractedStatement, posSystem, hardwarePreference }
   */
  fastify.post('/analyze', async (request, reply) => {
    // TODO: add internal auth if needed
    const { extractedStatement, posSystem, hardwarePreference } = request.body;

    if (!extractedStatement) {
      return reply.status(400).send({ error: 'extractedStatement is required' });
    }

    const { runComparison } = await import('../services/comparison.js');
    const comparison = runComparison(extractedStatement, posSystem || '', hardwarePreference);

    return comparison;
  });
}
