import 'dotenv/config';
import path from 'node:path';
export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  demo: process.env.DEMO_MODE !== 'false',
  secure: process.env.SECURE_COOKIES === 'true',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@impactlens.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'ImpactLens!2026',
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudKey: process.env.CLOUDINARY_API_KEY,
  cloudSecret: process.env.CLOUDINARY_API_SECRET,
  aiKey: process.env.OPENAI_API_KEY,
  visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini',
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
};
export const cloudEnabled = Boolean(config.cloudName && config.cloudKey && config.cloudSecret);
if (!config.demo && (!cloudEnabled || config.adminPassword === 'ImpactLens!2026')) {
  throw new Error('Live mode requires Cloudinary credentials and a custom ADMIN_PASSWORD.');
}
