import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, cloudEnabled } from './config.js';
import { db, id, now, audit } from './db.js';
cloudinary.config({
  cloud_name: config.cloudName,
  api_key: config.cloudKey,
  api_secret: config.cloudSecret,
  secure: true,
});
export const presets = {
  square: { width: 1080, height: 1080, crop: 'fill' },
  story: { width: 1080, height: 1920, crop: 'fill' },
  landscape: { width: 1600, height: 900, crop: 'fill' },
};
export async function storeMedia(file, assetId, projectId) {
  if (!cloudEnabled) {
    if (!config.demo) throw new Error('Cloudinary is not configured.');
    let metadata = {};
    if (file.mimetype.startsWith('image/'))
      metadata = await sharp(file.path, { limitInputPixels: 50000000 }).metadata();
    const extension = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    }[file.mimetype];
    const localPath = path.join(config.dataDir, 'uploads', `${assetId}${extension}`);
    await fs.rename(file.path, localPath);
    return {
      url: `/media/${path.basename(localPath)}`,
      thumbnail: `/media/${path.basename(localPath)}`,
      local_path: localPath,
      width: metadata.width || null,
      height: metadata.height || null,
    };
  }
  const result = await cloudinary.uploader.upload(file.path, {
    resource_type: 'auto',
    public_id: `impactlens/${projectId}/${assetId}`,
    overwrite: false,
    tags: ['impactlens', projectId],
    context: { project_id: projectId, asset_id: assetId },
    timeout: 120000,
  });
  const thumbnail = cloudinary.url(result.public_id, {
    resource_type: result.resource_type,
    version: result.version,
    format: 'jpg',
    transformation: [
      {
        width: 720,
        height: 480,
        crop: 'fill',
        ...(result.resource_type === 'video' ? { start_offset: '0' } : {}),
      },
      { quality: 'auto' },
    ],
  });
  await fs.unlink(file.path);
  return {
    url: result.secure_url,
    thumbnail,
    public_id: result.public_id,
    cloud_asset_id: result.asset_id,
    version: result.version,
    width: result.width || null,
    height: result.height || null,
    duration: result.duration || null,
  };
}
export async function imageInputs(asset) {
  if (asset.kind === 'video') {
    if (!asset.public_id) return [];
    return [0, 0.5, 0.9].map((fraction) =>
      cloudinary.url(asset.public_id, {
        resource_type: 'video',
        version: asset.version,
        format: 'jpg',
        transformation: [
          {
            start_offset: String(Math.round((asset.duration || 1) * fraction * 10) / 10),
            width: 1024,
            crop: 'limit',
            quality: 'auto',
          },
        ],
      }),
    );
  }
  if (asset.local_path) {
    const buffer = await sharp(asset.local_path)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return [`data:image/jpeg;base64,${buffer.toString('base64')}`];
  }
  return [asset.url];
}
export async function discardMedia(media, kind) {
  if (media?.local_path) await fs.unlink(media.local_path).catch(() => {});
  if (media?.public_id) {
    await cloudinary.uploader.destroy(media.public_id, { resource_type: kind }).catch((error) => {
      console.error(
        `[impactlens] cleanup failed for newly uploaded media ${media.public_id}: ${error.message}`,
      );
    });
  }
}
export async function derivative(asset, preset, actor) {
  let url, transformation;
  if (asset.public_id) {
    transformation = { ...presets[preset], gravity: 'auto', quality: 'auto', fetch_format: 'auto' };
    url = cloudinary.url(asset.public_id, {
      resource_type: asset.kind,
      version: asset.version,
      transformation,
    });
  } else if (asset.local_path && asset.kind === 'image') {
    const file = `${id()}.jpg`;
    const p = presets[preset];
    await sharp(asset.local_path)
      .rotate()
      .resize(p.width, p.height, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toFile(path.join(config.dataDir, 'uploads', file));
    url = `/media/${file}`;
    transformation = { provider: 'sharp', ...p };
  } else {
    const error = new Error(
      'Upload an image to create campaign variants. Live videos require Cloudinary.',
    );
    error.status = 422;
    throw error;
  }
  const record = {
    id: id(),
    asset_id: asset.id,
    preset,
    url,
    transformation: JSON.stringify(transformation),
    created_at: now(),
  };
  db.prepare('INSERT INTO derivatives VALUES(?,?,?,?,?,?)').run(...Object.values(record));
  audit(actor, 'asset.transformed', asset.id, record);
  return record;
}
