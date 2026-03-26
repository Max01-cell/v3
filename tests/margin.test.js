/**
 * Margin calculator unit tests.
 * Run: node --test tests/margin.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getMarginTier, applyMargin } from '../src/services/margin.js';

describe('getMarginTier', () => {
  test('volume > 75000 → 75/25', () => {
    const t = getMarginTier(75001);
    assert.equal(t.label, '75/25');
    assert.equal(t.merchantShare, 0.75);
    assert.equal(t.ourShare, 0.25);
  });

  test('volume = 75000 → 70/30 (boundary: not strictly > 75000)', () => {
    const t = getMarginTier(75000);
    assert.equal(t.label, '70/30');
  });

  test('volume = 50000 → 70/30', () => {
    const t = getMarginTier(50000);
    assert.equal(t.label, '70/30');
  });

  test('volume = 25000 → 70/30 (>= 25000)', () => {
    const t = getMarginTier(25000);
    assert.equal(t.label, '70/30');
  });

  test('volume = 24999 → 65/35 (< 25000)', () => {
    const t = getMarginTier(24999);
    assert.equal(t.label, '65/35');
  });

  test('volume = 0 → 65/35', () => {
    const t = getMarginTier(0);
    assert.equal(t.label, '65/35');
  });
});

describe('applyMargin', () => {
  test('positive gap splits correctly at 70/30', () => {
    const { merchantSavings, ourResidual, marginLabel } = applyMargin(100, 50000);
    assert.equal(merchantSavings, 70.00);
    assert.equal(ourResidual, 30.00);
    assert.equal(marginLabel, '70/30');
  });

  test('positive gap splits correctly at 75/25', () => {
    const { merchantSavings, ourResidual } = applyMargin(200, 100000);
    assert.equal(merchantSavings, 150.00);
    assert.equal(ourResidual, 50.00);
  });

  test('positive gap splits correctly at 65/35', () => {
    const { merchantSavings, ourResidual } = applyMargin(100, 10000);
    assert.equal(merchantSavings, 65.00);
    assert.equal(ourResidual, 35.00);
  });

  test('zero gap → zeros', () => {
    const { merchantSavings, ourResidual, marginLabel } = applyMargin(0, 50000);
    assert.equal(merchantSavings, 0);
    assert.equal(ourResidual, 0);
    assert.equal(marginLabel, 'N/A');
  });

  test('negative gap → zeros (merchant already well-priced)', () => {
    const { merchantSavings, ourResidual, marginLabel } = applyMargin(-50, 50000);
    assert.equal(merchantSavings, 0);
    assert.equal(ourResidual, 0);
    assert.equal(marginLabel, 'N/A');
  });

  test('rounds to 2 decimal places', () => {
    // 73.55 * 0.30 = 22.065 → round2 = 22.07 (standard rounding)
    const { ourResidual } = applyMargin(73.55, 65000);
    assert.ok(Number.isFinite(ourResidual));
    // Check it's rounded to 2 decimal places
    assert.equal(ourResidual, Math.round(ourResidual * 100) / 100);
  });
});
