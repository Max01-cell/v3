/**
 * POS compatibility router unit tests.
 * Run: node --test tests/pos.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPOS, isProcessorCompatible } from '../src/services/pos.js';

describe('classifyPOS', () => {
  // Open terminals
  test('Pax A920 → open/EASY', () => {
    const r = classifyPOS('Pax A920');
    assert.equal(r.category, 'open');
    assert.equal(r.difficulty, 'EASY');
  });

  test('Dejavoo → open/EASY', () => {
    const r = classifyPOS('Dejavoo Z11');
    assert.equal(r.category, 'open');
    assert.equal(r.difficulty, 'EASY');
  });

  test('Verifone → open/EASY', () => {
    const r = classifyPOS('Verifone VX520');
    assert.equal(r.category, 'open');
    assert.equal(r.difficulty, 'EASY');
  });

  // Clover
  test('Clover Flex → clover/MEDIUM', () => {
    const r = classifyPOS('Clover Flex');
    assert.equal(r.category, 'clover');
    assert.equal(r.difficulty, 'MEDIUM');
  });

  test('Clover Mini → clover/MEDIUM', () => {
    const r = classifyPOS('Clover Mini');
    assert.equal(r.category, 'clover');
    assert.equal(r.difficulty, 'MEDIUM');
  });

  // Locked systems
  test('Square → locked/HARD', () => {
    const r = classifyPOS('Square');
    assert.equal(r.category, 'locked');
    assert.equal(r.difficulty, 'HARD');
  });

  test('Toast POS → processorLocked/HARD', () => {
    const r = classifyPOS('Toast POS');
    assert.equal(r.category, 'processorLocked');
    assert.equal(r.difficulty, 'HARD');
  });

  test('Shopify → locked/HARD', () => {
    const r = classifyPOS('Shopify POS');
    assert.equal(r.category, 'locked');
    assert.equal(r.difficulty, 'HARD');
  });

  test('SpotOn → locked/HARD', () => {
    const r = classifyPOS('SpotOn');
    assert.equal(r.category, 'locked');
    assert.equal(r.difficulty, 'HARD');
  });

  // Processor-locked (critical: difficulty = HARD, not MEDIUM)
  test('Heartland terminal → processorLocked/HARD', () => {
    const r = classifyPOS('Heartland terminal');
    assert.equal(r.category, 'processorLocked');
    assert.equal(r.difficulty, 'HARD');
  });

  test('Genius terminal → processorLocked/HARD', () => {
    const r = classifyPOS('Genius terminal');
    assert.equal(r.category, 'processorLocked');
    assert.equal(r.difficulty, 'HARD');
  });

  // Standalone / no POS
  test('null → standalone/EASY', () => {
    const r = classifyPOS(null);
    assert.equal(r.category, 'standalone');
    assert.equal(r.difficulty, 'EASY');
  });

  test('empty string → standalone/EASY', () => {
    const r = classifyPOS('');
    assert.equal(r.category, 'standalone');
    assert.equal(r.difficulty, 'EASY');
  });

  test('undefined → standalone/EASY', () => {
    const r = classifyPOS(undefined);
    assert.equal(r.category, 'standalone');
    assert.equal(r.difficulty, 'EASY');
  });

  test('unknown POS → defaults to standalone/EASY', () => {
    const r = classifyPOS('Some Unknown POS System 9000');
    assert.equal(r.category, 'standalone');
    assert.equal(r.difficulty, 'EASY');
  });

  // Case-insensitive
  test('case-insensitive matching', () => {
    assert.equal(classifyPOS('SQUARE').category, 'locked');
    assert.equal(classifyPOS('PAX A920').category, 'open');
    assert.equal(classifyPOS('CLOVER FLEX').category, 'clover');
  });
});

describe('isProcessorCompatible', () => {
  const kurvEntry = { posCompatibility: ['open', 'standalone'] };
  const beaconEntry = { posCompatibility: ['open', 'clover', 'standalone'] };
  const epiEntry = { posCompatibility: ['open', 'standalone'] };

  test('locked POS: all processors are compatible (merchant must swap hardware)', () => {
    assert.equal(isProcessorCompatible(kurvEntry, 'locked'), true);
    assert.equal(isProcessorCompatible(beaconEntry, 'locked'), true);
    assert.equal(isProcessorCompatible(epiEntry, 'locked'), true);
  });

  test('processorLocked POS: no processors are compatible', () => {
    assert.equal(isProcessorCompatible(kurvEntry, 'processorLocked'), false);
    assert.equal(isProcessorCompatible(beaconEntry, 'processorLocked'), false);
  });

  test('clover POS: only beacon is compatible', () => {
    assert.equal(isProcessorCompatible(kurvEntry, 'clover'), false);
    assert.equal(isProcessorCompatible(beaconEntry, 'clover'), true);
    assert.equal(isProcessorCompatible(epiEntry, 'clover'), false);
  });

  test('open POS: kurv, epi, beacon all compatible', () => {
    assert.equal(isProcessorCompatible(kurvEntry, 'open'), true);
    assert.equal(isProcessorCompatible(beaconEntry, 'open'), true);
    assert.equal(isProcessorCompatible(epiEntry, 'open'), true);
  });

  test('standalone: all three compatible', () => {
    assert.equal(isProcessorCompatible(kurvEntry, 'standalone'), true);
    assert.equal(isProcessorCompatible(beaconEntry, 'standalone'), true);
  });
});
