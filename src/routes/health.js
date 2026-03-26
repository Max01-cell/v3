/**
 * Health check route.
 * GET /api/health → used by Railway healthcheck.
 */

export default async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      processors: fastify.processors?.length ?? 0,
    };
  });
}
