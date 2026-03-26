/**
 * Statement analysis service.
 * Sends PDF to Claude API for structured extraction, then runs comparison engine.
 *
 * TODO: Implement full extraction pipeline.
 */

import Anthropic from '@anthropic-ai/sdk';
import { runComparison } from './comparison.js';

const anthropic = new Anthropic();

const EXTRACTION_PROMPT = `You are a payment processing statement analyzer. Extract the following from this merchant processing statement.

Return ONLY valid JSON matching the schema below. If a field is not found, use null. Do not guess.

EXTRACT:

MERCHANT INFO:
- Business name
- MID (Merchant ID)
- Current processor name
- Statement period (month/year)
- POS system / terminal (if identifiable)

VOLUME:
- Total Visa/MC volume ($)
- Total Visa/MC transactions (#)
- Total AmEx volume ($)
- Total AmEx transactions (#)
- Total Discover volume ($)
- Total Discover transactions (#)
- Total debit volume ($)
- Total debit transactions (#)
- Total volume ($)
- Total transactions (#)
- Average ticket ($)

INTERCHANGE:
- Total interchange fees ($)
- Effective interchange rate (%)

PROCESSING FEES (charged by processor — these are what we compete on):
- Markup rate / discount rate (% above interchange)
- Per-transaction auth fee ($)
- Batch fee ($)
- AVS fee ($)
- Monthly/annual fees ($) — list each: statement fee, account fee, PCI fee, breach protection, monthly minimum, etc.

PLATFORM FEES (charged by POS/software — NOT what we compete on):
- Software subscription (e.g., Toast SaaS fee, Clover software)
- Hardware lease
- Any fee tied to specific POS platform, not the processor

OTHER FEES:
- Chargeback fee ($)
- Retrieval fee ($)
- Early termination fee (if mentioned)

CARD-PRESENT vs CARD-NOT-PRESENT:
- Percentage of transactions that are card-present (swiped/dipped/tapped)
- Percentage that are card-not-present (keyed/online)

Return the result in this exact JSON shape:
{
  "merchant": { "businessName": "", "mid": null, "currentProcessor": null, "statementPeriod": null, "posSystem": null },
  "volume": { "visaMcVolume": 0, "visaMcTransactions": 0, "amexVolume": 0, "amexTransactions": 0, "discoverVolume": 0, "discoverTransactions": 0, "debitVolume": 0, "debitTransactions": 0, "totalVolume": 0, "totalTransactions": 0, "averageTicket": 0 },
  "interchange": { "totalInterchangeFees": 0, "effectiveInterchangeRate": 0 },
  "processingFees": { "markupRate": null, "authFee": null, "batchFee": null, "avsFee": null, "monthlyFees": [], "totalMonthlyProcessingFees": 0 },
  "platformFees": [],
  "otherFees": { "chargebackFee": null, "retrievalFee": null, "earlyTerminationFee": null },
  "cardPresence": { "cardPresentPercent": 100, "cardNotPresentPercent": 0 }
}`;

/**
 * Extract structured data from a PDF statement using Claude API.
 *
 * @param {string} pdfBase64 — base64-encoded PDF
 * @returns {object} ExtractedStatement
 */
export async function extractStatement(pdfBase64) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64,
          },
        },
        {
          type: 'text',
          text: EXTRACTION_PROMPT,
        },
      ],
    }],
  });

  const text = response.content[0].text;

  // Strip markdown code fences if Claude wraps in ```json ... ```
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  return JSON.parse(jsonMatch[1].trim());
}

/**
 * Full analysis pipeline: extract statement + run comparison.
 *
 * @param {Buffer} pdfBuffer
 * @param {object} leadData — { posSystem, estimatedVolume, ... }
 * @returns {{ extractedStatement, comparison }}
 */
export async function analyzeStatement(pdfBuffer, leadData) {
  const pdfBase64 = pdfBuffer.toString('base64');

  const extractedStatement = await extractStatement(pdfBase64);

  // Use posSystem from form if extraction didn't find one
  const posSystem = extractedStatement.merchant.posSystem || leadData.posSystem || '';

  const comparison = runComparison(extractedStatement, posSystem, 'open_to_switch');

  return { extractedStatement, comparison };
}
