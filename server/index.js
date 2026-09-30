import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, cloudEnabled } from './config.js';
import {
  db,
  id,
  now,
  audit,
  assetView,
  enqueue,
  verifyPassword,
  hashPassword,
  verifyAudit,
} from './db.js';
import { seed } from './seed.js';
import { storeMedia, derivative, presets, discardMedia } from './media.js';
import { compare, embed, cosine } from './ai.js';
import { startWorker } from './worker.js';
import { buildReport, reportView, renderPdf, csvCell } from './reports.js';
seed();
export const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: [
          "'self'",
          'https://images.unsplash.com',
          'https://res.cloudinary.com',
          'data:',
          'blob:',
        ],
        mediaSrc: ["'self'", 'https://res.cloudinary.com', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws://127.0.0.1:5173'],
        upgradeInsecureRequests: config.secure ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }),
);
app.use(express.json({ limit: '512kb' }));
app.use(
  '/api',
  rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false }),
);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const hash = (token) => createHash('sha256').update(token).digest('hex');
function session(req, _res, next) {
  const raw = req.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('impactlens_session='))
    ?.split('=')[1];
  const row =
    raw &&
    db
      .prepare(
        'SELECT users.id,users.email,users.name,users.role,sessions.csrf,sessions.token FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?',
      )
      .get(hash(raw), Date.now());
  if (!row) return next(Object.assign(new Error('Please sign in.'), { status: 401 }));
  req.user = row;
  next();
}
function origin(req, _res, next) {
  const allowed = new Set([
    config.origin,
    ...(config.demo ? [`http://127.0.0.1:${config.port}`] : []),
  ]);
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers.origin &&
    !allowed.has(req.headers.origin)
  )
    return next(Object.assign(new Error('Request origin is not allowed.'), { status: 403 }));
  next();
}
function csrf(req, _res, next) {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers['x-csrf-token'] !== req.user.csrf
  )
    return next(
      Object.assign(new Error('Request security token is invalid. Refresh and try again.'), {
        status: 403,
      }),
    );
  next();
}
function role(...roles) {
  return (req, _res, next) =>
    roles.includes(req.user.role)
      ? next()
      : next(Object.assign(new Error('Your role does not permit this action.'), { status: 403 }));
}
const editor = role('admin', 'editor');
const reviewer = role('admin', 'reviewer');
const getAsset = (key) => {
  const row = db.prepare('SELECT * FROM assets WHERE id=?').get(key);
  if (!row) fail(404, 'Evidence not found.');
  return row;
};
const getProject = (key) => {
  const row = db.prepare('SELECT * FROM projects WHERE id=?').get(key);
  if (!row) fail(404, 'Project not found.');
  return row;
};
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value <= new Date().toISOString().slice(0, 10)
    );
  }, 'Capture date must be a valid date no later than today.');
