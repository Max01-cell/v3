/**
 * Currency, percentage, and number formatters.
 */

/**
 * Format a number as USD currency string.
 * @param {number} n
 * @returns {string} e.g., "$1,234.56"
 */
export function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n);
}

/**
 * Format a decimal as a percentage string.
 * @param {number} n — decimal, e.g., 0.0175
 * @param {number} decimals — decimal places (default 2)
 * @returns {string} e.g., "1.75%"
 */
export function formatPercent(n, decimals = 2) {
  return `${(n * 100).toFixed(decimals)}%`;
}

/**
 * Round to 2 decimal places (matches engine's round2 utility).
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Format a number with commas.
 * @param {number} n
 * @returns {string} e.g., "65,000"
 */
export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n);
}
