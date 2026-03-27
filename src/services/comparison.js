/**
 * Multi-processor rate comparison engine.
 *
 * Core algorithm:
 *   1. Load processor configs from data/processors/*.json
 *   2. Derive current total processing cost from extracted statement
 *   3. For each processor/tier, calculate the minimum monthly cost (floor cost)
 *   4. Calculate savings gap
 *   5. Apply dynamic margin (65/35, 70/30, or 75/25 based on volume)
 *   6. Calculate upfront income (signing bonus + advance + multiplier)
 *   7. Rank results and generate recommendation
 *
 * All calculations are synchronous — pure function (input → output).
 * No hardcoded rates. All rates come from data/processors/*.json.
 */

import { loadProcessors, flattenProcessorTiers } from './processors.js';
import { applyMargin, getMarginTier } from './margin.js';
import { classifyPOS, isProcessorCompatible } from './pos.js';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// STEP 2: Derive current total processing cost
// ---------------------------------------------------------------------------

/**
 * Calculate what the merchant is currently paying per month in processing fees.
 * ONLY includes processing fees — never platform fees (Toast SaaS, Clover software, etc.).
 *
 * @param {object} s — ExtractedStatement
 * @returns {{ cost: number, warnings: string[] }}
 */
export function deriveCurrentProcessingCost(s) {
  const { volume, interchange, processingFees, cardPresence } = s;
  const warnings = [];

  // Handle flat-rate processors that don't break out interchange
  if (!interchange.totalInterchangeFees || interchange.totalInterchangeFees === 0) {
    interchange.totalInterchangeFees = volume.totalVolume * 0.0175;
    warnings.push('Interchange estimated at 1.75% — flat-rate processor statement did not break it out');
  }

  let current = interchange.totalInterchangeFees;

  // Per-transaction auth fees
  if (processingFees.authFee != null && processingFees.authFee > 0) {
    current += processingFees.authFee * volume.totalTransactions;
  }

  // Batch fees (~30 batches/month)
  if (processingFees.batchFee != null && processingFees.batchFee > 0) {
    current += processingFees.batchFee * 30;
  }

  // AVS fees (only on CNP transactions)
  if (processingFees.avsFee != null && processingFees.avsFee > 0) {
    const cnpTransactions = volume.totalTransactions * (cardPresence.cardNotPresentPercent / 100);
    current += processingFees.avsFee * cnpTransactions;
  }

  // Monthly processing fees (statement fee, PCI fee, account fee, etc.)
  current += processingFees.totalMonthlyProcessingFees;

  // Markup rate (only if no per-transaction auth fee — e.g., flat-rate processor)
  if (
    processingFees.markupRate != null &&
    processingFees.markupRate > 0 &&
    (processingFees.authFee == null || processingFees.authFee === 0)
  ) {
    current += processingFees.markupRate * volume.totalVolume;
  }

  return { cost: round2(current), warnings };
}

// ---------------------------------------------------------------------------
// STEP 4: Calculate floor cost for one comparison entry
// ---------------------------------------------------------------------------

/**
 * Calculate the minimum monthly cost a merchant would pay with this processor/tier.
 * Every dollar matters — this drives the savings calculation.
 *
 * @param {object} entry — one flattened tier (with advanceScenario set)
 * @param {object} s — ExtractedStatement
 * @param {string} posCategory — merchant's POS category
 * @returns {{ floorCost: number, breakdown: object, warnings: string[] }}
 */
