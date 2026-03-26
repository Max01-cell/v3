/**
 * Retell signature verification middleware.
 * All requests from Retell include X-Retell-Signature.
 * MUST use JSON.stringify(body) with NO extra args — Retell signs compact JSON.
 */

import { verifyRetellSignature } from '../services/retell.js';

export async function requireRetellSignature(request, reply) {
  const signature = request.headers['x-retell-signature'];

  if (!signature) {
    return reply.status(401).send({ error: 'Missing X-Retell-Signature header' });
  }

  try {
    const isValid = verifyRetellSignature(request.body, signature);
    if (!isValid) {
      return reply.status(403).send({ error: 'Invalid Retell signature' });
    }
  } catch (err) {
    request.log.error({ err }, 'Retell signature verification failed');
    return reply.status(403).send({ error: 'Signature verification failed' });
  }
}
