/**
 * Dynamic margin calculator.
 * Revenue model: merchant saves 65-75%, we keep 25-35%.
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
  if (totalVolume > 75000) {
    return { merchantShare: 0.75, ourShare: 0.25, label: '75/25' };
  }
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
