/**
 * Environment variable loader + validation.
 * Fails fast on missing required variables.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, defaultValue = null) {
  return process.env[name] || defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  publicUrl: optionalEnv('PUBLIC_URL', 'http://localhost:3000'),

  // Retell AI
  retellApiKey: optionalEnv('RETELL_API_KEY'),
  retellColdCallAgentId: optionalEnv('RETELL_COLD_CALL_AGENT_ID'),
  retellFollowUpAgentId: optionalEnv('RETELL_FOLLOW_UP_AGENT_ID'),
  retellFromNumber: optionalEnv('RETELL_FROM_NUMBER'),

  // Anthropic (Claude)
  anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY'),

  // Resend
  resendApiKey: optionalEnv('RESEND_API_KEY'),
  fromEmail: optionalEnv('FROM_EMAIL', 'alex@01payments.com'),
  notificationEmail: optionalEnv('NOTIFICATION_EMAIL', 'maxh707@gmail.com'),

  // Admin auth
  adminApiKey: optionalEnv('ADMIN_API_KEY'),
};

/**
 * Validate all required variables are present.
 * Call this at server startup in production.
 */
export function validateConfig() {
  const required = [
    'RETELL_API_KEY',
    'ANTHROPIC_API_KEY',
    'RESEND_API_KEY',
    'ADMIN_API_KEY',
  ];

  const missing = required.filter(k => !process.env[k]);

  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (missing.length > 0) {
    console.warn(`[config] Warning: Missing env vars (ok in dev): ${missing.join(', ')}`);
  }
}
