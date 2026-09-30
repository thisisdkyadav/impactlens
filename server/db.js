import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, 'impactlens.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,location TEXT NOT NULL,category TEXT NOT NULL,color TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),title TEXT NOT NULL,filename TEXT NOT NULL,kind TEXT NOT NULL,mime TEXT NOT NULL,url TEXT NOT NULL,thumbnail TEXT NOT NULL,local_path TEXT,public_id TEXT,cloud_asset_id TEXT,version INTEGER,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,width INTEGER,height INTEGER,duration REAL,captured_at TEXT NOT NULL,location TEXT NOT NULL,phase TEXT NOT NULL,notes TEXT NOT NULL,consent INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',review TEXT NOT NULL DEFAULT 'pending',review_note TEXT NOT NULL DEFAULT '',analysis TEXT NOT NULL DEFAULT '{}',embedding TEXT,embedding_model TEXT,demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(project_id,sha256));
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,asset_id TEXT REFERENCES assets(id),status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,available_at INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),before_id TEXT REFERENCES assets(id),after_id TEXT REFERENCES assets(id),analysis TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),title TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS derivatives(id TEXT PRIMARY KEY,asset_id TEXT REFERENCES assets(id),preset TEXT NOT NULL,url TEXT NOT NULL,transformation TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
CREATE INDEX IF NOT EXISTS assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS jobs_available ON jobs(status,available_at);
`);
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
export function verifyPassword(value, stored) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(value, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function audit(actor, action, entityId, detail = {}) {
  const previous =
    db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get()?.hash || '0'.repeat(64);
  const record = {
    actor,
    action,
    entity_id: entityId,
    detail: JSON.stringify(detail),
    created_at: now(),
    previous_hash: previous,
  };
  const hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  db.prepare(
    'INSERT INTO audit(actor,action,entity_id,detail,created_at,previous_hash,hash) VALUES(?,?,?,?,?,?,?)',
  ).run(...Object.values(record), hash);
}
export function verifyAudit() {
  let previous = '0'.repeat(64);
  for (const row of db.prepare('SELECT * FROM audit ORDER BY id').all()) {
    const record = {
      actor: row.actor,
      action: row.action,
      entity_id: row.entity_id,
      detail: row.detail,
      created_at: row.created_at,
      previous_hash: row.previous_hash,
    };
    if (
      row.previous_hash !== previous ||
      createHash('sha256').update(JSON.stringify(record)).digest('hex') !== row.hash
    )
      return { valid: false, brokenAt: row.id };
    previous = row.hash;
  }
  return { valid: true, head: previous, count: db.prepare('SELECT COUNT(*) n FROM audit').get().n };
}
export function assetView(row) {
  if (!row) return null;
  const { local_path, embedding, embedding_model, ...safe } = row;
  return {
    ...safe,
    analysis: JSON.parse(row.analysis),
    demo: Boolean(row.demo),
    consent: Boolean(row.consent),
    indexed: Boolean(row.embedding),
  };
}
export function enqueue(assetId) {
  if (
    db
      .prepare("SELECT id FROM jobs WHERE asset_id=? AND status IN ('queued','running')")
      .get(assetId)
  )
    return;
  db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)').run(
    id(),
    assetId,
    'queued',
    0,
    null,
    Date.now(),
    now(),
    now(),
  );
  db.prepare("UPDATE assets SET status='queued',review='pending',review_note='' WHERE id=?").run(
    assetId,
  );
}
if (!db.prepare('SELECT id FROM users WHERE email=?').get(config.adminEmail)) {
  const userId = id();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    userId,
    config.adminEmail,
    'Workspace administrator',
    'admin',
    hashPassword(config.adminPassword),
  );
  audit('system', 'workspace.initialized', userId);
}
