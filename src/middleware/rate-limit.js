/**
 * Rate limiting configuration.
 * Used by @fastify/rate-limit registered in server.js.
 * Routes opt in by setting config.rateLimit.
 *
 * Default public endpoint limit: 5 requests per minute per IP.
 */

export const defaultRateLimit = {
  max: 5,
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    error: 'Too many requests',
    message: `Rate limit exceeded. Try again after ${new Date(context.after).toISOString()}`,
    retryAfter: context.after,
  }),
};
