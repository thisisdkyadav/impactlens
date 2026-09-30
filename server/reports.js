import PDFDocument from 'pdfkit';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { db, now, assetView, verifyAudit } from './db.js';
export function buildReport(project, title, selected, metrics) {
  const evidence = selected.map((asset) => ({
    ...assetView(asset),
    reference: `E-${asset.id.slice(0, 8)}`,
  }));
  const comparisons = db
    .prepare('SELECT * FROM comparisons WHERE project_id=? ORDER BY created_at DESC')
    .all(project.id)
    .filter(
      (row) =>
        selected.some((a) => a.id === row.before_id) && selected.some((a) => a.id === row.after_id),
    )
    .map((row) => ({ ...row, analysis: JSON.parse(row.analysis) }));
  const demo = selected.some((asset) => asset.demo);
  const narrative = `${project.name} has ${evidence.length} human-reviewed evidence records covering ${[...new Set(evidence.map((a) => a.phase))].join(', ')} documentation in ${project.location}. ${demo ? 'This report includes illustrative demo media and must not be presented as actual project evidence.' : 'Review approval reflects a human decision; it does not independently authenticate the media or establish project causation.'}`;
  return {
    title,
    project: { ...project },
    generatedAt: now(),
    narrative,
    evidence,
    metrics,
    comparisons,
    audit: verifyAudit(),
    disclaimer:
      'Visual observations are qualitative. Impact measurements are supplied by reviewers and must be supported by cited field records. AI confidence is not authenticity verification. Campaign crops are presentation derivatives; originals remain the evidence source.',
  };
}
export function reportView(row) {
  return { ...row, body: JSON.parse(row.body) };
}
export async function renderPdf(report, res) {
  const body = JSON.parse(report.body);
  const doc = new PDFDocument({
    margin: 48,
    size: 'A4',
    bufferPages: true,
    info: { Title: report.title, Author: 'ImpactLens' },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="impact-report-${report.id.slice(0, 8)}.pdf"`,
  );
  doc.pipe(res);
  const text = (value, size = 11, color = '#243c34') => {
    if (doc.y > 740) doc.addPage();
    doc.fontSize(size).fillColor(color).text(String(value), { lineGap: 4 });
    doc.moveDown(0.5);
  };
  text('IMPACTLENS / FIELD EVIDENCE REPORT', 10, '#277b69');
  text(report.title, 26);
  text(
    `${body.project.location}  |  ${report.status.toUpperCase()}  |  ${body.generatedAt.slice(0, 10)}`,
    10,
  );
  text(body.narrative, 12);
  if (body.metrics.length) {
    text('Reviewer-supplied measurements', 17);
    for (const metric of body.metrics)
      text(
        `${metric.label}: ${metric.value} ${metric.unit}. Evidence: ${metric.evidenceId}. Method: ${metric.method}`,
      );
  }
  text('Reviewed evidence', 17);
  for (const asset of body.evidence) {
    if (doc.y > 600) doc.addPage();
    text(`[${asset.reference}] ${asset.title}`, 13);
    text(
      `Captured: ${asset.captured_at} | ${asset.location} | ${asset.phase} | ${asset.demo ? 'ILLUSTRATIVE DEMO' : asset.analysis.provider}`,
      9,
    );
    try {
      const current = db.prepare('SELECT local_path FROM assets WHERE id=?').get(asset.id);
      let buffer;
      if (current?.local_path && asset.kind === 'image')
        buffer = await fs.readFile(current.local_path);
      else if (asset.thumbnail !== asset.url || asset.kind === 'image') {
        const url = new URL(asset.thumbnail);
        if (
          url.protocol === 'https:' &&
          ['images.unsplash.com', 'res.cloudinary.com'].includes(url.hostname)
        ) {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            redirect: 'error',
          });
          if (
            response.ok &&
            Number(response.headers.get('content-length') || 0) <= 10 * 1024 * 1024
          )
            buffer = Buffer.from(await response.arrayBuffer());
        }
      }
      if (buffer && buffer.length <= 10 * 1024 * 1024) {
        const image = await sharp(buffer, { limitInputPixels: 50000000 })
          .rotate()
          .resize({ width: 1000, height: 500, fit: 'inside' })
          .jpeg()
          .toBuffer();
        if (doc.y > 500) doc.addPage();
        doc.image(image, 48, doc.y, { fit: [490, 180], align: 'left' });
        doc.y += 192;
      }
    } catch {
      text('Visual preview unavailable. Follow the original source link below.', 9);
    }
    text(asset.analysis.summary);
    text(`Review note: ${asset.review_note || 'Approved by reviewer'}`, 10);
    text(`SHA-256: ${asset.sha256}`, 8);
    const url = asset.url.startsWith('/')
      ? `${process.env.APP_ORIGIN || 'http://127.0.0.1:5173'}${asset.url}`
      : asset.url;
    doc
      .fontSize(9)
      .fillColor('#277b69')
      .text('Open original source asset', { link: url, underline: true });
    doc.moveDown();
  }
  for (const pair of body.comparisons) {
    text('Before / after observations', 17);
    text(pair.analysis.summary);
    for (const change of pair.analysis.changes) text(`- ${change}`);
    for (const limitation of pair.analysis.limitations) text(`Limit: ${limitation}`, 10);
  }
  text('Evidence limitations', 17);
  text(body.disclaimer, 10);
  text(`Audit chain at generation: ${body.audit.head}`, 8);
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor('#6f8078')
      .text(`ImpactLens | ${i + 1} / ${pages.count}`, 48, 790, { lineBreak: false });
  }
  doc.end();
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
