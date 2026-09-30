import { db, audit, now } from './db.js';
import { analyze, embed } from './ai.js';
import { config } from './config.js';
let busy = false;
export function recoverJobs() {
  const exhausted = db.prepare("SELECT * FROM jobs WHERE status='running' AND attempts>=3").all();
  for (const job of exhausted) {
    db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=?").run(
      'Processing interrupted after the last allowed attempt. Retry analysis manually.',
      now(),
      job.id,
    );
    db.prepare("UPDATE assets SET status='failed' WHERE id=?").run(job.asset_id);
    audit('worker', 'analysis.recovery.exhausted', job.asset_id);
  }
  db.prepare(
    "UPDATE jobs SET status='queued',available_at=?,updated_at=? WHERE status='running'",
  ).run(Date.now(), now());
}
export async function processOne() {
  if (busy) return;
  const job = db
    .prepare(
      "SELECT * FROM jobs WHERE status='queued' AND available_at<=? ORDER BY created_at LIMIT 1",
    )
    .get(Date.now());
  if (!job) return;
  busy = true;
  try {
    db.prepare("UPDATE jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=?").run(
      now(),
      job.id,
    );
    db.prepare("UPDATE assets SET status='analyzing' WHERE id=?").run(job.asset_id);
    const asset = db.prepare('SELECT * FROM assets WHERE id=?').get(job.asset_id);
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(asset.project_id);
    const analysis = await analyze(asset, project);
    let vector = null;
    try {
      if (!asset.demo)
        vector = await embed(
          `${asset.title} ${asset.location} ${analysis.summary} ${analysis.tags.join(' ')} ${analysis.signals.join(' ')}`,
        );
    } catch {
      analysis.uncertainty.push(
        'Semantic indexing failed; keyword search remains available. Retry analysis to rebuild the index.',
      );
    }
    db.prepare(
      "UPDATE assets SET analysis=?,embedding=?,embedding_model=?,status='ready' WHERE id=?",
    ).run(
      JSON.stringify(analysis),
      vector ? JSON.stringify(vector) : null,
      vector ? config.embeddingModel : null,
      asset.id,
    );
    db.prepare("UPDATE jobs SET status='completed',error=NULL,updated_at=? WHERE id=?").run(
      now(),
      job.id,
    );
    audit('worker', 'asset.analyzed', asset.id, {
      provider: analysis.provider,
      model: analysis.model || null,
      indexed: Boolean(vector),
    });
  } catch (error) {
    const failed = job.attempts + 1 >= 3;
    db.prepare('UPDATE jobs SET status=?,error=?,available_at=?,updated_at=? WHERE id=?').run(
      failed ? 'failed' : 'queued',
      error.message.slice(0, 400),
      Date.now() + 5000 * 2 ** job.attempts,
      now(),
      job.id,
    );
    db.prepare('UPDATE assets SET status=? WHERE id=?').run(
      failed ? 'failed' : 'queued',
      job.asset_id,
    );
    audit('worker', failed ? 'analysis.failed' : 'analysis.retry.scheduled', job.asset_id, {
      error: error.message.slice(0, 400),
    });
  } finally {
    busy = false;
  }
}
export function startWorker() {
  recoverJobs();
  const interval = setInterval(() => {
    void processOne();
  }, 1000);
  interval.unref();
  return interval;
}