export function calculateFloorCost(entry, s, posCategory) {
  const { volume, interchange, cardPresence } = s;
  const warnings = [];

  // --- A. INTERCHANGE (pass-through, same for all processors) ---
  const interchangeCost = interchange.totalInterchangeFees;

  // --- B. BIN SPONSORSHIP (NOT splittable — pure pass-through cost) ---
  const binSponsorship = volume.totalVolume * entry.binSponsorshipRate;

  // --- C. AMEX BIN (calculated separately per tier) ---
  let amexBin = 0;
  if (entry.posPlacement && entry.posPlacementAmexBinRate != null) {
    // POS placement triggers higher AmEx BIN rate (e.g., EPI Option C: 0.30%)
    amexBin = volume.amexVolume * entry.posPlacementAmexBinRate;
  } else if (entry.amexBinRate != null) {
    amexBin = volume.amexVolume * entry.amexBinRate;
  } else {
    // null — processor doesn't separately quote AmEx BIN (Kurv case)
    amexBin = 0;
    if (volume.amexVolume > 0) {
      warnings.push('AmEx BIN not separately quoted by this processor — verify with rep');
    }
  }

  // --- D. AUTH FEES ---
  // Bank cards = Visa + MC + Discover
  const bankCardTransactions = volume.visaMcTransactions + volume.discoverTransactions;
  const bankCardAuthFees = bankCardTransactions * entry.authFee;

  // AmEx uses amexAuthFee if specified, otherwise falls back to authFee
  const amexAuthRate = entry.amexAuthFee ?? entry.authFee;
  const amexAuthFees = volume.amexTransactions * amexAuthRate;

  // --- E. BATCH FEES (~1 batch per day = ~30/month) ---
  const batchFees = 30 * (entry.batchFee ?? 0);

  // --- F. AVS FEES (only on card-not-present transactions) ---
  const cnpTransactions = volume.totalTransactions * (cardPresence.cardNotPresentPercent / 100);
  const avsFees = cnpTransactions * (entry.avsFee ?? 0);

  // --- G. PIN DEBIT FEES ---
  const pinDebitFees = volume.debitTransactions * (entry.pinDebitFee ?? 0);

  // --- H. MONTHLY FEES (with conditional evaluation) ---
  let monthlyFeesTotal = 0;
  const includedFees = [];
  const excludedFees = [];

  for (const fee of (entry.monthlyFees || [])) {
    if (fee.conditional == null) {
      // No condition — always include
      monthlyFeesTotal += fee.amount;
      includedFees.push(fee);
    } else {
      const cond = fee.conditional.toLowerCase();

      if (cond.includes('only if clover') || cond.includes('only if merchant uses clover')) {
        if (posCategory === 'clover') {
          monthlyFeesTotal += fee.amount;
          includedFees.push(fee);
        } else {
          excludedFees.push({ ...fee, reason: 'Merchant not on Clover' });
        }
      } else {
        // Unknown conditional — include for safety (don't underquote)
        monthlyFeesTotal += fee.amount;
        includedFees.push(fee);
        warnings.push(`Unknown conditional "${fee.conditional}" on fee "${fee.name}" — included for safety`);
      }
    }
  }

  // --- I. ADVANCE FEE (if with_advance scenario) ---
  let advanceFee = 0;
  if (entry.advanceScenario === 'with_advance' && entry.advance) {
    advanceFee = entry.advance.requirements.monthlyFee;
    monthlyFeesTotal += advanceFee;
  }

  // --- FLOOR COST ---
  const floorCost = interchangeCost
    + binSponsorship
    + amexBin
    + bankCardAuthFees
    + amexAuthFees
    + batchFees
    + avsFees
    + pinDebitFees
    + monthlyFeesTotal;

  return {
    floorCost,
    breakdown: {
      interchange: interchangeCost,
      binSponsorship,
      amexBin,
      bankCardAuthFees,
      amexAuthFees,
      batchFees,
      avsFees,
      pinDebitFees,
      monthlyFeesTotal,
      advanceFee,
      includedMonthlyFees: includedFees,
      excludedMonthlyFees: excludedFees,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// STEP 7: Calculate upfront income
// ---------------------------------------------------------------------------

/**
 * Calculate total upfront income for a comparison entry.
 *
 * @param {object} entry
 * @param {number} estimatedFirstMonthResidual — our monthly residual
 * @returns {{ signingBonus: number, advanceAmount: number, multiplierValue: number, totalUpfront: number }}
 */
export function calculateUpfront(entry, estimatedFirstMonthResidual) {
  const signingBonus = entry.signingBonus ?? 0;

  // Advance (only in with_advance scenario)
  let advanceAmount = 0;
  if (entry.advanceScenario === 'with_advance' && entry.advance) {
    advanceAmount = entry.advance.amount;
  }

  // Multiplier: factor × first month residual, minus signing bonus, capped and floored
  let multiplierValue = 0;
  if (entry.multiplier) {
    let raw = entry.multiplier.factor * estimatedFirstMonthResidual;

    // Subtract upfront bonus already received
    raw -= signingBonus;

    // Apply cap
    if (entry.multiplier.cap != null) {
      raw = Math.min(raw, entry.multiplier.cap);
    }

    // Apply floor
    if (entry.multiplier.floor != null) {
      raw = Math.max(raw, entry.multiplier.floor);
    }

    // Multiplier can't go negative
    multiplierValue = Math.max(0, raw);
  }

  return {
    signingBonus,
    advanceAmount,
    multiplierValue: round2(multiplierValue),
    totalUpfront: round2(signingBonus + advanceAmount + multiplierValue),
  };
}

// ---------------------------------------------------------------------------
// STEP 8: Assemble one comparison result
// ---------------------------------------------------------------------------

/**
 * Run comparison for a single entry against a statement.
 *
 * @param {object} entry
 * @param {object} statement — ExtractedStatement
 * @param {number} currentCost — from deriveCurrentProcessingCost()
 * @param {string} posCategory
 * @param {string} difficulty
 * @returns {object} ProcessorComparison
 */
function compareOneEntry(entry, statement, currentCost, posCategory, difficulty) {
  const { floorCost, breakdown, warnings } = calculateFloorCost(entry, statement, posCategory);

  const savingsGap = currentCost - floorCost;
  const { merchantSavings, ourResidual, marginLabel } = applyMargin(
    savingsGap,
    statement.volume.totalVolume
  );

  const proposedMerchantCost = floorCost + ourResidual;
  const upfront = calculateUpfront(entry, ourResidual);

  return {
    processorId: entry.processorId,
    processorName: entry.processorName,
    tierId: entry.tierId,
    tierName: entry.tierName,
    advanceScenario: entry.advanceScenario,

    // Costs
    currentCost: round2(currentCost),
    floorCost: round2(floorCost),
    proposedCost: round2(proposedMerchantCost),
    breakdown,

    // Pass-through (not in margin calc)
    binSponsorshipCost: round2(breakdown.binSponsorship + breakdown.amexBin),

    // Savings
    savingsGap: round2(savingsGap),
    merchantSavings: round2(merchantSavings),
    merchantSavingsAnnual: round2(merchantSavings * 12),
    ourResidual: round2(ourResidual),
    marginLabel,

    // Upfront
    ...upfront,

    // Compatibility
    posCompatible: true, // only compatible entries reach this function
    difficulty,

    // Warnings
    warnings,

    // Ranking flags (set in STEP 9)
    bestForMerchant: false,
    bestResidual: false,
    bestUpfront: false,
  };
}

// ---------------------------------------------------------------------------
// Recommendation helpers
// ---------------------------------------------------------------------------

function buildFeesEliminated(statement) {
  return statement.processingFees.monthlyFees.map(f => ({
    name: f.name,
    amount: f.amount,
  }));
}

function buildFeesThatStay(statement) {
  const fees = [];

  for (const pf of statement.platformFees) {
    fees.push({
      name: pf.name,
      amount: pf.amount,
      note: 'Platform fee — not affected by processor switch',
    });
  }

  if (statement.otherFees.chargebackFee) {
    fees.push({
      name: 'Chargeback Fee',
      amount: statement.otherFees.chargebackFee,
      note: 'Per-incident fee — exists with all processors',
    });
  }

  if (statement.otherFees.retrievalFee) {
    fees.push({
      name: 'Retrieval Fee',
      amount: statement.otherFees.retrievalFee,
      note: 'Per-incident fee — exists with all processors',
    });
  }

  return fees;
}

function buildNewFees(bestEntry) {
  return (bestEntry.breakdown.includedMonthlyFees || []).map(f => ({
    name: f.name,
    amount: f.amount,
  }));
}

// ---------------------------------------------------------------------------
// STEP 10: Generate recommendation
// ---------------------------------------------------------------------------

function generateRecommendation(results, statement, posCategory, difficulty) {
  // No compatible processors or all savings are negative
  if (results.length === 0 || results.every(r => r.savingsGap <= 0)) {
    return {
      action: 'NO_SWITCH',
      processorId: null,
      tierId: null,
      monthlySavings: 0,
      annualSavings: 0,
      ourMonthlyResidual: 0,
      upfrontIncome: 0,
      difficulty,
      reason: 'No processor can beat the current rates. Merchant is already well-priced.',
      posFlag: null,
      posFlagMessage: null,
      feesEliminated: [],
      feesThatStay: buildFeesThatStay(statement),
      newFees: [],
    };
  }

  const best = results[0]; // already sorted by merchantSavings descending

  // Below $50/month savings threshold — not worth the disruption
  if (best.merchantSavings < 50) {
    return {
      action: 'NO_SWITCH',
      processorId: best.processorId,
      tierId: best.tierId,
      monthlySavings: best.merchantSavings,
      annualSavings: best.merchantSavingsAnnual,
      ourMonthlyResidual: best.ourResidual,
      upfrontIncome: best.totalUpfront,
      difficulty,
      reason: `Best savings of $${best.merchantSavings.toFixed(2)}/month is below $50 threshold. Not worth the disruption.`,
      posFlag: null,
      posFlagMessage: null,
      feesEliminated: [],
      feesThatStay: buildFeesThatStay(statement),
      newFees: [],
    };
  }

  // Locked POS with less than $500/month processing-only savings
  if (posCategory === 'locked' && best.merchantSavings < 500) {
    return {
      action: 'NEGOTIATE_EXISTING',
      processorId: best.processorId,
      tierId: best.tierId,
      monthlySavings: best.merchantSavings,
      annualSavings: best.merchantSavingsAnnual,
      ourMonthlyResidual: best.ourResidual,
      upfrontIncome: best.totalUpfront,
      difficulty: 'HARD',
      reason: `Merchant has locked POS (${statement.merchant.posSystem}). Savings of $${best.merchantSavings.toFixed(2)}/month doesn't justify switching entire POS ecosystem. Recommend negotiating with current processor.`,
      posFlag: null,
      posFlagMessage: null,
      feesEliminated: [],
      feesThatStay: buildFeesThatStay(statement),
      newFees: [],
    };
  }

  // Standard recommendation — SWITCH
  return {
    action: 'SWITCH',
    processorId: best.processorId,
    tierId: best.tierId,
    advanceScenario: best.advanceScenario,
    monthlySavings: best.merchantSavings,
    annualSavings: best.merchantSavingsAnnual,
    ourMonthlyResidual: best.ourResidual,
    upfrontIncome: best.totalUpfront,
    difficulty,
    reason: `Switch to ${best.processorName} (${best.tierName}). Saves merchant $${best.merchantSavings.toFixed(2)}/month ($${best.merchantSavingsAnnual.toFixed(2)}/year).`,
    posFlag: posCategory === 'locked' ? 'HARDWARE_SWAP_REQUIRED' : null,
    posFlagMessage: posCategory === 'locked' ? `Merchant must replace existing hardware. Confirm they understand before proceeding.` : null,
    feesEliminated: buildFeesEliminated(statement),
    feesThatStay: buildFeesThatStay(statement),
    newFees: buildNewFees(best),
  };
}

// ---------------------------------------------------------------------------
// Debit savings highlight
// ---------------------------------------------------------------------------

/**
 * Calculate debit card overpayment to highlight in the pitch.
 * Regulated debit interchange (Durbin) is ~$0.21 + 0.05% per transaction.
 * Flat-rate processors (Square/Stripe) charge 2.6%+ regardless.
 *
 * @param {object} statement — ExtractedStatement
 * @returns {object|null}
 */
export function calculateDebitSavingsHighlight(statement) {
  const { debitVolume, debitTransactions } = statement.volume;

  if (debitTransactions === 0 || debitVolume === 0) {
    return null;
  }

  const avgDebitTicket = debitVolume / debitTransactions;

  // Regulated debit cost per transaction (Durbin)
  const regulatedCostPerTxn = 0.21 + (avgDebitTicket * 0.0005);

  // Effective rate from statement
  const effectiveRate = statement.interchange.effectiveInterchangeRate || 0.026;
  const currentCostPerTxn = avgDebitTicket * effectiveRate;

  const overpaymentPerTxn = currentCostPerTxn - regulatedCostPerTxn;
  const monthlyDebitOverpayment = overpaymentPerTxn * debitTransactions;

  // Only highlight if meaningful (over $20/month)
  if (monthlyDebitOverpayment < 20) return null;

  return {
    debitVolume,
    debitTransactions,
    avgDebitTicket: round2(avgDebitTicket),
    regulatedCostPerTxn: round2(regulatedCostPerTxn),
    currentCostPerTxn: round2(currentCostPerTxn),
    overpaymentPerTxn: round2(overpaymentPerTxn),
    monthlyOverpayment: round2(monthlyDebitOverpayment),
    annualOverpayment: round2(monthlyDebitOverpayment * 12),
    pitch: `You're overpaying $${round2(overpaymentPerTxn)} on every debit card transaction — that's $${round2(monthlyDebitOverpayment)}/month in debit charges alone.`,
  };
}

// ---------------------------------------------------------------------------
// FAQ gate — filter processors that can't satisfy 01payments merchant promises
// ---------------------------------------------------------------------------

/**
 * Check if a processor passes the 01payments FAQ requirements for this merchant.
 * Fields can be: true, false, or 'unconfirmed' (treated as passing — don't block).
 *
 * @param {object} processor
 * @param {string} posCategory
 * @returns {boolean}
 */
function passesFaqGate(processor, posCategory) {
  const faq = processor.faq;
  if (!faq) return true; // no FAQ data = don't block (legacy config)

  if (faq.no_contract === false) return false;
  if (faq.no_setup_fee === false) return false;
  if (faq.same_day_approval === false) return false;
  if (faq.live_3_to_5_days === false) return false;

  // Free terminal: required unless merchant already has compatible equipment
  // 'open' = Pax/Dejavoo/etc can be reprogrammed; 'standalone' = virtual terminal
  if (faq.free_terminal === false && posCategory !== 'open' && posCategory !== 'standalone') {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Month-to-month rules — all merchants are boarded month-to-month (no ETF)
// ---------------------------------------------------------------------------

/**
 * Apply month-to-month boarding rules to flattened entries.
 * - EPI Options B and D: multiplier bonus is LOST without ETF — zero it out
 * - Beacon Traditional with_advance: HIGH clawback risk — remove advance scenario
 *
 * @param {object[]} entries — from flattenProcessorTiers()
 * @returns {object[]}
 */
function applyMonthToMonthRules(entries) {
  return entries
    .map(entry => {
      // EPI Options B and D: multiplier requires ETF — not available month-to-month
      if (entry.processorId === 'epi' && ['B', 'D'].includes(entry.tierId)) {
        return { ...entry, multiplier: null };
      }
      return entry;
    })
    // Beacon Traditional with_advance: advance is clawed back if merchant leaves < 365 days
    // Month-to-month = merchant can leave anytime = high clawback risk — remove this scenario
    .filter(entry => !(
      entry.processorId === 'beacon' &&
      entry.tierId === 'cardconnect' &&
      entry.advanceScenario === 'with_advance'
    ));
}

// ---------------------------------------------------------------------------
// STEP 9: Main orchestration + ranking
// ---------------------------------------------------------------------------

/**
 * Run the full comparison engine.
 *
 * @param {object} statement — ExtractedStatement (output of Claude API extraction)
 * @param {string} merchantPosSystem — merchant's current POS (from form or extraction)
 * @param {string} hardwarePreference — 'keep' | 'open_to_switch' | 'wants_new'
 * @returns {object} ComparisonResult
 */
export function runComparison(statement, merchantPosSystem, hardwarePreference = 'open_to_switch') {
  // Step 1: Load processors
  const processors = loadProcessors();

  // Step 3: Determine POS compatibility (moved up — needed for FAQ gate)
  const { category: posCategory, difficulty } = classifyPOS(merchantPosSystem);

  // Early exit: processor-locked POS (Toast, Heartland) — cannot switch processors at all
  if (posCategory === 'processorLocked') {
    const { cost: lockedCurrentCost, warnings: lockedWarnings } = deriveCurrentProcessingCost(statement);
    return {
      merchantName: statement.merchant.businessName,
      currentProcessor: statement.merchant.currentProcessor,
      currentCost: round2(lockedCurrentCost),
      totalVolume: statement.volume.totalVolume,
      posCategory,
      difficulty,
      hardwarePreference,
      marginLabel: null,
      comparisons: [],
      recommendation: {
        action: 'LOCKED_ECOSYSTEM',
        processorId: null,
        tierId: null,
        monthlySavings: 0,
        annualSavings: 0,
        ourMonthlyResidual: 0,
        upfrontIncome: 0,
        difficulty: 'IMPOSSIBLE',
        reason: `${statement.merchant.posSystem || 'Current POS'} bundles payment processing with the POS — cannot switch processors without replacing the entire system.`,
        posFlag: 'LOCKED_ECOSYSTEM',
        feesEliminated: [],
        feesThatStay: [],
        newFees: [],
      },
      debitSavingsHighlight: null,
      warnings: lockedWarnings,
    };
  }

  // Apply FAQ gate — filter processors that can't satisfy merchant promises
  const faqEligible = processors.filter(p => passesFaqGate(p, posCategory));

  // Flatten tiers and apply month-to-month rules
  const allEntries = flattenProcessorTiers(faqEligible);
  const entries = applyMonthToMonthRules(allEntries);

  // Step 2: Derive current total processing cost
  const { cost: currentCost, warnings: costWarnings } = deriveCurrentProcessingCost(statement);

  // Filter to compatible processors
  const compatibleEntries = entries.filter(e => isProcessorCompatible(e, posCategory));

  // Step 4-8: Run comparison for each compatible entry
  const results = compatibleEntries.map(entry =>
    compareOneEntry(entry, statement, currentCost, posCategory, difficulty)
  );

  // Step 8: Sort by merchant savings descending
  results.sort((a, b) => b.merchantSavings - a.merchantSavings);

  // Set ranking flags
  if (results.length > 0) {
    // Best for merchant = highest merchantSavings
    const bestMerchant = results.reduce((best, r) =>
      r.merchantSavings > best.merchantSavings ? r : best
    );
    bestMerchant.bestForMerchant = true;

    // Best residual for us = highest ourResidual
    const bestResidual = results.reduce((best, r) =>
      r.ourResidual > best.ourResidual ? r : best
    );
    bestResidual.bestResidual = true;

    // Best upfront = highest totalUpfront
    const bestUpfront = results.reduce((best, r) =>
      r.totalUpfront > best.totalUpfront ? r : best
    );
    bestUpfront.bestUpfront = true;
  }

  // Step 10: Generate recommendation
  const recommendation = generateRecommendation(results, statement, posCategory, difficulty);

  return {
    merchantName: statement.merchant.businessName,
    currentProcessor: statement.merchant.currentProcessor,
    currentCost: round2(currentCost),
    totalVolume: statement.volume.totalVolume,
    posCategory,
    difficulty,
    hardwarePreference,
    marginLabel: getMarginTier(statement.volume.totalVolume).label,
    comparisons: results,
    recommendation,
    debitSavingsHighlight: calculateDebitSavingsHighlight(statement),
    warnings: costWarnings,
  };
}