app.use('/api', origin);
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'impactlens' }));
app.post(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }),
  (req, res) => {
    const body = z
      .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
      .parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(body.email.toLowerCase());
    if (!user || !verifyPassword(body.password, user.password))
      fail(401, 'Incorrect email or password.');
    const token = randomBytes(32).toString('hex'),
      csrfToken = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(
      hash(token),
      user.id,
      csrfToken,
      Date.now() + 12 * 3600000,
    );
    res.cookie('impactlens_session', token, {
      httpOnly: true,
      secure: config.secure,
      sameSite: 'strict',
      maxAge: 12 * 3600000,
      path: '/',
    });
    audit(user.id, 'auth.login', user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      csrf: csrfToken,
    });
  },
);
app.use('/api', session, csrf);
app.get('/api/auth/me', (req, res) => {
  const { token, csrf: csrfToken, ...user } = req.user;
  res.json({ user, csrf: csrfToken });
});
app.post('/api/auth/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.user.token);
  res.clearCookie('impactlens_session', { path: '/' });
  res.json({ ok: true });
});
app.get('/api/settings', (_req, res) =>
  res.json({
    demo: config.demo,
    cloudinary: cloudEnabled,
    vision: Boolean(config.aiKey),
    embeddingModel: config.embeddingModel,
    visionModel: config.visionModel,
    maxUploadMB: 25,
    storage: cloudEnabled ? 'Cloudinary' : 'Local disk',
    workspace: 'Single shared workspace',
  }),
);
app.get('/api/users', role('admin'), (_req, res) =>
  res.json(db.prepare('SELECT id,email,name,role FROM users').all()),
);
app.post('/api/users', role('admin'), (req, res) => {
  const input = z
    .object({
      email: z.string().email().max(200),
      name: z.string().min(2).max(100),
      password: z.string().min(12).max(200),
      role: z.enum(['editor', 'reviewer']),
    })
    .parse(req.body);
  if (db.prepare('SELECT id FROM users WHERE email=?').get(input.email.toLowerCase()))
    fail(409, 'Email already exists.');
  const userId = id();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    userId,
    input.email.toLowerCase(),
    input.name,
    input.role,
    hashPassword(input.password),
  );
  audit(req.user.id, 'user.created', userId, { role: input.role });
  res.status(201).json({ id: userId });
});
app.get('/api/dashboard', (_req, res) => {
  const totals = db
    .prepare(
      "SELECT COUNT(*) assets,SUM(review='approved') approved,SUM(review='pending') pending,SUM(kind='video') videos FROM assets",
    )
    .get();
  const projects = db
    .prepare(
      "SELECT p.*,COUNT(a.id) assets,SUM(a.review='approved') approved FROM projects p LEFT JOIN assets a ON a.project_id=p.id GROUP BY p.id ORDER BY p.created_at",
    )
    .all();
  const timeline = db
    .prepare(
      'SELECT substr(captured_at,1,7) month,COUNT(*) count FROM assets GROUP BY month ORDER BY month',
    )
    .all();
  res.json({
    totals: {
      ...totals,
      projects: projects.length,
      reports: db.prepare('SELECT COUNT(*) n FROM reports').get().n,
    },
    projects,
    timeline,
    recent: db
      .prepare('SELECT * FROM assets ORDER BY created_at DESC LIMIT 6')
      .all()
      .map(assetView),
    activity: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 6').all(),
    processing: db.prepare("SELECT COUNT(*) n FROM jobs WHERE status IN ('running','queued')").get()
      .n,
  });
});
app.get('/api/projects', (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT p.*,COUNT(a.id) assets,SUM(a.review='approved') approved FROM projects p LEFT JOIN assets a ON a.project_id=p.id GROUP BY p.id ORDER BY p.created_at DESC",
      )
      .all(),
  ),
);
app.post('/api/projects', editor, (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(3).max(100),
      description: z.string().trim().min(10).max(2000),
      location: z.string().trim().min(2).max(200),
      category: z.string().min(2).max(100),
    })
    .parse(req.body);
  const projectId = id();
  db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(
    projectId,
    body.name,
    body.description,
    body.location,
    body.category,
    '#277b69',
    now(),
  );
  audit(req.user.id, 'project.created', projectId, body);
  res.status(201).json(getProject(projectId));
});
app.get('/api/assets', async (req, res) => {
  const filters = z
    .object({
      project: z.string().optional(),
      kind: z.enum(['image', 'video']).optional(),
      review: z.enum(['pending', 'approved', 'rejected']).optional(),
      phase: z.enum(['before', 'during', 'after']).optional(),
      q: z.string().max(500).optional(),
      mode: z.enum(['keyword', 'semantic']).optional(),
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(req.query);
  const where = [],
    params = [];
  for (const [key, column] of Object.entries({
    project: 'project_id',
    kind: 'kind',
    review: 'review',
    phase: 'phase',
  }))
    if (filters[key]) {
      where.push(`${column}=?`);
      params.push(filters[key]);
    }
  if (filters.from) {
    where.push('captured_at>=?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('captured_at<=?');
    params.push(filters.to);
  }
  let rows = db
    .prepare(
      `SELECT * FROM assets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY captured_at DESC,created_at DESC`,
    )
    .all(...params);
  let searchMode = 'keyword';
  if (filters.q?.trim()) {
    const words = filters.q.toLowerCase().trim().split(/\s+/);
    let vector = null;
    if (filters.mode === 'semantic' && config.aiKey) {
      try {
        vector = await embed(filters.q);
        searchMode = 'hybrid';
      } catch {
        searchMode = 'keyword-fallback';
      }
    }
    rows = rows
      .map((row) => {
        const content = `${row.title} ${row.location} ${row.notes} ${row.analysis}`.toLowerCase();
        const keyword = words.filter((word) => content.includes(word)).length / words.length;
        const similarity =
          vector && row.embedding && row.embedding_model === config.embeddingModel
            ? cosine(vector, JSON.parse(row.embedding))
            : 0;
        return {
          ...row,
          score: vector ? 0.75 * Math.max(0, similarity) + 0.25 * keyword : keyword,
        };
      })
      .filter((row) => row.score > (vector ? 0.2 : 0))
      .sort((a, b) => b.score - a.score);
  }
  const total = rows.length;
  res.json({
    assets: rows.slice((filters.page - 1) * 24, filters.page * 24).map(assetView),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / 24)),
    searchMode,
  });
});
const upload = multer({
  dest: path.join(config.dataDir, 'uploads'),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 12 },
  fileFilter: (_req, file, callback) =>
    callback(
      null,
      ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.mimetype),
    ),
});
async function validateMagic(file) {
  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(16);
  await handle.read(header, 0, 16, 0);
  await handle.close();
  const checks = {
    'image/jpeg': header[0] === 255 && header[1] === 216 && header[2] === 255,
    'image/png': header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp':
      header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP',
    'video/mp4': header.toString('ascii', 4, 8) === 'ftyp',
    'video/webm': header.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
  };
  if (!checks[file.mimetype]) fail(415, 'File contents do not match the supplied media type.');
}
app.post('/api/assets', editor, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) fail(400, 'Choose a JPEG, PNG, WebP, MP4 or WebM file.');
  let keepFile = false;
  let storedMedia;
  let transactionOpen = false;
  try {
    const body = z
      .object({
        projectId: z.string().uuid(),
        title: z.string().trim().min(3).max(160),
        capturedAt: dateSchema,
        location: z.string().trim().min(2).max(200),
        phase: z.enum(['before', 'during', 'after']),
        notes: z.string().max(3000).default(''),
        consent: z.literal('true'),
      })
      .parse(req.body);
    getProject(body.projectId);
    await validateMagic(file);
    const sha256 = createHash('sha256')
      .update(await fs.readFile(file.path))
      .digest('hex');
    const existing = db
      .prepare('SELECT * FROM assets WHERE project_id=? AND sha256=?')
      .get(body.projectId, sha256);
    if (existing) {
      res
        .status(409)
        .json({ error: 'This exact media is already in this project.', existingId: existing.id });
      return;
    }
    const assetId = id(),
      media = await storeMedia(file, assetId, body.projectId);
    storedMedia = media;
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    db.prepare(
      `INSERT INTO assets(id,project_id,title,filename,kind,mime,url,thumbnail,local_path,public_id,cloud_asset_id,version,sha256,bytes,width,height,duration,captured_at,location,phase,notes,consent,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      assetId,
      body.projectId,
      body.title,
      path.basename(file.originalname),
      file.mimetype.startsWith('video/') ? 'video' : 'image',
      file.mimetype,
      media.url,
      media.thumbnail,
      media.local_path || null,
      media.public_id || null,
      media.cloud_asset_id || null,
      media.version || null,
      sha256,
      file.size,
      media.width || null,
      media.height || null,
      media.duration || null,
      body.capturedAt,
      body.location,
      body.phase,
      body.notes,
      1,
      now(),
    );
    enqueue(assetId);
    audit(req.user.id, 'asset.uploaded', assetId, {
      sha256,
      projectId: body.projectId,
      storage: cloudEnabled ? 'cloudinary' : 'local',
      sourceFilename: path.basename(file.originalname),
    });
    db.exec('COMMIT');
    transactionOpen = false;
    keepFile = Boolean(media.local_path);
    storedMedia = undefined;
    res.status(201).json(assetView(getAsset(assetId)));
  } catch (error) {
    if (transactionOpen) db.exec('ROLLBACK');
    if (storedMedia)
      await discardMedia(storedMedia, file.mimetype.startsWith('video/') ? 'video' : 'image');
    if (error.message?.includes('UNIQUE constraint failed: assets.project_id, assets.sha256'))
      fail(409, 'This exact media was just uploaded to this project by another request.');
    throw error;
  } finally {
    if (!keepFile) await fs.unlink(file.path).catch(() => {});
  }
});
app.get('/api/assets/:id', (req, res) => {
  const asset = getAsset(req.params.id);
  res.json({
    ...assetView(asset),
    project: getProject(asset.project_id),
    history: db.prepare('SELECT * FROM audit WHERE entity_id=? ORDER BY id DESC').all(asset.id),
    derivatives: db
      .prepare('SELECT * FROM derivatives WHERE asset_id=? ORDER BY created_at DESC')
      .all(asset.id),
  });
});
app.post('/api/assets/:id/reanalyze', editor, (req, res) => {
  getAsset(req.params.id);
  enqueue(req.params.id);
  audit(req.user.id, 'analysis.requested', req.params.id);
  res.json({ ok: true });
});
app.patch('/api/assets/:id/review', reviewer, (req, res) => {
  const asset = getAsset(req.params.id);
  if (asset.status !== 'ready') fail(409, 'Wait for processing to finish before reviewing.');
  const body = z
    .object({
      review: z.enum(['approved', 'rejected', 'pending']),
      note: z.string().trim().min(5).max(2000),
    })
    .parse(req.body);
  db.prepare('UPDATE assets SET review=?,review_note=? WHERE id=?').run(
    body.review,
    body.note,
    asset.id,
  );
  audit(req.user.id, 'asset.reviewed', asset.id, body);
  res.json(assetView(getAsset(asset.id)));
});
app.post('/api/assets/:id/derivatives', editor, async (req, res) => {
  const asset = getAsset(req.params.id);
  if (asset.review !== 'approved') fail(409, 'Approve evidence before creating campaign media.');
  const { preset } = z.object({ preset: z.enum(Object.keys(presets)) }).parse(req.body);
  res.status(201).json(await derivative(asset, preset, req.user.id));
});
app.get('/api/jobs', (_req, res) =>
  res.json(
    db
      .prepare(
        'SELECT j.*,a.title FROM jobs j JOIN assets a ON a.id=j.asset_id ORDER BY j.created_at DESC LIMIT 100',
      )
      .all(),
  ),
);
app.get('/api/comparisons', (_req, res) =>
  res.json(
    db
      .prepare('SELECT * FROM comparisons ORDER BY created_at DESC')
      .all()
      .map((row) => ({ ...row, analysis: JSON.parse(row.analysis) })),
  ),
);
app.post('/api/comparisons', editor, async (req, res) => {
  const body = z
    .object({ beforeId: z.string().uuid(), afterId: z.string().uuid() })
    .parse(req.body);
  const before = getAsset(body.beforeId),
    after = getAsset(body.afterId);
  if (before.id === after.id || before.project_id !== after.project_id)
    fail(400, 'Choose two different records from the same project.');
  if (before.captured_at >= after.captured_at)
    fail(400, 'The follow-up capture date must be later than the baseline.');
  if (before.status !== 'ready' || after.status !== 'ready')
    fail(409, 'Both assets must finish processing.');
  const analysis = await compare(before, after),
    comparisonId = id();
  db.prepare('INSERT INTO comparisons VALUES(?,?,?,?,?,?)').run(
    comparisonId,
    before.project_id,
    before.id,
    after.id,
    JSON.stringify(analysis),
    now(),
  );
  audit(req.user.id, 'comparison.created', comparisonId, {
    beforeId: before.id,
    afterId: after.id,
    provider: analysis.provider,
  });
  res.status(201).json({
    id: comparisonId,
    project_id: before.project_id,
    before_id: before.id,
    after_id: after.id,
    analysis,
    created_at: now(),
  });
});
app.get('/api/reports', (_req, res) =>
  res.json(db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all().map(reportView)),
);
app.post('/api/reports', reviewer, (req, res) => {
  const body = z
    .object({
      projectId: z.string().uuid(),
      title: z.string().trim().min(3).max(160),
      assetIds: z.array(z.string().uuid()).min(1).max(100),
      metrics: z
        .array(
          z.object({
            label: z.string().min(2).max(120),
            value: z.number().finite().nonnegative(),
            unit: z.string().min(1).max(50),
            evidenceId: z.string().uuid(),
            method: z.string().min(10).max(1500),
          }),
        )
        .max(20)
        .default([]),
    })
    .parse(req.body);
  const project = getProject(body.projectId),
    selected = [...new Set(body.assetIds)].map(getAsset);
  if (
    selected.some(
      (a) => a.project_id !== project.id || a.review !== 'approved' || a.status !== 'ready',
    )
  )
    fail(422, 'Reports require ready, approved evidence from the selected project.');
  if (body.metrics.some((m) => !selected.some((a) => a.id === m.evidenceId && !a.demo)))
    fail(
      422,
      'Measurements must cite a real, selected evidence record. Demo media cannot support impact measurements.',
    );
  const reportId = id();
  const report = buildReport(project, body.title, selected, body.metrics);
  db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?)').run(
    reportId,
    project.id,
    body.title,
    JSON.stringify(report),
    'draft',
    now(),
  );
  audit(req.user.id, 'report.created', reportId, { assetIds: selected.map((a) => a.id) });
  res.status(201).json(reportView(db.prepare('SELECT * FROM reports WHERE id=?').get(reportId)));
});
app.get('/api/reports/:id/pdf', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);
  if (!report) fail(404, 'Report not found.');
  renderPdf(report, res);
});
app.post('/api/reports/:id/publish', reviewer, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);
  if (!report) fail(404, 'Report not found.');
  const body = JSON.parse(report.body);
  if (body.evidence.some((a) => a.demo))
    fail(422, 'Reports containing illustrative demo media cannot be published.');
  if (
    body.evidence.some((a) => {
      const current = getAsset(a.id);
      return current.review !== 'approved' || current.status !== 'ready';
    })
  )
    fail(422, 'Evidence review changed. Generate a fresh report after approval.');
  db.prepare("UPDATE reports SET status='published' WHERE id=?").run(report.id);
  audit(req.user.id, 'report.published', report.id);
  res.json({ ok: true });
});
app.get('/api/export', (req, res) => {
  const { format, project } = z
    .object({
      format: z.enum(['json', 'csv']).default('json'),
      project: z.string().uuid().optional(),
    })
    .parse(req.query);
  const assets = db
    .prepare(`SELECT * FROM assets ${project ? 'WHERE project_id=?' : ''} ORDER BY captured_at`)
    .all(...(project ? [project] : []))
    .map(assetView);
  res.setHeader('Content-Disposition', `attachment; filename="impactlens-evidence.${format}"`);
  if (format === 'json')
    return res.json({ exportedAt: now(), evidence: assets, audit: verifyAudit() });
  const columns = [
    'id',
    'project_id',
    'title',
    'kind',
    'captured_at',
    'location',
    'phase',
    'review',
    'url',
    'sha256',
  ];
  res
    .type('text/csv')
    .send(
      [
        columns.join(','),
        ...assets.map((asset) => columns.map((key) => csvCell(asset[key])).join(',')),
      ].join('\r\n'),
    );
});
app.get('/api/audit', (_req, res) =>
  res.json({
    verification: verifyAudit(),
    events: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all(),
  }),
);
// Authentication covers originals and derivatives on local disk.
app.use(
  '/media',
  session,
  express.static(path.join(config.dataDir, 'uploads'), {
    dotfiles: 'deny',
    index: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'private, max-age=3600'),
  }),
);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.static(path.join(root, 'dist')));
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return next();
  res.sendFile(path.join(root, 'dist', 'index.html'), (error) => {
    if (error) next(error);
  });
});
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') });
  if (error instanceof multer.MulterError)
    return res.status(400).json({
      error:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'File exceeds the 25 MB limit.'
          : 'Upload could not be accepted.',
    });
  const status = error.status || 500;
  if (status >= 500) console.error(`[impactlens] ${error.message}`);
  res.status(status).json({
    error: status === 500 ? 'Unexpected server error. Check the server log.' : error.message,
  });
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startWorker();
  const server = app.listen(config.port, config.host, () =>
    console.log(
      `ImpactLens API: http://${config.host}:${config.port} | ${config.demo ? 'DEMO' : 'LIVE'} | Storage: ${cloudEnabled ? 'Cloudinary' : 'local'}`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.close(() => {
        db.close();
        process.exit(0);
      });
    });
}
