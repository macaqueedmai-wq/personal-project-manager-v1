import { existsSync } from 'node:fs';
import path from 'node:path';
import connectPgSimple from 'connect-pg-simple';
import express, { type Express } from 'express';
import session from 'express-session';
import type { AppConfig } from './config.js';
import type { DbPool } from './db/pool.js';
import { assertDatabaseReady } from './db/readiness.js';
import {
  apiNotFound,
  createErrorHandler,
  requestContext,
  securityHeaders
} from './middleware/error-handler.js';
import { requireAuth } from './middleware/auth.js';
import { requireCsrf } from './middleware/csrf.js';
import { originCheck } from './middleware/origin-check.js';
import { createAreasRouter } from './routes/areas.js';
import { createAuthRouter } from './routes/auth.js';
import { createBackupRouter } from './routes/backup.js';
import { createCalendarRouter } from './routes/calendar.js';
import { createContactsRouter, createInteractionsRouter } from './routes/contacts.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createEventsRouter } from './routes/events.js';
import { createFocusRouter } from './routes/focus.js';
import { createHabitsRouter } from './routes/habits.js';
import { createHealthRouter } from './routes/health.js';
import { createProjectsRouter } from './routes/projects.js';
import { createResourcesRouter } from './routes/resources.js';
import { createSearchRouter } from './routes/search.js';
import { createSettingsRouter } from './routes/settings.js';
import { createTasksRouter } from './routes/tasks.js';
import { LoginRateLimiter } from './services/auth.js';

export interface CreateAppOptions {
  config: AppConfig;
  pool: DbPool;
  serveClient?: boolean;
  logger?: Pick<Console, 'error'>;
  limiter?: LoginRateLimiter;
}

export function createApp({
  config,
  pool,
  serveClient = false,
  logger = console,
  limiter = new LoginRateLimiter()
}: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);

  app.use(requestContext);
  app.use(securityHeaders);
  app.use(
    express.json({
      limit: '20mb',
      verify: (req, _res, buffer) => {
        (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      }
    })
  );
  app.use(originCheck(config));

  const PgSessionStore = connectPgSimple(session);
  app.use(
    session({
      name: config.sessionCookieName,
      secret: config.sessionSecret,
      store: new PgSessionStore({
        pool,
        tableName: 'sessions',
        createTableIfMissing: false,
        pruneSessionInterval: 15 * 60
      }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.nodeEnv === 'production',
        maxAge: config.sessionMaxAgeMs
      }
    })
  );

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await assertDatabaseReady(pool);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/v1/auth', createAuthRouter({ config, pool, limiter }));

  app.use('/api/v1', requireAuth(pool, config), requireCsrf);
  app.use('/api/v1/areas', createAreasRouter(pool));
  app.use('/api/v1/dashboard', createDashboardRouter(pool));
  app.use('/api/v1/calendar', createCalendarRouter(pool));
  app.use('/api/v1/tasks', createTasksRouter(pool));
  app.use('/api/v1/projects', createProjectsRouter(pool));
  app.use('/api/v1/focus', createFocusRouter(pool));
  app.use('/api/v1/events', createEventsRouter(pool));
  app.use('/api/v1/contacts', createContactsRouter(pool));
  app.use('/api/v1/interactions', createInteractionsRouter(pool));
  app.use('/api/v1/resources', createResourcesRouter(pool));
  app.use('/api/v1/habits', createHabitsRouter(pool));
  app.use('/api/v1/health-entries', createHealthRouter(pool));
  app.use('/api/v1/search', createSearchRouter(pool));
  app.use('/api/v1/settings', createSettingsRouter(pool));
  app.use('/api/v1/backup', createBackupRouter(pool, config));

  app.use('/api', apiNotFound);

  if (serveClient) {
    const clientDir = path.resolve(process.cwd(), 'dist/client');
    const indexFile = path.join(clientDir, 'index.html');

    if (!existsSync(indexFile)) {
      throw new Error('找不到前端建置產物 dist/client/index.html，請先執行 npm run build。');
    }

    app.use(
      express.static(clientDir, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store');
          }
        }
      })
    );

    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/') || !req.accepts('html')) {
        next();
        return;
      }

      res.sendFile(indexFile);
    });
  }

  app.use(createErrorHandler(logger));

  return app;
}
