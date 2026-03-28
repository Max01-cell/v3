/**
 * Dynamic margin calculator.
 * Revenue model: merchant saves 65-70%, we keep 30-35%.
 * Split depends on monthly card volume.
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Get the margin tier based on total monthly volume.
 *
 * @param {number} totalVolume — monthly card volume in dollars
 * @returns {{ merchantShare: number, ourShare: number, label: string }}
 */
export function getMarginTier(totalVolume) {
  // 70/30 is the maximum split — 75/25 was removed (all merchants are M2M,
  // and 70% is the right merchant share at any volume above $25k)
  if (totalVolume >= 25000) {
    return { merchantShare: 0.70, ourShare: 0.30, label: '70/30' };
  }
  return { merchantShare: 0.65, ourShare: 0.35, label: '65/35' };
}

/**
 * Apply margin to a savings gap.
 *
 * @param {number} savingsGap — currentCost - floorCost
 * @param {number} totalVolume — for margin tier selection
 * @returns {{ merchantSavings: number, ourResidual: number, marginLabel: string }}
 */
export function applyMargin(savingsGap, totalVolume) {
  // If savings gap is zero or negative, no savings to split
  if (savingsGap <= 0) {
    return { merchantSavings: 0, ourResidual: 0, marginLabel: 'N/A' };
  }

  const tier = getMarginTier(totalVolume);

  return {
    merchantSavings: round2(savingsGap * tier.merchantShare),
    ourResidual: round2(savingsGap * tier.ourShare),
    marginLabel: tier.label,
  };
}
