/**
 * Dynamic processor config loader.
 * Reads all JSON files from data/processors/ at startup.
 * Adding a new processor = drop a JSON file. Zero code changes.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PROCESSORS_DIR = join(process.cwd(), 'data', 'processors');

/**
 * Load all signed processor configs.
 * Skips _schema.json and any file starting with underscore.
 * Only returns processors with status === 'signed'.
 *
 * @returns {object[]}
 */
export function loadProcessors() {
  const files = readdirSync(PROCESSORS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'));

  const all = files.map(f => {
    const raw = readFileSync(join(PROCESSORS_DIR, f), 'utf-8');
    return JSON.parse(raw);
  });

  return all.filter(p => p.status === 'signed');
}

/**
 * Get all processors including pending/inactive (for admin views).
 *
 * @returns {object[]}
 */
export function loadAllProcessors() {
  const files = readdirSync(PROCESSORS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'));

  return files.map(f => {
    const raw = readFileSync(join(PROCESSORS_DIR, f), 'utf-8');
    return JSON.parse(raw);
  });
}

/**
 * Flatten processor tiers into individual comparison entries.
 * Each tier becomes one entry.
 * Tiers with advance programs produce TWO entries (with_advance / without_advance).
 *
 * @param {object[]} processors — output of loadProcessors()
 * @returns {object[]}
 */
export function flattenProcessorTiers(processors) {
  const entries = [];

  for (const processor of processors) {
    for (const tier of processor.tiers) {
      const base = {
        processorId: processor.id,
        processorName: processor.name,
        platform: processor.platform,
        binSponsorshipRate: processor.binSponsorshipRate,
        posCompatibility: processor.posCompatibility,
        contract: processor.contract,
        ...tier,
      };

      if (tier.advance) {
        // WITH advance: adds advance.requirements.monthlyFee to merchant cost
        entries.push({ ...base, advanceScenario: 'with_advance' });
        // WITHOUT advance: no extra fee, no advance payout
        entries.push({ ...base, advanceScenario: 'without_advance' });
      } else {
        entries.push({ ...base, advanceScenario: null });
      }
    }
  }

  return entries;
}
