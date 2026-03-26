/**
 * Fastify server entry point.
 * Registers plugins, loads processor configs, initializes SQLite, mounts routes.
 */

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { config, validateConfig } from './config/index.js';
import { loadProcessors } from './services/processors.js';
import { initDatabase } from './services/leads.js';
import retellRoutes from './routes/retell.js';
import outboundRoutes from './routes/outbound.js';
import statementRoutes from './routes/statement.js';
import healthRoutes from './routes/health.js';

// Validate env vars (warns in dev, throws in production)
validateConfig();

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

await app.register(cors, { origin: true });

await app.register(multipart, {
  limits: { fileSize: 10_000_000 }, // 10MB PDF max
});

await app.register(rateLimit, {
  global: false, // routes opt in via config.rateLimit
});

// ---------------------------------------------------------------------------
// Startup: load processor configs + initialize database
// ---------------------------------------------------------------------------

const processors = loadProcessors();
app.decorate('processors', processors);
app.log.info(`Loaded ${processors.length} signed processor config(s): ${processors.map(p => p.id).join(', ')}`);

await initDatabase();
app.log.info('SQLite database initialized');

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.register(retellRoutes, { prefix: '/api/retell' });
app.register(outboundRoutes, { prefix: '/api/outbound' });
app.register(statementRoutes, { prefix: '/api/statement' });
app.register(healthRoutes, { prefix: '/api' });

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
