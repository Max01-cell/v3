/**
 * POS compatibility router.
 * Classifies a merchant's POS system and determines which processors are compatible.
 */

/**
 * POS systems grouped by category.
 * The category determines which processors are compatible.
 */
const POS_CATEGORIES = {
  open:            ['pax', 'dejavoo', 'verifone', 'ingenico'],
  clover:          ['clover'],
  locked:          ['square', 'shopify', 'spoton', 'lightspeed', 'ncr', 'micros'],
  processorLocked: ['heartland', 'genius', 'toast'],
  semiOpen:        ['revel'],
  standalone:      ['standalone', 'virtual terminal', 'no pos', 'none', ''],
};

const DIFFICULTY_MAP = {
  open:            'EASY',
  clover:          'MEDIUM',
  locked:          'HARD',
  processorLocked: 'HARD',
  semiOpen:        'MEDIUM',
  standalone:      'EASY',
};

/**
 * Classify a POS system into a category.
 *
 * @param {string} posSystem
 * @returns {{ category: string, difficulty: string }}
 */
export function classifyPOS(posSystem) {
  const normalized = (posSystem || '').toLowerCase().trim();

  for (const [category, systems] of Object.entries(POS_CATEGORIES)) {
    if (systems.some(s => normalized.includes(s))) {
      return { category, difficulty: DIFFICULTY_MAP[category] };
    }
  }

  // Default: assume standalone (most permissive)
  return { category: 'standalone', difficulty: 'EASY' };
}

/**
 * Filter a comparison entry by POS compatibility.
 *
 * @param {object} entry — flattened processor tier entry
 * @param {string} posCategory — from classifyPOS()
 * @returns {boolean} — true if compatible
 */
export function isProcessorCompatible(entry, posCategory) {
  // Locked POS: all processors work, but merchant must abandon hardware
  if (posCategory === 'locked') return true;

  // Processor-locked: nothing works
  if (posCategory === 'processorLocked') return false;

  // Otherwise: check posCompatibility array
  return entry.posCompatibility.includes(posCategory);
}

/**
 * Full POS compatibility matrix (for reference / route display).
 */
export const POS_COMPATIBILITY = {
  open: {
    systems: ['Pax', 'Dejavoo', 'Verifone', 'Ingenico'],
    difficulty: 'EASY',
    action: 'Reprogram existing terminal',
  },
  clover: {
    systems: ['Clover'],
    difficulty: 'MEDIUM',
    action: 'Switch to Clover-compatible processor',
    notes: "Clover Software Fee does NOT go away — it gets replaced by processor's Clover platform fee",
  },
  locked: {
    systems: ['Square', 'Shopify POS', 'SpotOn', 'Lightspeed', 'NCR', 'Micros'],
    difficulty: 'HARD',
    action: 'Must switch hardware — merchant loses current POS ecosystem',
    threshold: 'Only recommend if processing-only savings exceed $500/month',
    notes: [
      'Compare PROCESSING fees only — do NOT include platform/software fees in savings calc',
      'Toast/Square/Shopify SaaS fees are NOT fees that go away — they are platform costs',
      'Merchant needs to understand they are switching their entire system',
    ],
  },
  processorLocked: {
    systems: ['Heartland terminal', 'Genius terminal', 'Toast'],
    lockedTo: 'Global Payments / Heartland, or bundled POS processor',
    difficulty: 'HARD',
    action: 'Processing is bundled with POS — cannot switch processors without replacing entire system',
  },
  semiOpen: {
    systems: ['Revel'],
    difficulty: 'MEDIUM',
    action: 'Verify with processor before quoting',
  },
  standalone: {
    systems: ['No POS', 'Standalone terminal', 'Virtual terminal'],
    difficulty: 'EASY',
    action: 'Provide new terminal or reprogram existing',
  },
};

/**
 * Route a merchant to compatible processors based on their POS system.
 * Returns the category, difficulty, and list of compatible processors.
 *
 * @param {string} posSystem
 * @param {object[]} allProcessors — output of loadProcessors()
 * @returns {{ category: string, difficulty: string, action: string, compatibleProcessors: object[] }}
 */
export function getCompatibleProcessors(posSystem, allProcessors) {
  const { category, difficulty } = classifyPOS(posSystem);

  if (category === 'processorLocked') {
    return {
      category,
      difficulty,
      ...POS_COMPATIBILITY.processorLocked,
      compatibleProcessors: [],
    };
  }

  if (category === 'locked') {
    return {
      category,
      difficulty,
      ...POS_COMPATIBILITY.locked,
      compatibleProcessors: allProcessors,
    };
  }

  const compatible = allProcessors.filter(p =>
    p.posCompatibility.includes(category)
  );

  return {
    category,
    difficulty,
    ...(POS_COMPATIBILITY[category] || POS_COMPATIBILITY.standalone),
    compatibleProcessors: compatible,
  };
}
