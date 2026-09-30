import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'impactlens-tests-'));
process.env.DATA_DIR = directory;
process.env.DEMO_MODE = 'true';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'TestingPassword!2026';
process.env.OPENAI_API_KEY = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
const { app } = await import('../server/index.js');
const { db, verifyAudit, hashPassword, verifyPassword } = await import('../server/db.js');
const { processOne, recoverJobs } = await import('../server/worker.js');
const { cosine, analyze, embed, compare, analysisSchema } = await import('../server/ai.js');
const { config } = await import('../server/config.js');
const { csvCell } = await import('../server/reports.js');
let server,
  base,
  cookie,
  csrf,
  project,
  beforeAsset,
  afterAsset,
  report,
  editorCookie,
  editorCsrf,
  reviewerCookie,
  reviewerCsrf;
const pixel = await sharp({
  create: { width: 100, height: 80, channels: 3, background: { r: 50, g: 125, b: 65 } },
})
  .png()
  .toBuffer();
const secondPixel = await sharp({
  create: { width: 100, height: 80, channels: 3, background: { r: 80, g: 155, b: 85 } },
})
  .png()
  .toBuffer();
async function call(route, { method = 'GET', body, as = 'admin', headers = {} } = {}) {
  const token = as === 'editor' ? editorCookie : as === 'reviewer' ? reviewerCookie : cookie;
  const csrfToken = as === 'editor' ? editorCsrf : as === 'reviewer' ? reviewerCsrf : csrf;
  return fetch(`${base}/api${route}`, {
    method,
    headers: {
      ...(token ? { Cookie: token } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken, Origin: config.origin } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
function uploadForm(buffer = pixel, overrides = {}) {
  const body = new FormData();
  body.set('file', new Blob([buffer], { type: 'image/png' }), 'field.png');
  for (const [key, value] of Object.entries({
    projectId: project.id,
    title: 'River survey baseline',
    capturedAt: '2026-01-15',
    location: 'Delhi field site',
    phase: 'before',
    notes: 'Field team photo record',
    consent: 'true',
    ...overrides,
  }))
    body.set(key, value);
  return body;
}
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await fs.rm(directory, { recursive: true, force: true });
});
test('health is public; protected endpoints require a session', async () => {
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/projects')).status, 401);
});
test('login validates credentials and sets HttpOnly cookie', async () => {
  assert.equal(
    (
      await call('/auth/login', {
        method: 'POST',
        body: { email: 'admin@test.local', password: 'wrong' },
      })
    ).status,
    401,
  );
  const res = await call('/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.local', password: 'TestingPassword!2026' },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /HttpOnly/i);
  cookie = res.headers.get('set-cookie').split(';')[0];
  csrf = (await res.json()).csrf;
  assert.equal((await call('/auth/me')).status, 200);
});
test('CSRF and cross-origin writes are rejected', async () => {
  assert.equal(
    (await call('/projects', { method: 'POST', body: {}, headers: { 'X-CSRF-Token': 'wrong' } }))
      .status,
    403,
  );
  assert.equal(
    (
      await call('/projects', {
        method: 'POST',
        body: {},
        headers: { Origin: 'https://attacker.example' },
      })
    ).status,
    403,
  );
});
test('create a real project and reject invalid fields', async () => {
  assert.equal((await call('/projects', { method: 'POST', body: { name: 'x' } })).status, 400);
  const res = await call('/projects', {
    method: 'POST',
    body: {
      name: 'Measured restoration',
      description: 'A real field trial for verified documentation.',
      location: 'Delhi, India',
      category: 'Water & ecosystems',
    },
  });
  assert.equal(res.status, 201);
  project = await res.json();
});
test('upload preserves original hash and serves authenticated image MIME', async () => {
  const res = await call('/assets', { method: 'POST', body: uploadForm() });
  assert.equal(res.status, 201);
  beforeAsset = await res.json();
  assert.equal(beforeAsset.status, 'queued');
  assert.match(beforeAsset.sha256, /^[0-9a-f]{64}$/);
  const media = await fetch(`${base}${beforeAsset.url}`, { headers: { Cookie: cookie } });
  assert.equal(media.status, 200);
  assert.match(media.headers.get('content-type'), /image\/png/);
  assert.equal((await fetch(`${base}${beforeAsset.url}`)).status, 401);
});
test('duplicate media is rejected without creating duplicate evidence', async () => {
  assert.equal((await call('/assets', { method: 'POST', body: uploadForm() })).status, 409);
});
test('spoofed media, missing consent and invalid dates are rejected', async () => {
  assert.equal(
    (await call('/assets', { method: 'POST', body: uploadForm(Buffer.from('not-a-png')) })).status,
    415,
  );
  assert.equal(
    (await call('/assets', { method: 'POST', body: uploadForm(secondPixel, { consent: 'false' }) }))
      .status,
    400,
  );
  assert.equal(
    (
      await call('/assets', {
        method: 'POST',
        body: uploadForm(secondPixel, { capturedAt: '2026-02-30' }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('/assets', {
        method: 'POST',
        body: uploadForm(secondPixel, { capturedAt: '2099-01-01' }),
      })
    ).status,
    400,
  );
});
test('worker produces honest metadata fallback and durable completed job', async () => {
  await processOne();
  const asset = await (await call(`/assets/${beforeAsset.id}`)).json();
  assert.equal(asset.status, 'ready');
  assert.equal(asset.analysis.provider, 'metadata');
  assert.match(asset.analysis.summary, /not enabled/);
  const jobs = await (await call('/jobs')).json();
  assert.equal(jobs.find((j) => j.asset_id === asset.id).status, 'completed');
});
test('review notes are required; approve real evidence', async () => {
  assert.equal(
    (
      await call(`/assets/${beforeAsset.id}/review`, {
        method: 'PATCH',
        body: { review: 'approved', note: 'x' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/assets/${beforeAsset.id}/review`, {
        method: 'PATCH',
        body: { review: 'approved', note: 'Reviewed original record and collection context.' },
      })
    ).status,
    200,
  );
});
test('keyword filters, pagination and export return traceable records', async () => {
  const result = await (await call(`/assets?project=${project.id}&q=river&review=approved`)).json();
  assert.equal(result.total, 1);
  assert.equal(result.assets[0].id, beforeAsset.id);
  assert.equal((await call('/assets?page=0')).status, 400);
  const exported = await (await call(`/export?format=json&project=${project.id}`)).json();
  assert.equal(exported.evidence.length, 1);
  assert.equal(exported.audit.valid, true);
  assert.match(await (await call(`/export?format=csv&project=${project.id}`)).text(), /sha256/);
});
test('campaign derivative is a real crop with recorded provenance', async () => {
  const res = await call(`/assets/${beforeAsset.id}/derivatives`, {
    method: 'POST',
    body: { preset: 'square' },
  });
  assert.equal(res.status, 201);
  const crop = await res.json();
  const buffer = Buffer.from(
    await (await fetch(`${base}${crop.url}`, { headers: { Cookie: cookie } })).arrayBuffer(),
  );
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1080);
  assert.equal(JSON.parse(crop.transformation).provider, 'sharp');
});
test('upload and approve later evidence for comparison', async () => {
  const res = await call('/assets', {
    method: 'POST',
    body: uploadForm(secondPixel, {
      title: 'River survey follow-up',
      capturedAt: '2026-06-15',
      phase: 'after',
    }),
  });
  assert.equal(res.status, 201);
  afterAsset = await res.json();
  await processOne();
  assert.equal(
    (
      await call(`/assets/${afterAsset.id}/review`, {
        method: 'PATCH',
        body: { review: 'approved', note: 'Field follow-up checked against collection notes.' },
      })
    ).status,
    200,
  );
});
test('comparison enforces project and chronology; fallback invents no measurements', async () => {
  assert.equal(
    (
      await call('/comparisons', {
        method: 'POST',
        body: { beforeId: afterAsset.id, afterId: beforeAsset.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('/comparisons', {
        method: 'POST',
        body: { beforeId: beforeAsset.id, afterId: beforeAsset.id },
      })
    ).status,
    400,
  );
  const demo = (await (await call('/assets')).json()).assets.find(
    (a) => a.project_id !== project.id,
  );
  assert.equal(
    (
      await call('/comparisons', {
        method: 'POST',
        body: { beforeId: beforeAsset.id, afterId: demo.id },
      })
    ).status,
    400,
  );
  const res = await call('/comparisons', {
    method: 'POST',
    body: { beforeId: beforeAsset.id, afterId: afterAsset.id },
  });
  assert.equal(res.status, 201);
  const pair = await res.json();
  assert.equal(pair.analysis.provider, 'manual');
  assert.deepEqual(pair.analysis.changes, []);
});
test('report snapshots cite evidence and validated manual measurement', async () => {
  const res = await call('/reports', {
    method: 'POST',
    body: {
      projectId: project.id,
      title: 'Verified field report',
      assetIds: [beforeAsset.id, afterAsset.id],
      metrics: [
        {
          label: 'Collected waste',
          value: 120,
          unit: 'kg',
          evidenceId: afterAsset.id,
          method: 'Field team weighbridge record checked by reviewer.',
        },
      ],
    },
  });
  assert.equal(res.status, 201);
  report = await res.json();
  assert.equal(report.body.evidence.length, 2);
  assert.equal(report.body.comparisons.length, 1);
  assert.equal(report.body.metrics[0].value, 120);
  assert.match(report.body.evidence[0].reference, /^E-/);
});
test('PDF export is a real PDF and report publication checks current review', async () => {
  const res = await call(`/reports/${report.id}/pdf`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/pdf/);
  const pdf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
  assert.equal(
    (await call(`/reports/${report.id}/publish`, { method: 'POST', body: {} })).status,
    200,
  );
});
test('demo evidence cannot support measurements or published impact claims', async () => {
  const demo = (await (await call('/assets')).json()).assets.find((a) => a.demo);
  await call(`/assets/${demo.id}/review`, {
    method: 'PATCH',
    body: { review: 'approved', note: 'Illustrative stock photo approved for demonstration only.' },
  });
  const body = { projectId: demo.project_id, title: 'Demo draft', assetIds: [demo.id] };
  assert.equal(
    (
      await call('/reports', {
        method: 'POST',
        body: {
          ...body,
          metrics: [
            {
              label: 'Impact',
              value: 5,
              unit: 'kg',
              evidenceId: demo.id,
              method: 'This is an unsupported demo measurement.',
            },
          ],
        },
      })
    ).status,
    422,
  );
  const draft = await (await call('/reports', { method: 'POST', body })).json();
  assert.equal(
    (await call(`/reports/${draft.id}/publish`, { method: 'POST', body: {} })).status,
    422,
  );
});
test('reanalysis resets approval and blocks stale report publishing', async () => {
  assert.equal(
    (await call(`/assets/${afterAsset.id}/reanalyze`, { method: 'POST', body: {} })).status,
    200,
  );
  assert.equal(
    (await call(`/reports/${report.id}/publish`, { method: 'POST', body: {} })).status,
    422,
  );
  assert.equal((await (await call(`/assets/${afterAsset.id}`)).json()).review, 'pending');
});
test('admin creates separate editor/reviewer users', async () => {
  for (const role of ['editor', 'reviewer']) {
    assert.equal(
      (
        await call('/users', {
          method: 'POST',
          body: {
            email: `${role}@test.local`,
            name: `Test ${role}`,
            password: 'TeamPassword!2026',
            role,
          },
        })
      ).status,
      201,
    );
    const res = await call('/auth/login', {
      method: 'POST',
      body: { email: `${role}@test.local`, password: 'TeamPassword!2026' },
    });
    const session = await res.json();
    if (role === 'editor') {
      editorCookie = res.headers.get('set-cookie').split(';')[0];
      editorCsrf = session.csrf;
    } else {
      reviewerCookie = res.headers.get('set-cookie').split(';')[0];
      reviewerCsrf = session.csrf;
    }
  }
});
test('role boundaries separate editing and review', async () => {
  assert.equal(
    (
      await call(`/assets/${beforeAsset.id}/review`, {
        method: 'PATCH',
        as: 'editor',
        body: { review: 'approved', note: 'Editor cannot approve their own work.' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await call('/projects', { method: 'POST', as: 'reviewer', body: { name: 'Test' } })).status,
    403,
  );
  assert.equal((await call('/users', { as: 'editor' })).status, 403);
});
test('audit is hash-linked and database rejects mutation', () => {
  assert.equal(verifyAudit().valid, true);
  assert.throws(
    () => db.prepare('UPDATE audit SET action=? WHERE id=1').run('tamper'),
    /append-only/,
  );
  assert.throws(() => db.prepare('DELETE FROM audit WHERE id=1').run(), /append-only/);
});
test('interrupted running jobs recover to the queue', () => {
  const job = db.prepare("SELECT * FROM jobs WHERE status='queued' LIMIT 1").get();
  db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(job.id);
  recoverJobs();
  assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id).status, 'queued');
});
test('password hashes are salted and CSV exports mitigate formula execution', () => {
  const a = hashPassword('A-password'),
    b = hashPassword('A-password');
  assert.notEqual(a, b);
  assert.equal(verifyPassword('A-password', a), true);
  assert.equal(verifyPassword('wrong', a), false);
  assert.match(csvCell('=CMD()'), /^"'/);
  assert.equal(csvCell('a"b'), '"a""b"');
});
test('cosine similarity and AI schema validation reject invalid metadata', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  assert.equal(cosine([1], [1, 2]), 0);
  assert.equal(analysisSchema.safeParse({ confidence: 2 }).success, false);
});
test('live AI request contract includes vision input and embeddings; mocked, no billable calls', async () => {
  const realFetch = global.fetch;
  const requests = [];
  const analysis = {
    summary: 'Visible vegetation near the riverbank.',
    tags: ['vegetation'],
    activities: ['Field monitoring'],
    signals: ['Visible vegetation'],
    uncertainty: ['Location is uploader-supplied.'],
    suggestedProject: project.name,
    confidence: 0.7,
  };
  config.aiKey = 'test-contract-key';
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () =>
        url.endsWith('/embeddings')
          ? { data: [{ embedding: [0.1, 0.2, 0.3] }] }
          : { choices: [{ message: { content: JSON.stringify(analysis) } }] },
    };
  };
  try {
    const stored = db.prepare('SELECT * FROM assets WHERE id=?').get(beforeAsset.id);
    const result = await analyze(stored, project);
    assert.equal(result.provider, 'openai');
    assert.equal(requests[0].body.messages[1].content[1].type, 'image_url');
    assert.match(
      requests[0].body.messages[1].content[1].image_url.url,
      /^data:image\/jpeg;base64,/,
    );
    assert.deepEqual(await embed('riverbank'), [0.1, 0.2, 0.3]);
    assert.equal(requests[1].body.dimensions, 512);
  } finally {
    global.fetch = realFetch;
    config.aiKey = '';
  }
});
test('live service failures retry twice then expose durable failed state', async () => {
  const realFetch = global.fetch;
  config.aiKey = 'test-contract-key';
  global.fetch = async () => ({ ok: false, status: 429 });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      db.prepare("UPDATE jobs SET available_at=0 WHERE status='queued'").run();
      await processOne();
    }
    const asset = db.prepare('SELECT status FROM assets WHERE id=?').get(afterAsset.id);
    assert.equal(asset.status, 'failed');
    const job = db
      .prepare('SELECT * FROM jobs WHERE asset_id=? ORDER BY created_at DESC LIMIT 1')
      .get(afterAsset.id);
    assert.equal(job.attempts, 3);
    assert.match(job.error, /429/);
  } finally {
    global.fetch = realFetch;
    config.aiKey = '';
  }
});
test('a restart does not exceed the three-attempt job limit', () => {
  const job = db
    .prepare('SELECT * FROM jobs WHERE asset_id=? ORDER BY created_at DESC LIMIT 1')
    .get(afterAsset.id);
  db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(job.id);
  recoverJobs();
  const recovered = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.attempts, 3);
  assert.match(recovered.error, /last allowed attempt/);
});
test('simultaneous duplicate uploads produce one source and clean temporary files', async () => {
  const thirdPixel = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 150, g: 90, b: 40 } },
  })
    .png()
    .toBuffer();
  const oldFiles = await fs.readdir(path.join(directory, 'uploads'));
  const responses = await Promise.all([
    call('/assets', {
      method: 'POST',
      body: uploadForm(thirdPixel, { title: 'Concurrent upload verification' }),
    }),
    call('/assets', {
      method: 'POST',
      body: uploadForm(thirdPixel, { title: 'Concurrent upload verification' }),
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    db
      .prepare('SELECT COUNT(*) n FROM assets WHERE project_id=? AND title=?')
      .get(project.id, 'Concurrent upload verification').n,
    1,
  );
  const newFiles = await fs.readdir(path.join(directory, 'uploads'));
  assert.equal(newFiles.length, oldFiles.length + 1);
  assert.equal(verifyAudit().valid, true);
});
test('logout revokes the session', async () => {
  assert.equal((await call('/auth/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await call('/projects')).status, 401);
});
