import { createHash } from 'node:crypto';
import { db, id, now, audit } from './db.js';
import { config } from './config.js';
export function seed() {
  if (!config.demo || db.prepare('SELECT id FROM projects LIMIT 1').get()) return;
  const projects = [
    [
      'River revival',
      'Document riparian restoration and community stewardship along the Yamuna. Demo project; images are illustrative stock photography.',
      'Delhi, India',
      'Water & ecosystems',
      '#277b69',
    ],
    [
      'Green canopy',
      'Track tree planting and habitat restoration over a growing season. Demo project; figures are not measured outcomes.',
      'Dehradun, India',
      'Reforestation',
      '#739145',
    ],
    [
      'Resilient communities',
      'Collect evidence of renewable energy and community infrastructure.',
      'Jaipur, India',
      'Community development',
      '#bc8140',
    ],
  ];
  const photos = [
    [
      'River landscape · baseline',
      'photo-1437482078695-73f5ca6c96e2',
      'before',
      'river,water,landscape,baseline',
    ],
    [
      'Riverbank · follow-up',
      'photo-1472396961693-142e6e269027',
      'after',
      'restoration,vegetation,habitat,riverbank',
    ],
    [
      'Woodland field visit',
      'photo-1441974231531-c6227db76b6e',
      'during',
      'forest,trees,canopy,biodiversity',
    ],
    [
      'Forest monitoring · baseline',
      'photo-1473448912268-2022ce9509d8',
      'before',
      'forest,woodland,monitoring,trees',
    ],
    [
      'Canopy · follow-up',
      'photo-1448375240586-882707db888b',
      'after',
      'trees,green,canopy,habitat',
    ],
    [
      'Forest light survey',
      'photo-1441974231531-c6227db76b6e',
      'during',
      'forest,sunlight,vegetation,survey',
    ],
    [
      'Solar generation site',
      'photo-1509391366360-2e959784a276',
      'after',
      'solar,energy,infrastructure,renewable',
    ],
    [
      'Mountain landscape survey',
      'photo-1464822759023-fed622ff2c3b',
      'before',
      'landscape,mountain,environment,survey',
    ],
    [
      'Habitat documentation',
      'photo-1472396961693-142e6e269027',
      'during',
      'community,habitat,landscape,fieldwork',
    ],
  ];
  for (const [i, values] of projects.entries()) {
    const projectId = id();
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)').run(projectId, ...values, now());
    for (const [j, photo] of photos.slice(i * 3, i * 3 + 3).entries()) {
      const [title, photoId, phase, tags] = photo;
      const url = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1600&q=85`;
      const assetId = id();
      const analysis = {
        provider: 'demo',
        summary:
          'Illustrative stock photograph supplied with this demo. This is not verified field evidence or a live AI analysis.',
        tags: tags.split(','),
        activities: ['Field documentation'],
        signals: ['Illustrative environmental imagery'],
        uncertainty: [
          'Location and capture dates are example metadata.',
          'These photographs are not a matched before-and-after survey.',
        ],
        suggestedProject: values[0],
        confidence: null,
      };
      db.prepare(
        `INSERT INTO assets(id,project_id,title,filename,kind,mime,url,thumbnail,sha256,bytes,captured_at,location,phase,notes,consent,status,review,analysis,demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        assetId,
        projectId,
        title,
        `${photoId}.jpg`,
        'image',
        'image/jpeg',
        url,
        url.replace('w=1600', 'w=720'),
        createHash('sha256')
          .update(url + projectId + j)
          .digest('hex'),
        0,
        `2026-0${j + 3}-15`,
        values[2],
        phase,
        'Stock photography for interface demonstration only. Source: Unsplash. No measured impact or actual project association.',
        1,
        'ready',
        'pending',
        JSON.stringify(analysis),
        1,
        now(),
      );
      audit('system', 'demo.asset.seeded', assetId, { source: url });
    }
  }
}
