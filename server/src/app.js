'use strict';

/**
 * Builds the Express app. Exported for tests and for the Vercel wrapper.
 * No app.listen here — see server.js.
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ValidationError } = require('./lib/validation');

const healthRouter = require('./routes/health');
const worldsRouter = require('./routes/worlds');
const jobsRouter = require('./routes/jobs');
const leaderboardRouter = require('./routes/leaderboard');
const achievementsRouter = require('./routes/achievements');
const tutorialRouter = require('./routes/tutorial');
const identityRouter = require('./routes/identity');

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  const clientOrigin = process.env.CLIENT_ORIGIN;
  app.use(
    cors({
      origin: clientOrigin || (process.env.NODE_ENV === 'production' ? false : '*'),
    })
  );

  // 12MB JSON body budget: cover data URLs may be up to 10MB.
  app.use(express.json({ limit: '12mb' }));

  // Global rate limit: 300 requests / 15 min per IP.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    })
  );

  app.use('/api/health', healthRouter);
  app.use('/api/worlds', worldsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/achievements', achievementsRouter);
  app.use('/api/tutorial', tutorialRouter);
  app.use('/api/identity', identityRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError || err.status === 400) {
      return res.status(400).json({ error: err.message || 'Bad request' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const app = createApp();

module.exports = app;
