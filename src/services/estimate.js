/**
 * Build a savings estimate from call-extracted data (no statement required).
 *
 * Uses synthetic volume/card-mix assumptions to run the comparison engine
 * and produce estimated savings numbers for the post-call follow-up email.
 */

import { runComparison } from './comparison.js';

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parse a volume string like "$50,000", "50k", "50K", "50000" → number.
 */
function parseVolume(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[$,\s]/g, '').toLowerCase();
  if (s.endsWith('k')) return parseFloat(s) * 1000;
  if (s.endsWith('m')) return parseFloat(s) * 1_000_000;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse a rate string like "2.7%", "2.7", "2.65% + $0.10" → decimal (0.027).
 * Takes the first numeric value found and treats it as a percentage if > 1.
 */
function parseRate(raw) {
  if (!raw) return null;
  const match = String(raw).match(/[\d.]+/);
  if (!match) return null;
  let n = parseFloat(match[0]);
  if (isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

// ---------------------------------------------------------------------------
// Synthetic statement
// ---------------------------------------------------------------------------

// Reasonable defaults for a merchant we haven't seen a statement from
const AVG_TICKET = 50;
const CARD_MIX = { visaMc: 0.65, amex: 0.10, discover: 0.10, debit: 0.15 };
const CNP_PERCENT = 10;

function buildSyntheticStatement({ volume, effectiveRate, businessName, currentProcessor, posSystem }) {
  const totalTransactions   = Math.round(volume / AVG_TICKET);
  const visaMcTransactions  = Math.round(totalTransactions * CARD_MIX.visaMc);
  const amexTransactions    = Math.round(totalTransactions * CARD_MIX.amex);
  const discoverTransactions = Math.round(totalTransactions * CARD_MIX.discover);
  const debitTransactions   = Math.round(totalTransactions * CARD_MIX.debit);
  const amexVolume          = volume * CARD_MIX.amex;
  const debitVolume         = volume * CARD_MIX.debit;

  return {
    merchant: {
      businessName:     businessName     || 'Merchant',
      currentProcessor: currentProcessor || 'Unknown',
      posSystem:        posSystem        || 'unknown',
    },
    volume: {
      totalVolume:          volume,
      totalTransactions,
      visaMcTransactions,
      discoverTransactions,
      amexTransactions,
      debitTransactions,
      amexVolume,
      debitVolume,
    },
    interchange: {
      totalInterchangeFees:      volume * effectiveRate,
      effectiveInterchangeRate:  effectiveRate,
    },
    processingFees: {
      authFee:                    null,
      batchFee:                   null,
      avsFee:                     null,
      markupRate:                 null,
      totalMonthlyProcessingFees: 0,
      monthlyFees:                [],
    },
    cardPresence: { cardNotPresentPercent: CNP_PERCENT },
    platformFees: [],
    otherFees:    {},
  };
}

// ---------------------------------------------------------------------------
// Savings explanation
// ---------------------------------------------------------------------------

function buildSavingsExplanation(comparison) {
  const best = comparison.comparisons.find(c => c.bestForMerchant) || comparison.comparisons[0];
  const rec  = comparison.recommendation;

  if (!best || rec.action !== 'SWITCH') {
    return "Based on the numbers you shared, you're already in a competitive range. Once we see your actual statement we can give you the exact picture — there may be line-item fees we can still eliminate.";
  }

  const currentRatePct  = ((comparison.currentCost / comparison.totalVolume) * 100).toFixed(2);
  const proposedRatePct = ((best.proposedCost / comparison.totalVolume) * 100).toFixed(2);

  return `Your current effective rate is around ${currentRatePct}%. Through one of our processing partners we can get that down to approximately ${proposedRatePct}% — a difference of $${best.merchantSavings.toFixed(0)}/month based on your volume. The switch takes about 10 minutes and there's zero downtime to your business.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run a savings estimate from call-extracted data.
 *
 * @param {{ businessName, currentProcessor, posSystem, rawVolume, rawRate }} params
 * @returns {{ canEstimate: boolean, monthlySavings: string|null, annualSavings: string|null, savingsExplanation: string|null }}
 */
export function runCallEstimate({ businessName, currentProcessor, rawVolume, rawRate }) {
  const volume        = parseVolume(rawVolume);
  const effectiveRate = parseRate(rawRate);

  if (!volume || !effectiveRate) {
    return { canEstimate: false, monthlySavings: null, annualSavings: null, savingsExplanation: null };
  }

  try {
    const statement  = buildSyntheticStatement({ volume, effectiveRate, businessName, currentProcessor, posSystem: 'unknown' });
    const comparison = runComparison(statement, 'unknown', 'open_to_switch');
    const rec        = comparison.recommendation;
    const canEstimate = rec.action === 'SWITCH';

    return {
      canEstimate,
      monthlySavings:    canEstimate ? `$${rec.monthlySavings.toFixed(0)}` : null,
      annualSavings:     canEstimate ? `$${rec.annualSavings.toFixed(0)}`  : null,
      savingsExplanation: buildSavingsExplanation(comparison),
    };
  } catch (err) {
    return { canEstimate: false, monthlySavings: null, annualSavings: null, savingsExplanation: null };
  }
}
