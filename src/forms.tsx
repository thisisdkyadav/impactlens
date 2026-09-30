import { useEffect, useState, useRef } from 'react';
import {
  UploadCloud,
  X,
  LoaderCircle,
  MapPin,
  FileImage,
  ShieldCheck,
  Check,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  Copy,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import { api, post, allAssets, formatDate, humanize } from './api';
import type { Project, Settings, AssetDetail, Asset, Metric } from './types';
import type { Run } from './App';
import { Modal, Field, Badge, Status, Media, Loading, Empty } from './ui';
export function UploadModal({
  projects,
  defaultProject,
  onClose,
  run,
  settings,
}: {
  projects: Project[];
  defaultProject?: string;
  onClose: () => void;
  run: Run;
  settings: Settings | null;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [drag, setDrag] = useState(false),
    [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const addFiles = (incoming: File[]) => {
    setError('');
    const valid = incoming.filter(
      (file) =>
        ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type) &&
        file.size <= 25 * 1024 * 1024,
    );
    if (valid.length !== incoming.length)
      setError('Use JPEG, PNG, WebP, MP4 or WebM files up to 25 MB each.');
    setFiles((current) => [...current, ...valid].slice(0, 20));
  };
  return (
    <Modal title="Upload field evidence" onClose={busy ? () => {} : onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!files.length) {
            setError('Choose at least one photo or video.');
            return;
          }
          const fields = new FormData(e.currentTarget);
          setBusy(true);
          let complete = 0;
          const failedFiles: File[] = [];
          for (const [i, file] of files.entries()) {
            setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
            const body = new FormData();
            for (const [key, value] of fields.entries())
              if (key !== 'file') body.append(key, value);
            body.set('file', file);
            body.set('consent', 'true');
            body.set(
              'title',
              files.length === 1
                ? String(fields.get('title'))
                : `${String(fields.get('title'))} · ${file.name}`.slice(0, 160),
            );
            const ok = await run(
              () => api('/assets', { method: 'POST', body }),
              `${file.name} uploaded and queued for analysis.`,
            );
            if (ok) complete++;
            else failedFiles.push(file);
          }
          setBusy(false);
          setProgress('');
          if (complete === files.length) onClose();
          else {
            setFiles(failedFiles);
            setError(
              `${complete} of ${files.length} uploaded. Only failed files remain selected. Check the notification and retry.`,
            );
          }
        }}
      >
        <div
          className={`dropzone ${drag ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) addFiles([...e.dataTransfer.files]);
          }}
        >
          <span className="upload-icon">
            <UploadCloud size={29} />
          </span>
          <h3>Bring your fieldwork into focus</h3>
          <p>Drop photos or videos here, or choose files.</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Browse files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files || [])]);
              e.target.value = '';
            }}
          />
          <span>JPEG, PNG, WebP, MP4, WebM · 25 MB per file · up to 20 files</span>
        </div>
        {files.length > 0 && (
          <div className="file-list">
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`}>
                <FileImage size={17} />
                <span>
                  {file.name}
                  <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${file.name}`}
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, index) => index !== i))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {!projects.length && (
          <div className="callout">Create a project before uploading evidence.</div>
        )}
        <fieldset disabled={busy} className="form-fieldset">
          <div className="form-grid">
            <Field label="Project">
              <select name="projectId" defaultValue={defaultProject || projects[0]?.id} required>
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Evidence title">
              <input
                name="title"
                required
                minLength={3}
                maxLength={120}
                placeholder="e.g. Riverbank restoration follow-up"
              />
            </Field>
            <Field label="Capture date">
              <input
                name="capturedAt"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Location">
              <input
                name="location"
                required
                minLength={2}
                maxLength={200}
                placeholder="Site, district, region"
              />
            </Field>
            <Field label="Project phase">
              <select name="phase">
                <option value="during">During project</option>
                <option value="before">Before / baseline</option>
                <option value="after">After / follow-up</option>
              </select>
            </Field>
            <div className="field form-help">
              <span>Capture context</span>
              <p>Dates and locations come from your field records. AI does not verify them.</p>
            </div>
          </div>
          <Field label="Field notes">
            <textarea
              name="notes"
              rows={3}
              maxLength={3000}
              placeholder="Activity, collection method, field team, and any important context…"
            />
          </Field>
          <label className="checkbox-label">
            <input type="checkbox" required />
            <span>
              I have permission to upload this media and share it with the workspace and configured
              media / AI services.
            </span>
          </label>
        </fieldset>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <span>
            {progress ||
              `${settings?.cloudinary ? 'Cloudinary' : 'Local'} storage · Original file hash preserved`}
          </span>
          <button className="button primary" disabled={busy || !projects.length || !files.length}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <UploadCloud size={17} />}{' '}
            {busy ? 'Uploading…' : 'Upload & analyze'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectModal({ onClose, run }: { onClose: () => void; run: Run }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create a project" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const body = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          const ok = await run(
            () => post('/projects', body),
            'Project created. Start collecting field evidence.',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <Field label="Project name">
          <input
            name="name"
            required
            minLength={3}
            maxLength={100}
            placeholder="e.g. Yamuna riverbank restoration"
          />
        </Field>
        <Field label="Location">
          <input
            name="location"
            required
            minLength={2}
            maxLength={200}
            placeholder="City or field site, country"
          />
        </Field>
        <Field label="Focus area">
          <select name="category">
            <option>Water & ecosystems</option>
            <option>Reforestation</option>
            <option>Community development</option>
            <option>Renewable energy</option>
            <option>Waste & circular economy</option>
            <option>Infrastructure</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Project purpose">
          <textarea
            name="description"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            placeholder="What is this project aiming to change?"
          />
        </Field>
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Create project
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function EvidenceDetail({
  assetId,
  onClose,
  run,
  canEdit,
  canReview,
}: {
  assetId: string;
  onClose: () => void;
  run: Run;
  canEdit: boolean;
  canReview: boolean;
}) {
  const [asset, setAsset] = useState<AssetDetail | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState<'insights' | 'source' | 'campaign'>('insights'),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [preset, setPreset] = useState('square');
  const load = async () => {
    try {
      const data = await api<AssetDetail>(`/assets/${assetId}`);
      setAsset(data);
      setNote(data.review_note);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [assetId]);
  useEffect(() => {
    if (!asset || asset.status === 'ready' || asset.status === 'failed') return;
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [asset?.status]);
  const action = async (task: () => Promise<unknown>, message: string) => {
    setBusy(true);
    await run(task, message);
    await load();
    setBusy(false);
  };
  return (
    <Modal title={asset?.title || 'Evidence record'} onClose={onClose} wide>
      {error && <div className="error">{error}</div>}
      {!asset ? (
        <Loading />
      ) : (
        <>
          <div className="detail-media">
            <Media asset={asset} controls />
            <div className="detail-media-badges">
              <Badge>{asset.kind}</Badge>
              <Badge>{asset.phase}</Badge>
              {asset.demo && <Badge tone="amber">Illustrative demo</Badge>}
            </div>
          </div>
          <div className="detail-meta">
            <span>
              <MapPin size={15} />
              {asset.location}
            </span>
            <span>{formatDate(asset.captured_at)}</span>
            <span>{asset.project.name}</span>
            <Status value={asset.status} />
            <Status value={asset.review} />
          </div>
          <div className="tabs" role="tablist" aria-label="Evidence details">
            {(['insights', 'source', 'campaign'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {value === 'insights'
                  ? 'Analysis & review'
                  : value === 'source'
                    ? 'Original & provenance'
                    : 'Campaign studio'}
              </button>
            ))}
          </div>
          {tab === 'insights' ? (
            <div className="detail-insights">
              <div className="analysis-heading">
                <h3>
                  <Sparkles size={17} />
                  Evidence analysis
                </h3>
                <Badge tone={asset.analysis.provider === 'openai' ? 'green' : 'amber'}>
                  {asset.analysis.provider === 'openai'
                    ? 'Live vision AI'
                    : asset.demo
                      ? 'Demo metadata'
                      : 'Metadata only'}
                </Badge>
              </div>
              <p>
                {asset.analysis.summary ||
                  'Analysis is queued. This record will update when processing completes.'}
              </p>
              <div className="tag-list">
                {asset.analysis.tags?.map((tag, i) => (
                  <Badge key={i}>{tag}</Badge>
                ))}
              </div>
              {asset.analysis.signals?.length ? (
                <>
                  <h4>Visible signals</h4>
                  <ul>
                    {asset.analysis.signals.map((signal, i) => (
                      <li key={i}>{signal}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {asset.analysis.activities?.length ? (
                <>
                  <h4>Activities</h4>
                  <p>{asset.analysis.activities.join(' · ')}</p>
                </>
              ) : null}
              <div className="callout">
                <AlertTriangle size={19} />
                <div>
                  <strong>Interpretation limits</strong>
                  <ul>
                    {(
                      asset.analysis.uncertainty || [
                        'Review the original media before making impact claims.',
                      ]
                    ).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {asset.analysis.confidence != null && (
                <p className="fine-print">
                  Model self-assessed confidence: {Math.round(asset.analysis.confidence * 100)}%.
                  This is not a calibrated score or authenticity verification.
                </p>
              )}
              {asset.notes && (
                <>
                  <h4>Uploader field notes</h4>
                  <p>{asset.notes}</p>
                </>
              )}
              <div className="review-form">
                <h3>
                  <ShieldCheck size={18} />
                  Human evidence review
                </h3>
                <Field label="Review note">
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    minLength={5}
                    maxLength={2000}
                    placeholder="Explain source quality, scene relevance, consent, and any limitations…"
                    disabled={!canReview}
                  />
                </Field>
                {canReview ? (
                  <div className="review-actions">
                    <button
                      className="button primary"
                      disabled={busy || asset.status !== 'ready' || note.trim().length < 5}
                      onClick={() =>
                        void action(
                          () =>
                            api(`/assets/${asset.id}/review`, {
                              method: 'PATCH',
                              body: JSON.stringify({ review: 'approved', note }),
                            }),
                          'Evidence approved with your review note.',
                        )
                      }
                    >
                      <Check size={17} />
                      Approve evidence
                    </button>
                    <button
                      className="button danger"
                      disabled={busy || asset.status !== 'ready' || note.trim().length < 5}
                      onClick={() =>
                        void action(
                          () =>
                            api(`/assets/${asset.id}/review`, {
                              method: 'PATCH',
                              body: JSON.stringify({ review: 'rejected', note }),
                            }),
                          'Evidence rejected.',
                        )
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || asset.status !== 'ready' || note.trim().length < 5}
                      onClick={() =>
                        void action(
                          () =>
                            api(`/assets/${asset.id}/review`, {
                              method: 'PATCH',
                              body: JSON.stringify({ review: 'pending', note }),
                            }),
                          'Evidence returned to pending review.',
                        )
                      }
                    >
                      Reopen review
                    </button>
                  </div>
                ) : (
                  <p className="fine-print">
                    A reviewer or administrator can approve this evidence.
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  className="text-button"
                  disabled={busy || asset.status === 'queued' || asset.status === 'analyzing'}
                  onClick={() =>
                    void action(
                      () => post(`/assets/${asset.id}/reanalyze`, {}),
                      'Analysis queued. Review approval has been reset.',
                    )
                  }
                >
                  <RefreshCw size={15} />
                  Retry / refresh analysis
                </button>
              )}
            </div>
          ) : tab === 'source' ? (
            <>
              <dl className="metadata-grid source-metadata">
                {[
                  ['Original filename', asset.filename],
                  ['Resource type', asset.mime],
                  [
                    'File size',
                    asset.bytes
                      ? `${(asset.bytes / 1024 / 1024).toFixed(2)} MB`
                      : 'Demo stock source',
                  ],
                  ['Dimensions', asset.width ? `${asset.width} × ${asset.height}` : 'Not recorded'],
                  ['Cloudinary asset ID', asset.cloud_asset_id || 'Local / demo'],
                  ['Cloudinary public ID', asset.public_id || 'Local / demo'],
                  ['Version', asset.version || '—'],
                  ['Semantic index', asset.indexed ? 'Indexed' : 'Keyword metadata only'],
                  ['Capture date source', 'Uploader-supplied'],
                  ['Consent', 'Confirmed by uploader'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="hash-block">
                <span className="small-label">
                  ORIGINAL SHA-256 {asset.demo ? '(DEMO RECORD IDENTIFIER)' : ''}
                </span>
                <code>{asset.sha256}</code>
                <button
                  className="icon-button"
                  aria-label="Copy original hash"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(asset.sha256)
                      .catch(() => setError('Clipboard is unavailable. Select and copy the hash.'))
                  }
                >
                  <Copy size={15} />
                </button>
              </div>
              <a className="button secondary" href={asset.url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />
                Open original source
              </a>
              <h3 className="section-spaced">Source history</h3>
              <div className="detail-history">
                {asset.history.map((event) => (
                  <div key={event.id}>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>{humanize(event.action)}</strong>
                      <span>{new Date(event.created_at).toLocaleString('en-IN')}</span>
                      <details>
                        <summary>View details</summary>
                        <pre>{JSON.stringify(JSON.parse(event.detail), null, 2)}</pre>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="campaign-studio">
              <div className="callout">
                <ImageIcon size={20} />
                <p>
                  Produce presentation crops from approved evidence. Every variant records its
                  source asset and transformation. Crops are never used as original evidence.
                </p>
              </div>
              <div className="campaign-controls">
                <Field label="Output format">
                  <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                    <option value="square">Square · 1080 × 1080</option>
                    <option value="story">Story · 1080 × 1920</option>
                    <option value="landscape">Landscape · 1600 × 900</option>
                  </select>
                </Field>
                {canEdit && (
                  <button
                    className="button primary"
                    disabled={busy || asset.review !== 'approved'}
                    onClick={() =>
                      void action(
                        () => post(`/assets/${asset.id}/derivatives`, { preset }),
                        'Campaign variant created with source traceability.',
                      )
                    }
                  >
                    <Sparkles size={16} />
                    Create variant
                  </button>
                )}
              </div>
              {asset.review !== 'approved' && (
                <p className="fine-print">Approve this evidence before creating campaign media.</p>
              )}
              <div className="derivative-grid">
                {asset.derivatives.map((d) => (
                  <a
                    key={d.id}
                    className="derivative-card"
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {asset.kind === 'image' ? (
                      <img src={d.url} alt={`${d.preset} crop of ${asset.title}`} />
                    ) : (
                      <video src={d.url} controls />
                    )}
                    <strong>
                      {d.preset} variant <ExternalLink size={14} />
                    </strong>
                    <small>{formatDate(d.created_at)}</small>
                  </a>
                ))}
              </div>
              {!asset.derivatives.length && (
                <Empty title="Ready for your next impact story">
                  Create a crop for your campaign or report.
                </Empty>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
export function ReportModal({
  projects,
  onClose,
  run,
}: {
  projects: Project[];
  onClose: () => void;
  run: Run;
}) {
  const [project, setProject] = useState(projects[0]?.id || ''),
    [records, setRecords] = useState<Asset[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [metrics, setMetrics] = useState<Metric[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!project) return;
    let active = true;
    setLoading(true);
    setSelected([]);
    setMetrics([]);
    setError('');
    void allAssets(`project=${project}&review=approved`)
      .then((data) => {
        if (active) setRecords(data.filter((a) => a.status === 'ready'));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project]);
  const realSelected = records.filter((a) => selected.includes(a.id) && !a.demo);
  const updateMetric = (index: number, update: Partial<Metric>) =>
    setMetrics((current) => current.map((m, i) => (i === index ? { ...m, ...update } : m)));
  return (
    <Modal title="Create an impact report" onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const fields = new FormData(e.currentTarget);
          const ok = await run(
            () =>
              post('/reports', {
                projectId: project,
                title: fields.get('title'),
                assetIds: selected,
                metrics,
              }),
            'Draft report created with source-backed evidence.',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <div className="form-grid">
          <Field label="Project">
            <select value={project} onChange={(e) => setProject(e.target.value)} required>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Report title">
            <input
              name="title"
              required
              minLength={3}
              maxLength={160}
              placeholder="e.g. River revival · quarterly field report"
            />
          </Field>
        </div>
        <div className="section-heading">
          <h3>Choose approved evidence</h3>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setSelected(
                selected.length === records.length ? [] : records.slice(0, 100).map((a) => a.id),
              )
            }
          >
            {selected.length === records.length ? 'Clear selection' : 'Select all'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {loading ? (
          <Loading />
        ) : records.length ? (
          <div className="evidence-picker">
            {records.map((asset) => (
              <label
                key={asset.id}
                className={`evidence-pick ${selected.includes(asset.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(asset.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, asset.id]
                        : selected.filter((id) => id !== asset.id),
                    )
                  }
                />
                <Media asset={asset} />
                <span>
                  <strong>{asset.title}</strong>
                  <small>
                    {formatDate(asset.captured_at)} ·{' '}
                    {asset.demo ? 'Illustrative demo' : asset.phase}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <Empty title="No approved evidence yet">
            Review and approve at least one record in this project first.
          </Empty>
        )}
        <div className="section-heading section-spaced">
          <div>
            <h3>
              Field measurements <span className="muted">(optional)</span>
            </h3>
            <p>Only add measurements supported by selected real evidence.</p>
          </div>
          <button
            type="button"
            className="button secondary small"
            disabled={!realSelected.length || metrics.length >= 20}
            onClick={() =>
              setMetrics([
                ...metrics,
                { label: '', value: 0, unit: '', evidenceId: realSelected[0].id, method: '' },
              ])
            }
          >
            <Plus size={15} />
            Add metric
          </button>
        </div>
        {metrics.map((metric, i) => (
          <div className="metric-form" key={i}>
            <Field label="Measurement">
              <input
                value={metric.label}
                required
                minLength={2}
                maxLength={120}
                onChange={(e) => updateMetric(i, { label: e.target.value })}
                placeholder="e.g. Collected waste"
              />
            </Field>
            <Field label="Value">
              <input
                type="number"
                min="0"
                step="any"
                value={metric.value}
                required
                onChange={(e) => updateMetric(i, { value: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit">
              <input
                value={metric.unit}
                required
                maxLength={50}
                onChange={(e) => updateMetric(i, { unit: e.target.value })}
                placeholder="kg"
              />
            </Field>
            <Field label="Source evidence">
              <select
                value={metric.evidenceId}
                onChange={(e) => updateMetric(i, { evidenceId: e.target.value })}
              >
                {realSelected.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Measurement method">
              <textarea
                required
                minLength={10}
                maxLength={1500}
                value={metric.method}
                onChange={(e) => updateMetric(i, { method: e.target.value })}
                placeholder="Weighbridge record, field survey method, collection date…"
              />
            </Field>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove measurement"
              onClick={() => setMetrics(metrics.filter((_, index) => index !== i))}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <div className="callout">
          <ShieldCheck size={19} />
          <p>
            Reports cite original evidence, include interpretation limits, and preserve a snapshot
            of the reviewed records. Demo media can appear in drafts only.
          </p>
        </div>
        <div className="form-footer">
          <span>{selected.length} records selected</span>
          <button
            className="button primary"
            disabled={busy || !selected.length || selected.length > 100}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : null}Create report
          </button>
        </div>
      </form>
    </Modal>
  );
}
