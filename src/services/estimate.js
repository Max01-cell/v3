/**
 * Build a savings estimate from call-extracted data (no statement required).
 *
 * Uses synthetic volume/card-mix assumptions to run the comparison engine
 * and produce estimated savings numbers for the post-call follow-up email.
 */

import { runComparison } from './comparison.js';

// Assumed average ticket size — used for per-transaction fee → effective rate conversion
const AVG_TICKET = 50;

// ---------------------------------------------------------------------------
// Processor default rates (used when merchant didn't share their rate on call)
// Verified March 2026. Each entry is { pct, perTxn } for card-present.
// Effective all-in rate = pct + (perTxn / AVG_TICKET).
// ---------------------------------------------------------------------------

const PROCESSOR_RATES = {
  // Square overhauled pricing Oct 2025: raised per-txn from $0.10 → $0.15
  'square':         { pct: 0.026,  perTxn: 0.15 },
  'stripe':         { pct: 0.027,  perTxn: 0.05 },
  'paypal':         { pct: 0.0229, perTxn: 0.09 },
  'zettle':         { pct: 0.0229, perTxn: 0.09 },
  // Clover paid-plan rate (most merchants are on a paid plan)
  'clover':         { pct: 0.023,  perTxn: 0.10 },
  // Toast standard plan (paid hardware upfront)
  'toast':          { pct: 0.0249, perTxn: 0.15 },
  'shopify':        { pct: 0.026,  perTxn: 0.10 },
  // Bank processors (card-present swiped rate)
  'bank of america': { pct: 0.0265, perTxn: 0.10 },
  'bofa':           { pct: 0.0265, perTxn: 0.10 },
  'chase':          { pct: 0.025,  perTxn: 0.10 },
  'wells fargo':    { pct: 0.026,  perTxn: 0.15 },
  // ISO/acquirer processors — blended all-in estimates (no standard per-txn published)
  'heartland':      { pct: 0.024,  perTxn: 0.00 },
  'global payments': { pct: 0.024, perTxn: 0.00 },
  'fiserv':         { pct: 0.025,  perTxn: 0.00 },
  'first data':     { pct: 0.025,  perTxn: 0.00 },
  'worldpay':       { pct: 0.027,  perTxn: 0.30 },
  'elavon':         { pct: 0.023,  perTxn: 0.00 },
  'tsys':           { pct: 0.025,  perTxn: 0.00 },
  'transfirst':     { pct: 0.025,  perTxn: 0.00 },
  'gravity':        { pct: 0.025,  perTxn: 0.10 },
  // Membership/subscription models — effective all-in for card-present
  'stax':           { pct: 0.020,  perTxn: 0.08 },
  'fattmerchant':   { pct: 0.020,  perTxn: 0.08 },
  'payment depot':  { pct: 0.022,  perTxn: 0.07 },
  // Higher-rate processors
  'paysafe':        { pct: 0.030,  perTxn: 0.00 },
};

// Generic fallback for processors we don't have data on
const GENERIC_DEFAULT = { pct: 0.027, perTxn: 0.10 };

function getDefaultRate(processorName) {
  if (!processorName) return GENERIC_DEFAULT.pct + GENERIC_DEFAULT.perTxn / AVG_TICKET;
  const key = processorName.toLowerCase().trim();
  for (const [name, { pct, perTxn }] of Object.entries(PROCESSOR_RATES)) {
    if (key.includes(name)) return pct + perTxn / AVG_TICKET;
  }
  return GENERIC_DEFAULT.pct + GENERIC_DEFAULT.perTxn / AVG_TICKET;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

// Strip hedging qualifiers before parsing: "a little below seventy five" → "seventy five"
const QUALIFIER_RE = /\b(a\s+little\s+|just\s+|about\s+|around\s+|approximately\s+|roughly\s+|maybe\s+|close\s+to\s+|nearly\s+|almost\s+)(over\s+|under\s+|above\s+|below\s+|less\s+than\s+|more\s+than\s+)*/gi;

// English word → number map for spoken volume inputs
const WORD_NUMS = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
  sixteen:16, seventeen:17, eighteen:18, nineteen:19,
  twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
  hundred:100, thousand:1000, million:1000000,
};

function wordToNumber(s) {
  const words = s.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  let total = 0;
  let current = 0;
  for (const w of words) {
    const v = WORD_NUMS[w];
    if (v == null) continue;
    if (v === 100)         { current = (current || 1) * 100; }
    else if (v >= 1000)    { total += (current || 1) * v; current = 0; }
    else                   { current += v; }
  }
  total += current;
  return total > 0 ? total : null;
}

/**
 * Parse a volume string to a dollar amount.
 * Handles: "$50,000" | "50k" | "50000" | "seventy five" | "a little below seventy five"
 * Numbers under 1000 with no explicit unit are treated as thousands (payment processing context).
 */
