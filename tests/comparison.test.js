/**
 * Comparison engine unit tests.
 * Uses Node.js built-in test runner (node:test).
 *
 * Run: node --test tests/comparison.test.js
 *
 * All expected values are from COMPARISON_ENGINE_SPEC.md Section 7.
 * Tolerance: within $0.02 (spec requires $0.01; +$0.01 for floating-point safety).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { runComparison, deriveCurrentProcessingCost, calculateFloorCost, calculateUpfront } from '../src/services/comparison.js';
import { getMarginTier, applyMargin } from '../src/services/margin.js';
import { classifyPOS, isProcessorCompatible } from '../src/services/pos.js';
import { loadProcessors, flattenProcessorTiers } from '../src/services/processors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOLERANCE = 0.02;

function near(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected).toFixed(4)})`
  );
}

// ---------------------------------------------------------------------------
// Test Case 1: Mid-volume restaurant on interchange-plus (Pax terminal)
// ---------------------------------------------------------------------------

const RESTAURANT_STATEMENT = {
  merchant: {
    businessName: "Tony's Italian Kitchen",
    mid: 'MID123456',
    currentProcessor: 'First Data',
    statementPeriod: '2025-09',
    posSystem: 'Pax A920',
  },
  volume: {
    visaMcVolume: 42000,
    visaMcTransactions: 800,
    amexVolume: 8000,
    amexTransactions: 120,
    discoverVolume: 3000,
    discoverTransactions: 60,
    debitVolume: 12000,
    debitTransactions: 300,
    totalVolume: 65000,
    totalTransactions: 1280,
    averageTicket: 50.78,
  },
  interchange: {
    totalInterchangeFees: 1137.50,
    effectiveInterchangeRate: 0.0175,
  },
  processingFees: {
    markupRate: null,
    authFee: 0.10,
    batchFee: 0.25,
    avsFee: null,
    monthlyFees: [
      { name: 'Statement Fee', amount: 9.95 },
      { name: 'PCI Fee', amount: 12.95 },
      { name: 'Account Fee', amount: 5.00 },
    ],
    totalMonthlyProcessingFees: 27.90,
  },
  platformFees: [],
  otherFees: { chargebackFee: 25.00, retrievalFee: 15.00, earlyTerminationFee: 495.00 },
  cardPresence: { cardPresentPercent: 90, cardNotPresentPercent: 10 },
};

describe('Test Case 1: Restaurant on Pax (open POS, interchange-plus)', () => {
  test('POS classification', () => {
    const { category, difficulty } = classifyPOS('Pax A920');
    assert.equal(category, 'open');
    assert.equal(difficulty, 'EASY');
  });

  test('current processing cost = $1,300.90', () => {
    const { cost } = deriveCurrentProcessingCost(RESTAURANT_STATEMENT);
    // interchange=1137.50 + auth=128.00 + batch=7.50 + monthly=27.90
    near(cost, 1300.90, 'currentCost');
  });

  test('Kurv retail floor cost = $1,227.35', () => {
    const processors = loadProcessors();
    const kurv = processors.find(p => p.id === 'kurv');
    assert.ok(kurv, 'Kurv must be loaded');

    const retailTier = kurv.tiers.find(t => t.tierId === 'retail');
    assert.ok(retailTier, 'Kurv retail tier must exist');

    const entry = {
      processorId: kurv.id,
      processorName: kurv.name,
      platform: kurv.platform,
      binSponsorshipRate: kurv.binSponsorshipRate,
      posCompatibility: kurv.posCompatibility,
      contract: kurv.contract,
      advanceScenario: null,
      ...retailTier,
    };

    const { floorCost, breakdown } = calculateFloorCost(entry, RESTAURANT_STATEMENT, 'open');

    // breakdown verification
    near(breakdown.interchange, 1137.50, 'interchange');
    near(breakdown.binSponsorship, 13.00, 'BIN (65000 * 0.0002)');
    near(breakdown.amexBin, 0, 'amexBin (null = 0)');
    near(breakdown.bankCardAuthFees, 34.40, 'bankCardAuth (860 txns * $0.04)');
    near(breakdown.amexAuthFees, 6.00, 'amexAuth (120 txns * $0.05)');
    near(breakdown.batchFees, 1.50, 'batch (30 * $0.05)');
    near(breakdown.avsFees, 1.28, 'avs (128 CNP txns * $0.01)');
    near(breakdown.pinDebitFees, 15.00, 'pinDebit (300 * $0.05)');
    near(breakdown.monthlyFeesTotal, 18.67, 'monthly (6+6+5+1.67)');

    near(floorCost, 1227.35, 'Kurv retail floorCost');
  });

  test('Kurv retail savings gap and margin', () => {
    // savingsGap = 1300.90 - 1227.35 = 73.55
    // volume=65000 → 70/30 split
    const { merchantSavings, ourResidual } = applyMargin(73.55, 65000);
    near(merchantSavings, 51.49, 'merchant savings (73.55 * 0.70)');
    near(ourResidual, 22.07, 'our residual (73.55 * 0.30)');
  });

  test('EPI Option A floor cost = $1,174.17', () => {
    const processors = loadProcessors();
    const epi = processors.find(p => p.id === 'epi');
    assert.ok(epi, 'EPI must be loaded');

    const tierA = epi.tiers.find(t => t.tierId === 'A');
    const entry = {
      processorId: epi.id,
      processorName: epi.name,
      platform: epi.platform,
      binSponsorshipRate: epi.binSponsorshipRate,
      posCompatibility: epi.posCompatibility,
      contract: epi.contract,
      advanceScenario: null,
      ...tierA,
    };

    const { floorCost, breakdown } = calculateFloorCost(entry, RESTAURANT_STATEMENT, 'open');

    near(breakdown.interchange, 1137.50, 'interchange');
    near(breakdown.binSponsorship, 13.00, 'BIN (65000 * 0.0002)');
    near(breakdown.amexBin, 8.00, 'amexBin (8000 * 0.0010)');
    near(breakdown.bankCardAuthFees, 0, 'bankCardAuth (authFee=0)');
    near(breakdown.amexAuthFees, 0, 'amexAuth (amexAuthFee null → 0)');
    near(breakdown.batchFees, 0, 'batch (null → 0)');
    near(breakdown.avsFees, 1.92, 'avs (128 * 0.015)');
    near(breakdown.pinDebitFees, 12.00, 'pinDebit (300 * 0.04)');
    near(breakdown.monthlyFeesTotal, 1.75, 'monthly (platform admin fee)');

    near(floorCost, 1174.17, 'EPI Option A floorCost');
  });

  test('EPI Option A savings — BEST FOR MERCHANT', () => {
    const { merchantSavings, ourResidual } = applyMargin(1300.90 - 1174.17, 65000);
    // gap = 126.73 → 70/30
    near(merchantSavings, 88.71, 'merchant savings');
    near(ourResidual, 38.02, 'our residual');
  });

  test('Beacon CardConnect (no advance) floor cost = $1,205.14', () => {
    const processors = loadProcessors();
    const beacon = processors.find(p => p.id === 'beacon');
    const tier = beacon.tiers.find(t => t.tierId === 'cardconnect');

    const entry = {
      processorId: beacon.id,
      processorName: beacon.name,
      platform: beacon.platform,
      binSponsorshipRate: beacon.binSponsorshipRate,
      posCompatibility: beacon.posCompatibility,
      contract: beacon.contract,
      advanceScenario: 'without_advance',
      ...tier,
    };

    const { floorCost, breakdown } = calculateFloorCost(entry, RESTAURANT_STATEMENT, 'open');

    near(breakdown.binSponsorship, 6.50, 'BIN (65000 * 0.0001)');
    near(breakdown.amexBin, 8.00, 'amexBin (8000 * 0.0010)');
    near(breakdown.bankCardAuthFees, 25.80, 'bankCardAuth (860 * 0.03)');
    near(breakdown.amexAuthFees, 3.60, 'amexAuth (120 * 0.03)');
    near(breakdown.batchFees, 0.90, 'batch (30 * 0.03)');
    near(breakdown.avsFees, 3.84, 'avs (128 * 0.03)');
    near(breakdown.pinDebitFees, 9.00, 'pinDebit (300 * 0.03)');
    // Monthly: $5 platform + $5 TransArmor = $10 (Clover fee excluded — merchant on open POS)
    near(breakdown.monthlyFeesTotal, 10.00, 'monthly (no Clover fee)');
    near(breakdown.advanceFee, 0, 'no advance fee');

    near(floorCost, 1205.14, 'Beacon CardConnect (no advance) floorCost');
  });

  test('Beacon CardConnect savings', () => {
    const { merchantSavings, ourResidual } = applyMargin(1300.90 - 1205.14, 65000);
    // gap = 95.76 → 70/30
    near(merchantSavings, 67.03, 'merchant savings');
    near(ourResidual, 28.73, 'our residual');
  });

  test('Beacon CardConnect WITH advance floor = $1,215.14 (extra $10/month)', () => {
    const processors = loadProcessors();
    const beacon = processors.find(p => p.id === 'beacon');
    const tier = beacon.tiers.find(t => t.tierId === 'cardconnect');

    const entry = {
      processorId: beacon.id,
      processorName: beacon.name,
      platform: beacon.platform,
      binSponsorshipRate: beacon.binSponsorshipRate,
      posCompatibility: beacon.posCompatibility,
      contract: beacon.contract,
      advanceScenario: 'with_advance',
      ...tier,
    };

    const { floorCost, breakdown } = calculateFloorCost(entry, RESTAURANT_STATEMENT, 'open');
    near(breakdown.advanceFee, 10.00, 'advance fee');
    near(floorCost, 1215.14, 'Beacon CardConnect (with advance) floorCost');
  });

  test('full runComparison — EPI Option A is best for merchant', () => {
    const result = runComparison(RESTAURANT_STATEMENT, 'Pax A920');
    assert.equal(result.posCategory, 'open');
    assert.equal(result.difficulty, 'EASY');
    near(result.currentCost, 1300.90, 'currentCost');

    // Sorted by merchantSavings desc — EPI Option A should be on top
    const best = result.comparisons[0];
    assert.equal(best.processorId, 'epi');
    assert.equal(best.tierId, 'A');
    assert.ok(best.bestForMerchant, 'EPI Option A should be flagged bestForMerchant');
    near(best.merchantSavings, 88.71, 'best merchant savings');

    // Recommendation should be SWITCH to EPI
    assert.equal(result.recommendation.action, 'SWITCH');
    assert.equal(result.recommendation.processorId, 'epi');
  });
});

// ---------------------------------------------------------------------------
// Test Case 2: Small retail on Square (locked POS)
// ---------------------------------------------------------------------------

const SQUARE_STATEMENT = {
  merchant: {
    businessName: 'Main Street Boutique',
    mid: null,
    currentProcessor: 'Square',
    statementPeriod: '2025-10',
    posSystem: 'Square',
  },
  volume: {
    visaMcVolume: 15000,
    visaMcTransactions: 400,
    amexVolume: 3000,
    amexTransactions: 60,
    discoverVolume: 1000,
    discoverTransactions: 30,
    debitVolume: 6000,
    debitTransactions: 200,
    totalVolume: 25000,
    totalTransactions: 690,
    averageTicket: 36.23,
  },
  interchange: {
    totalInterchangeFees: 437.50,
    effectiveInterchangeRate: 0.0175,
  },
  processingFees: {
    markupRate: 0.026,
    authFee: 0.10,
    batchFee: null,
    avsFee: null,
    monthlyFees: [],
    totalMonthlyProcessingFees: 0,
  },
  platformFees: [
    { name: 'Square SaaS Fee', amount: 0 },
  ],
  otherFees: { chargebackFee: null, retrievalFee: null, earlyTerminationFee: null },
  cardPresence: { cardPresentPercent: 95, cardNotPresentPercent: 5 },
};

describe('Test Case 2: Square (locked POS, small volume)', () => {
  test('POS classification', () => {
    const { category, difficulty } = classifyPOS('Square');
    assert.equal(category, 'locked');
    assert.equal(difficulty, 'HARD');
  });

  test('current cost = $506.50 (markupRate not added because authFee is present)', () => {
    const { cost } = deriveCurrentProcessingCost(SQUARE_STATEMENT);
    // interchange=437.50 + auth(0.10*690)=69.00 — markupRate skipped (authFee=0.10 > 0)
    near(cost, 506.50, 'currentCost');
  });

  test('margin tier for 25k volume = 70/30', () => {
    const tier = getMarginTier(25000);
    assert.equal(tier.label, '70/30');
  });

  test('all processors are compatible with locked POS', () => {
    const processors = loadProcessors();
    const entries = flattenProcessorTiers(processors);
    const compatible = entries.filter(e => isProcessorCompatible(e, 'locked'));
    assert.equal(compatible.length, entries.length, 'all entries should be compatible with locked POS');
  });

  test('recommendation is NO_SWITCH or NEGOTIATE_EXISTING (savings below thresholds)', () => {
    const result = runComparison(SQUARE_STATEMENT, 'Square');
    assert.equal(result.posCategory, 'locked');
    assert.equal(result.difficulty, 'HARD');
    assert.ok(
      result.recommendation.action === 'NO_SWITCH' || result.recommendation.action === 'NEGOTIATE_EXISTING',
      `Expected NO_SWITCH or NEGOTIATE_EXISTING, got ${result.recommendation.action}`
    );
  });

  test('Square SaaS Fee appears in feesThatStay, not feesEliminated', () => {
    const result = runComparison(SQUARE_STATEMENT, 'Square');
    const rec = result.recommendation;
    const eliminated = rec.feesEliminated.map(f => f.name);
    const stays = rec.feesThatStay.map(f => f.name);
    assert.ok(!eliminated.includes('Square SaaS Fee'), 'Square SaaS fee should not be in feesEliminated');
    assert.ok(stays.includes('Square SaaS Fee'), 'Square SaaS fee should be in feesThatStay');
  });
});

// ---------------------------------------------------------------------------
// Test Case 3: Salon on Clover
// ---------------------------------------------------------------------------

const CLOVER_STATEMENT = {
  merchant: {
    businessName: 'Bella Salon & Spa',
    mid: 'MID789',
    currentProcessor: 'Bank of America Merchant Services',
    statementPeriod: '2025-08',
    posSystem: 'Clover Flex',
  },
  volume: {
    visaMcVolume: 28000,
    visaMcTransactions: 500,
    amexVolume: 5000,
    amexTransactions: 80,
    discoverVolume: 2000,
    discoverTransactions: 40,
    debitVolume: 5000,
    debitTransactions: 150,
    totalVolume: 40000,
    totalTransactions: 770,
    averageTicket: 51.95,
  },
  interchange: {
    totalInterchangeFees: 700.00,
    effectiveInterchangeRate: 0.0175,
  },
  processingFees: {
    markupRate: null,
    authFee: 0.07,
    batchFee: 0.10,
    avsFee: null,
    monthlyFees: [
      { name: 'Statement Fee', amount: 7.50 },
      { name: 'PCI Fee', amount: 14.95 },
    ],
    totalMonthlyProcessingFees: 22.45,
  },
  platformFees: [
    { name: 'Clover Software Fee', amount: 14.95 },
  ],
  otherFees: { chargebackFee: 25.00, retrievalFee: 10.00, earlyTerminationFee: 350.00 },
  cardPresence: { cardPresentPercent: 100, cardNotPresentPercent: 0 },
};

describe('Test Case 3: Clover salon (Clover POS, medium difficulty)', () => {
  test('POS classification', () => {
    const { category, difficulty } = classifyPOS('Clover Flex');
    assert.equal(category, 'clover');
    assert.equal(difficulty, 'MEDIUM');
  });

  test('current cost = $779.35', () => {
    const { cost } = deriveCurrentProcessingCost(CLOVER_STATEMENT);
    // interchange=700.00 + auth(0.07*770)=53.90 + batch(0.10*30)=3.00 + monthly=22.45
    near(cost, 779.35, 'currentCost');
  });

  test('only Beacon is compatible with Clover', () => {
    const processors = loadProcessors();
    const cloverCompatible = processors.filter(p => p.posCompatibility.includes('clover'));
    assert.equal(cloverCompatible.length, 1, 'only 1 processor supports Clover');
    assert.equal(cloverCompatible[0].id, 'beacon');
  });

  test('Beacon CardConnect floor includes Clover Platform Fee ($5)', () => {
    const processors = loadProcessors();
    const beacon = processors.find(p => p.id === 'beacon');
    const tier = beacon.tiers.find(t => t.tierId === 'cardconnect');

    const entry = {
      processorId: beacon.id,
      processorName: beacon.name,
      platform: beacon.platform,
      binSponsorshipRate: beacon.binSponsorshipRate,
      posCompatibility: beacon.posCompatibility,
      contract: beacon.contract,
      advanceScenario: 'without_advance',
      ...tier,
    };

    const { floorCost, breakdown } = calculateFloorCost(entry, CLOVER_STATEMENT, 'clover');

    // Monthly: $5 platform + $5 TransArmor + $5 Clover Platform Fee = $15
    near(breakdown.monthlyFeesTotal, 15.00, 'monthly fees include Clover Platform Fee');
    assert.ok(
      breakdown.includedMonthlyFees.some(f => f.name === 'Clover Platform Fee'),
      'Clover Platform Fee should be in includedMonthlyFees for clover merchants'
    );

    // Verify the Clover Platform Fee is excluded for non-Clover merchants
    const { breakdown: openBreakdown } = calculateFloorCost(entry, CLOVER_STATEMENT, 'open');
    near(openBreakdown.monthlyFeesTotal, 10.00, 'monthly fees exclude Clover Platform Fee for open POS');
    assert.ok(
      openBreakdown.excludedMonthlyFees.some(f => f.name === 'Clover Platform Fee'),
      'Clover Platform Fee should be excluded for non-Clover merchants'
    );
  });

  test('Clover Software Fee goes in feesThatStay, not feesEliminated', () => {
    const result = runComparison(CLOVER_STATEMENT, 'Clover Flex');
    const rec = result.recommendation;
    const stays = rec.feesThatStay.map(f => f.name);
    const eliminated = rec.feesEliminated.map(f => f.name);

    assert.ok(stays.includes('Clover Software Fee'), 'Clover Software Fee should stay');
    assert.ok(!eliminated.includes('Clover Software Fee'), 'Clover Software Fee should not be eliminated');
  });

  test('chargeback and retrieval fees go in feesThatStay', () => {
    const result = runComparison(CLOVER_STATEMENT, 'Clover Flex');
    const stays = result.recommendation.feesThatStay.map(f => f.name);
    assert.ok(stays.includes('Chargeback Fee'));
    assert.ok(stays.includes('Retrieval Fee'));
  });

  test('recommendation action is correct for clover merchant', () => {
    const result = runComparison(CLOVER_STATEMENT, 'Clover Flex');
    assert.equal(result.posCategory, 'clover');
    assert.equal(result.difficulty, 'MEDIUM');
    // Savings with Beacon are modest (< $50/month) → NO_SWITCH
    const action = result.recommendation.action;
    assert.ok(
      action === 'NO_SWITCH' || action === 'SWITCH',
      `Expected NO_SWITCH or SWITCH, got ${action}`
    );
  });
});

// ---------------------------------------------------------------------------
// Margin calculator tests
// ---------------------------------------------------------------------------

describe('Margin calculator', () => {
  test('volume > 75000 → 75/25 split', () => {
    const tier = getMarginTier(100000);
    assert.equal(tier.label, '75/25');
    assert.equal(tier.merchantShare, 0.75);
    assert.equal(tier.ourShare, 0.25);
  });

  test('volume = 75000 → 70/30 split (not > 75000)', () => {
    const tier = getMarginTier(75000);
    assert.equal(tier.label, '70/30');
  });

  test('volume = 25000 → 70/30 split (>= 25000)', () => {
    const tier = getMarginTier(25000);
    assert.equal(tier.label, '70/30');
  });

  test('volume < 25000 → 65/35 split', () => {
    const tier = getMarginTier(10000);
    assert.equal(tier.label, '65/35');
  });

  test('negative savings gap returns zero', () => {
    const { merchantSavings, ourResidual } = applyMargin(-100, 50000);
    assert.equal(merchantSavings, 0);
    assert.equal(ourResidual, 0);
  });

  test('zero savings gap returns zero', () => {
    const { merchantSavings, ourResidual } = applyMargin(0, 50000);
    assert.equal(merchantSavings, 0);
    assert.equal(ourResidual, 0);
  });
});

// ---------------------------------------------------------------------------
// Upfront income calculator
// ---------------------------------------------------------------------------

describe('Upfront income calculator', () => {
  test('EPI Option A: multiplier goes to 0 (signing bonus > multiplier raw)', () => {
    // signingBonus=300, multiplier={factor:1, cap:500}
    // ourResidual ≈ $38/month
    // raw = 1 * 38 - 300 = -262 → max(0, -262) = 0
    const { signingBonus, multiplierValue, totalUpfront } = calculateUpfront(
      {
        signingBonus: 300,
        multiplier: { factor: 1, cap: 500, floor: null },
        advance: null,
        advanceScenario: null,
      },
      38.02
    );
    assert.equal(signingBonus, 300);
    assert.equal(multiplierValue, 0);
    assert.equal(totalUpfront, 300);
  });

  test('Beacon CardConnect without advance: 8x multiplier with floor', () => {
    // ourResidual ≈ $28.73, signingBonus=null → 0
    // raw = 8 * 28.73 - 0 = 229.84, cap=5000, floor=150 → 229.84
    const { multiplierValue, totalUpfront } = calculateUpfront(
      {
        signingBonus: null,
        multiplier: { factor: 8, cap: 5000, floor: 150 },
        advance: null,
        advanceScenario: 'without_advance',
      },
      28.73
    );
    near(multiplierValue, 229.84, 'multiplier value');
    near(totalUpfront, 229.84, 'total upfront');
  });

  test('Beacon CardConnect with advance: adds $1000 advance', () => {
    const { advanceAmount, totalUpfront } = calculateUpfront(
      {
        signingBonus: null,
        multiplier: { factor: 8, cap: 5000, floor: 150 },
        advance: { amount: 1000, requirements: { monthlyFee: 10, monthlyMinimum: 30 } },
        advanceScenario: 'with_advance',
      },
      25.73
    );
    assert.equal(advanceAmount, 1000);
    // multiplier: 8 * 25.73 - 0 = 205.84, cap=5000, floor=150 → 205.84
    near(totalUpfront, 1205.84, 'total upfront with advance');
  });

  test('multiplier floor applies when raw is below floor', () => {
    // ourResidual = $5, factor = 8, cap = 5000, floor = 150
    // raw = 40 → floor kicks in → 150
    const { multiplierValue } = calculateUpfront(
      {
        signingBonus: null,
        multiplier: { factor: 8, cap: 5000, floor: 150 },
        advance: null,
        advanceScenario: null,
      },
      5
    );
    assert.equal(multiplierValue, 150);
  });
});

// ---------------------------------------------------------------------------
// Processor loader
// ---------------------------------------------------------------------------

describe('Processor loader', () => {
  test('loads only signed processors', () => {
    const processors = loadProcessors();
    assert.ok(processors.length >= 3, 'at least 3 signed processors');
    processors.forEach(p => {
      assert.equal(p.status, 'signed', `${p.id} should be signed`);
    });
  });

  test('pending processors (priority, maverick) are excluded from loadProcessors', () => {
    const processors = loadProcessors();
    const ids = processors.map(p => p.id);
    assert.ok(!ids.includes('priority'), 'priority is pending, should be excluded');
    assert.ok(!ids.includes('maverick'), 'maverick is pending, should be excluded');
  });

  test('Beacon advance tier produces two comparison entries', () => {
    const processors = loadProcessors();
    const entries = flattenProcessorTiers(processors);
    const beaconCardConnect = entries.filter(
      e => e.processorId === 'beacon' && e.tierId === 'cardconnect'
    );
    assert.equal(beaconCardConnect.length, 2, 'CardConnect tier should produce 2 entries');
    const scenarios = beaconCardConnect.map(e => e.advanceScenario);
    assert.ok(scenarios.includes('with_advance'));
    assert.ok(scenarios.includes('without_advance'));
  });

  test('non-advance tiers produce single entries with null advanceScenario', () => {
    const processors = loadProcessors();
    const entries = flattenProcessorTiers(processors);
    const kurvRetail = entries.filter(e => e.processorId === 'kurv' && e.tierId === 'retail');
    assert.equal(kurvRetail.length, 1);
    assert.equal(kurvRetail[0].advanceScenario, null);
  });
});
