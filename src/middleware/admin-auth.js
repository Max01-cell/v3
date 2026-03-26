/**
 * Admin authentication middleware.
 * Protects internal endpoints (outbound calls, batch campaigns).
 * Expects: Authorization: Bearer <ADMIN_API_KEY>
 */

export async function requireAdminAuth(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing Authorization header' });
  }

  const token = authHeader.slice(7);

  if (!process.env.ADMIN_API_KEY) {
    request.log.error('ADMIN_API_KEY is not set');
    return reply.status(500).send({ error: 'Server misconfiguration' });
  }

  if (token !== process.env.ADMIN_API_KEY) {
    return reply.status(403).send({ error: 'Invalid API key' });
  }
}