function parseVolume(raw) {
  if (!raw) return null;

  // Strip qualifiers first
  const stripped = String(raw).replace(QUALIFIER_RE, '').trim();

  // Numeric parsing: $50,000 | 50k | 50m | 50000
  const cleaned = stripped.replace(/[$,\s]/g, '').toLowerCase();
  if (cleaned.endsWith('k')) { const n = parseFloat(cleaned); if (!isNaN(n)) return n * 1000; }
  if (cleaned.endsWith('m')) { const n = parseFloat(cleaned); if (!isNaN(n)) return n * 1_000_000; }
  const numeric = parseFloat(cleaned);
  if (!isNaN(numeric) && numeric > 0) return numeric < 1000 ? numeric * 1000 : numeric;

  // Word-to-number fallback: "seventy five" → 75 → 75000
  const fromWords = wordToNumber(stripped);
  if (fromWords) return fromWords < 1000 ? fromWords * 1000 : fromWords;

  return null;
}

/**
 * Parse a rate string like "2.7%", "2.7", "2.65% + $0.10" → decimal (0.027).
 * Returns null if no valid number found (e.g. "I don't know").
 */
function parseRate(raw) {
  if (!raw) return null;
  const match = String(raw).match(/[\d.]+/);
  if (!match) return null;
  let n = parseFloat(match[0]);
  if (isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

/**
 * Get a display label for the rate used in the estimate.
 * If merchant provided their rate, show it. If we defaulted, show the assumed rate.
 */
function getDisplayRate(rawRate, effectiveRate, processorName) {
  if (parseRate(rawRate) !== null) return rawRate; // merchant provided it
  const pct = (effectiveRate * 100).toFixed(1);
  const label = processorName ? `${processorName} est.` : 'est.';
  return `~${pct}% (${label})`;
}

// ---------------------------------------------------------------------------
// Synthetic statement
// ---------------------------------------------------------------------------

const CARD_MIX = { visaMc: 0.65, amex: 0.10, discover: 0.10, debit: 0.15 };
const CNP_PERCENT = 10;

// Blended card-present interchange estimate (Visa/MC/Discover average).
// Split from effectiveRate so the comparison engine can correctly model
// processor markup (what Square/Stripe keep above interchange) as the savings target.
const ESTIMATED_INTERCHANGE = 0.018;

function buildSyntheticStatement({ volume, effectiveRate, businessName, currentProcessor, posSystem }) {
  const totalTransactions    = Math.round(volume / AVG_TICKET);
  const visaMcTransactions   = Math.round(totalTransactions * CARD_MIX.visaMc);
  const amexTransactions     = Math.round(totalTransactions * CARD_MIX.amex);
  const discoverTransactions = Math.round(totalTransactions * CARD_MIX.discover);
  const debitTransactions    = Math.round(totalTransactions * CARD_MIX.debit);
  const amexVolume           = volume * CARD_MIX.amex;
  const debitVolume          = volume * CARD_MIX.debit;

  // Processor markup = what the flat-rate processor keeps above true interchange.
  // This is the savings target — the comparison engine can beat it with ISO rates.
  const processorMarkup = Math.max(0, effectiveRate - ESTIMATED_INTERCHANGE);

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
      // Pass-through interchange cost — same for all processors, not the savings target
      totalInterchangeFees:     volume * ESTIMATED_INTERCHANGE,
      effectiveInterchangeRate: ESTIMATED_INTERCHANGE,
    },
    processingFees: {
      authFee:                    null,
      batchFee:                   null,
      avsFee:                     null,
      markupRate:                 processorMarkup,  // applied as volume-based fee in cost derivation
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
  const volume = parseVolume(rawVolume);
  if (!volume) {
    return { canEstimate: false, monthlySavings: null, annualSavings: null, savingsExplanation: null, formattedVolume: null, displayRate: null };
  }

  const effectiveRate  = parseRate(rawRate) ?? getDefaultRate(currentProcessor);
  const formattedVolume = `$${volume.toLocaleString()}`;
  const displayRate     = getDisplayRate(rawRate, effectiveRate, currentProcessor);

  try {
    const statement  = buildSyntheticStatement({ volume, effectiveRate, businessName, currentProcessor, posSystem: 'unknown' });
    const comparison = runComparison(statement, 'unknown', 'open_to_switch');
    const rec        = comparison.recommendation;
    const canEstimate = rec.action === 'SWITCH';

    return {
      canEstimate,
      monthlySavings:     canEstimate ? `$${rec.monthlySavings.toFixed(0)}` : null,
      annualSavings:      canEstimate ? `$${rec.annualSavings.toFixed(0)}`  : null,
      savingsExplanation: buildSavingsExplanation(comparison),
      formattedVolume,
      displayRate,
    };
  } catch (err) {
    return { canEstimate: false, monthlySavings: null, annualSavings: null, savingsExplanation: null, formattedVolume, displayRate };
  }
}
