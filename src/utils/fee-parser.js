/**
 * Fee parser utilities.
 * Normalizes extracted fee data from Claude API output.
 *
 * TODO: Implement fee normalization for edge cases:
 *   - Acquirer Processing Fee (per-transaction, not monthly)
 *   - FANF (Fixed Acquirer Network Fee)
 *   - Dues & Assessments separation from interchange
 */

/**
 * Determine if a fee is a platform fee (not competed on) vs a processing fee (competed on).
 *
 * @param {string} feeName
 * @returns {boolean}
 */
export function isPlatformFee(feeName) {
  const name = feeName.toLowerCase();
  const platformKeywords = [
    'saas', 'software', 'subscription', 'hardware', 'lease',
    'toast', 'shopify', 'lightspeed', 'micros', 'ncr', 'spoton',
    'revel', 'square', 'loyalty', 'online ordering',
  ];
  return platformKeywords.some(k => name.includes(k));
}

/**
 * Normalize a raw monthly fees array, classifying each fee as processing or platform.
 *
 * @param {object[]} fees — array of { name, amount } from raw extraction
 * @returns {{ processingFees: object[], platformFees: object[] }}
 */
export function classifyFees(fees) {
  const processingFees = [];
  const platformFees = [];

  for (const fee of fees) {
    if (isPlatformFee(fee.name)) {
      platformFees.push(fee);
    } else {
      processingFees.push(fee);
    }
  }

  return { processingFees, platformFees };
}

/**
 * Sum an array of fee objects.
 *
 * @param {object[]} fees — array of { name, amount }
 * @returns {number}
 */
export function sumFees(fees) {
  return fees.reduce((total, f) => total + (f.amount || 0), 0);
}
