// server.ts — HTTP API server for the Screener pipeline (Render deployment)

import express from 'express';
import { Pipeline } from './pipeline';
import { loadConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = process.env.PORT || 10000;
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const OUTPUT_DIR = path.join(__dirname, '..', 'generated-tests');

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'screener-playwright-crawler', version: '2.1.0' });
});

// Dashboard
app.get('/', (_req, res) => {
  const dashboard = path.join(__dirname, '..', 'index.html');
  if (fs.existsSync(dashboard)) {
    res.sendFile(dashboard);
  } else {
    res.json({
      name: 'Screener Playwright Crawler',
      endpoints: ['/health', '/api/run', '/api/reports', '/api/reports/:name'],
    });
  }
});

/**
 * POST /api/run
 * Run the 14-step pipeline against a target URL.
 * Body: { url: string, maxPages?: number }
 */
app.post('/api/run', async (req, res) => {
  const { url, maxPages = 10 } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" in request body' });
  }

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'URL must use http:// or https://' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Run pipeline in background
  res.status(202).json({
    message: 'Pipeline started',
    target: url,
    statusUrl: '/api/status',
  });

  // Execute pipeline (fire and forget — user checks /api/reports for results)
  (async () => {
    try {
      const config = loadConfig({ seedUrls: [url], maxPages });
      const pipeline = new Pipeline(config, OUTPUT_DIR);
      await pipeline.run();
      console.log(`Pipeline completed for ${url}`);
    } catch (err: any) {
      console.error(`Pipeline failed for ${url}:`, err.message);
    }
  })();
});

/**
 * GET /api/status
 * Latest pipeline run status
 */
app.get('/api/status', (_req, res) => {
  const runFile = path.join(REPORTS_DIR, 'pipeline-run.json');
  if (fs.existsSync(runFile)) {
    return res.json(JSON.parse(fs.readFileSync(runFile, 'utf-8')));
  }
  res.json({ status: 'no-pipeline-run-yet' });
});

/**
 * GET /api/reports
 * List all generated reports
 */
app.get('/api/reports', (_req, res) => {
  if (!fs.existsSync(REPORTS_DIR)) {
    return res.json({ reports: [] });
  }
  const reports = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(REPORTS_DIR, f));
      return {
        name: f,
        size: stat.size,
        modifiedAt: stat.mtime,
      };
    });
  res.json({ reports });
});

/**
 * GET /api/reports/:name
 * Get a specific report
 */
app.get('/api/reports/:name', (req, res) => {
  const name = path.basename(req.params.name); // prevent path traversal
  const filePath = path.join(REPORTS_DIR, name);

  if (!fs.existsSync(filePath) || !filePath.endsWith('.json')) {
    return res.status(404).json({ error: `Report "${name}" not found` });
  }

  res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
});

app.listen(PORT, () => {
  console.log(`🦞 Screener API listening on port ${PORT}`);
});
