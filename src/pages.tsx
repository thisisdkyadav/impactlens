import { useEffect, useState, useRef } from 'react';
import {
  Images,
  FolderOpen,
  ShieldCheck,
  FileText,
  ArrowUpRight,
  MapPin,
  Search,
  SlidersHorizontal,
  Download,
  SplitSquareHorizontal,
  CheckCircle2,
  Leaf,
  Clock3,
  Sparkles,
  RefreshCw,
  LockKeyhole,
  Database,
  Cloud,
  UserPlus,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  Dashboard,
  Project,
  Page,
  AssetResult,
  Asset,
  Comparison,
  Report,
  Job,
  Settings,
  User,
  AuditEvent,
} from './types';
import type { Run } from './App';
import { api, post, formatDate, humanize, download, allAssets } from './api';
import { AssetCard, Badge, Status, Empty, Loading, Media, Field } from './ui';
export function Overview({
  dashboard: d,
  projects,
  onOpen,
  navigate,
  selectProject,
}: {
  dashboard: Dashboard;
  projects: Project[];
  onOpen: (id: string) => void;
  navigate: (p: Page) => void;
  selectProject: (id: string) => void;
}) {
  const coverage = d.totals.assets
    ? Math.round(((d.totals.approved || 0) / d.totals.assets) * 100)
    : 0;
  const stats = [
    {
      label: 'Evidence collected',
      value: d.totals.assets,
      meta: `${d.totals.videos || 0} videos · ${d.totals.assets - (d.totals.videos || 0)} images`,
      icon: Images,
    },
    {
      label: 'Active projects',
      value: d.totals.projects,
      meta: 'Connected by place and purpose',
      icon: FolderOpen,
    },
    {
      label: 'Reviewed evidence',
      value: d.totals.approved || 0,
      meta: `${d.totals.pending || 0} awaiting review`,
      icon: ShieldCheck,
    },
    {
      label: 'Impact reports',
      value: d.totals.reports,
      meta: 'Stories with original sources',
      icon: FileText,
    },
  ];
  const max = Math.max(...d.timeline.map((item) => item.count), 1);
  return (
    <>
      <div className="stats-grid">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">
              {stat.label}
              <stat.icon size={18} />
            </div>
            <strong>{stat.value.toLocaleString()}</strong>
            <span>{stat.meta}</span>
          </div>
        ))}
      </div>
      <div className="overview-middle">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE BIGGER PICTURE</span>
              <h2>Evidence over time</h2>
            </div>
            <Badge>By capture month</Badge>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={d.timeline.map((row) => `${row.month}: ${row.count} records`).join(', ')}
          >
            {d.timeline.length ? (
              d.timeline.map((item, index) => (
                <div className="bar-column" key={item.month}>
                  <span className="bar-count">{item.count}</span>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${index === d.timeline.length - 1 ? 'last' : ''}`}
                      style={{ height: `${(item.count / max) * 100}%` }}
                    />
                  </div>
                  <span>
                    {new Date(`${item.month}-15`).toLocaleDateString('en', { month: 'short' })}
                  </span>
                </div>
              ))
            ) : (
              <Empty title="Your timeline starts with a field record" />
            )}
          </div>
          <div className="chart-legend">
            <span className="legend-dot" /> Images and videos captured in the field
          </div>
        </section>
        <section className="review-panel">
          <div className="review-top">
            <ShieldCheck size={26} />
            <Badge tone="lime">EVIDENCE HEALTH</Badge>
          </div>
          <h2>
            Good stories start <br />
            with good evidence.
          </h2>
          <p>A human review keeps observations connected to their original source.</p>
          <div className="review-percent">
            {coverage}
            <span>% reviewed</span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${coverage}%` }} />
          </div>
          <button onClick={() => navigate('evidence')}>
            Review your evidence <ArrowUpRight size={17} />
          </button>
          <span className="review-caption">
            Review approval is a human decision, not proof of authenticity.
          </span>
        </section>
      </div>
      <section className="project-section">
        <div className="section-heading">
          <h2>
            Projects in focus <span>{projects.length}</span>
          </h2>
          <button className="text-button" onClick={() => navigate('projects')}>
            All projects <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="project-strips">
          {projects.slice(0, 3).map((p) => (
            <button className="project-strip" key={p.id} onClick={() => selectProject(p.id)}>
              <span className="project-icon" style={{ background: p.color + '18', color: p.color }}>
                <Leaf size={23} />
              </span>
              <div>
                <strong>{p.name}</strong>
                <span>
                  <MapPin size={12} />
                  {p.location}
                </span>
              </div>
              <span className="strip-count">
                {p.assets}
                <small>assets</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>Latest field evidence</h2>
            <p>The newest additions to your shared story.</p>
          </div>
          <button className="text-button" onClick={() => navigate('evidence')}>
            View library <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="asset-grid overview-grid">
          {d.recent.slice(0, 3).map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              project={projects.find((p) => p.id === asset.project_id)?.name}
              onOpen={() => onOpen(asset.id)}
            />
          ))}
        </div>
        {!d.recent.length && (
          <Empty icon={<Images size={30} />} title="Ready for your first field story">
            Create a project, then upload a photo or video.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Evidence({
  result,
  projects,
  query,
  setQuery,
  filters,
  setFilters,
  loading,
  mode,
  setMode,
  search,
  onOpen,
  vision,
}: {
  result: AssetResult;
  projects: Project[];
  query: string;
  setQuery: (q: string) => void;
  filters: Record<string, string>;
  setFilters: (v: Record<string, string>) => void;
  loading: boolean;
  mode: 'keyword' | 'semantic';
  setMode: (m: 'keyword' | 'semantic') => void;
  search: () => void;
  onOpen: (id: string) => void;
  vision: boolean;
}) {
  const filter = (key: string, value: string) =>
    setFilters({ ...filters, [key]: value, page: '1' });
  return (
    <>
      <div className="library-toolbar">
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search evidence"
            placeholder="Search landscapes, activities, places…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="button small secondary">Search</button>
        </form>
        <select
          aria-label="Search mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'keyword' | 'semantic')}
        >
          <option value="keyword">Keyword search</option>
          <option value="semantic" disabled={!vision}>
            AI semantic search
          </option>
        </select>
        <button
          className="button secondary"
          onClick={() =>
            download(`/export?format=csv${filters.project ? `&project=${filters.project}` : ''}`)
          }
        >
          <Download size={16} />
          CSV
        </button>
        <button
          className="button secondary"
          onClick={() =>
            download(`/export?format=json${filters.project ? `&project=${filters.project}` : ''}`)
          }
        >
          JSON
        </button>
      </div>
      <div className="filter-row">
        <SlidersHorizontal size={16} />
        <select
          aria-label="Filter by project"
          value={filters.project || ''}
          onChange={(e) => filter('project', e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by media type"
          value={filters.kind || ''}
          onChange={(e) => filter('kind', e.target.value)}
        >
          <option value="">All media</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select
          aria-label="Filter by review"
          value={filters.review || ''}
          onChange={(e) => filter('review', e.target.value)}
        >
          <option value="">All reviews</option>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          aria-label="Filter by phase"
          value={filters.phase || ''}
          onChange={(e) => filter('phase', e.target.value)}
        >
          <option value="">All phases</option>
          <option value="before">Before</option>
          <option value="during">During</option>
          <option value="after">After</option>
        </select>
        <label className="date-filter">
          From
          <input
            type="date"
            aria-label="Capture date from"
            value={filters.from || ''}
            onChange={(e) => filter('from', e.target.value)}
          />
        </label>
        <label className="date-filter">
          To
          <input
            type="date"
            aria-label="Capture date to"
            value={filters.to || ''}
            onChange={(e) => filter('to', e.target.value)}
          />
        </label>
        {Object.values(filters).some(Boolean) && (
          <button className="text-button" onClick={() => setFilters({})}>
            Clear
          </button>
        )}
      </div>
      <div className="results-heading">
        <span>
          <strong>{result.total}</strong> evidence records {loading && '· Updating…'}
        </span>
        <span>{query ? `${humanize(result.searchMode)} results` : 'Newest capture first'}</span>
      </div>
      {result.assets.length ? (
        <div className="asset-grid">
          {result.assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              project={projects.find((p) => p.id === asset.project_id)?.name}
              onOpen={() => onOpen(asset.id)}
            />
          ))}
        </div>
      ) : (
        <Empty icon={<Search size={28} />} title="No matching evidence">
          Try another search or adjust your filters.
        </Empty>
      )}
      <div className="pagination">
        <button
          className="button secondary"
          disabled={result.page <= 1}
          onClick={() => setFilters({ ...filters, page: String(result.page - 1) })}
        >
          Previous
        </button>
        <span>
          Page {result.page} of {result.pages}
        </span>
        <button
          className="button secondary"
          disabled={result.page >= result.pages}
          onClick={() => setFilters({ ...filters, page: String(result.page + 1) })}
        >
          Next
        </button>
      </div>
      {mode === 'semantic' && (
        <p className="fine-print">
          Press Search to run AI retrieval. Indexed live records use embeddings; unindexed records
          use keyword matching. Ranking scores are not confidence scores.
        </p>
      )}
    </>
  );
}
export function Projects({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="projects-grid">
      {projects.map((p) => (
        <article className="panel project-panel" key={p.id}>
          <div className="project-panel-top">
            <span className="project-icon" style={{ background: p.color + '18', color: p.color }}>
              <Leaf size={26} />
            </span>
            <Badge>{p.category}</Badge>
          </div>
          <h2>{p.name}</h2>
          <p className="location">
            <MapPin size={15} />
            {p.location}
          </p>
          <p>{p.description}</p>
          <div className="project-numbers">
            <div>
              <strong>{p.assets}</strong>
              <span>Evidence records</span>
            </div>
            <div>
              <strong>{p.approved || 0}</strong>
              <span>Reviewed & approved</span>
            </div>
          </div>
          <button className="button secondary full" onClick={() => onSelect(p.id)}>
            Open project evidence <ArrowUpRight size={16} />
          </button>
        </article>
      ))}
      {!projects.length && (
        <Empty icon={<FolderOpen size={28} />} title="Create your first project">
          A project connects your media to a location and purpose.
        </Empty>
      )}
    </div>
  );
}
export function ComparePage({
  projects,
  comparisons,
  run,
  canEdit,
  onOpen,
}: {
  projects: Project[];
  comparisons: Comparison[];
  run: Run;
  canEdit: boolean;
  onOpen: (id: string) => void;
}) {
  const requestedPair = useRef<Comparison | null>(null);
  const [project, setProject] = useState(''),
    [records, setRecords] = useState<Asset[]>([]),
    [before, setBefore] = useState(''),
    [after, setAfter] = useState(''),
    [position, setPosition] = useState(50),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Comparison | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!project && projects.length) setProject(projects[0].id);
  }, [projects, project]);
  useEffect(() => {
    if (!project) return;
    let active = true;
    setBefore('');
    setAfter('');
    setResult(null);
    setError('');
    void allAssets(`project=${project}`)
      .then((data) => {
        if (active) {
          setRecords(data.filter((a) => a.status === 'ready'));
          const pair = requestedPair.current;
          if (pair?.project_id === project) {
            setBefore(pair.before_id);
            setAfter(pair.after_id);
            setResult(pair);
            requestedPair.current = null;
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project]);
  const a = records.find((r) => r.id === before),
    b = records.find((r) => r.id === after);
  return (
    <>
      <div className="panel comparison-controls">
        <Field label="Project">
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Baseline evidence">
          <select
            value={before}
            onChange={(e) => {
              setBefore(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Choose baseline…</option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.captured_at}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Follow-up evidence">
          <select
            value={after}
            onChange={(e) => {
              setAfter(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Choose follow-up…</option>
            {records
              .filter((r) => r.id !== before)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.captured_at}
                </option>
              ))}
          </select>
        </Field>
        <button
          className="button primary"
          disabled={!a || !b || busy || !canEdit}
          onClick={async () => {
            setBusy(true);
            await run(async () => {
              const data = await post<Comparison>('/comparisons', {
                beforeId: before,
                afterId: after,
              });
              setResult(data);
            }, 'Comparison saved with source references.');
            setBusy(false);
          }}
        >
          <Sparkles size={16} />
          {busy ? 'Analyzing…' : 'Analyze change'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {a && b ? (
        <>
          <section className="panel comparison-stage">
            {a.kind === 'image' && b.kind === 'image' ? (
              <>
                <div className="slider-images">
                  <img src={b.url} alt={`Follow-up: ${b.title}`} />
                  <div
                    className="slider-before"
                    style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                  >
                    <img src={a.url} alt={`Baseline: ${a.title}`} />
                  </div>
                  <span className="slider-line" style={{ left: `${position}%` }}>
                    <SplitSquareHorizontal size={20} />
                  </span>
                  <span className="comparison-label left">
                    BEFORE · {formatDate(a.captured_at)}
                  </span>
                  <span className="comparison-label right">
                    AFTER · {formatDate(b.captured_at)}
                  </span>
                </div>
                <div className="slider-control">
                  <span>Before</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={position}
                    aria-label="Before and after image split"
                    onChange={(e) => setPosition(Number(e.target.value))}
                  />
                  <span>After</span>
                </div>
              </>
            ) : (
              <div className="comparison-videos">
                <Media asset={a} controls />
                <Media asset={b} controls />
              </div>
            )}
            <div className="comparison-caption">
              <span>
                <MapPin size={15} />
                {a.location}
              </span>
              <span>Review alignment, season, and lighting before drawing conclusions.</span>
            </div>
          </section>
          {result && (
            <section className="panel comparison-result">
              <div className="section-heading">
                <h2>Change observations</h2>
                <Badge tone={result.analysis.provider === 'openai' ? 'green' : 'amber'}>
                  {result.analysis.provider === 'openai' ? 'AI assisted' : 'Human inspection'}
                </Badge>
              </div>
              <p>{result.analysis.summary}</p>
              {!result.analysis.comparable && (
                <div className="callout">
                  <AlertTriangle size={18} />
                  This pair does not establish a matched, comparable survey.
                </div>
              )}
              <div className="two-columns">
                <div>
                  <h3>Visible changes</h3>
                  {result.analysis.changes.length ? (
                    <ul>
                      {result.analysis.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No automated observations. Add live AI credentials to analyze your own media.
                    </p>
                  )}
                </div>
                <div>
                  <h3>Interpretation limits</h3>
                  <ul>
                    {result.analysis.limitations.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <Empty icon={<SplitSquareHorizontal size={36} />} title="Two moments. One clearer story.">
          Choose a baseline and a later record from the same project.
        </Empty>
      )}
      <section className="section-spaced">
        <div className="section-heading">
          <h2>Saved comparisons</h2>
          <Badge>{comparisons.length} pairs</Badge>
        </div>
        {comparisons.length ? (
          <div className="saved-list">
            {comparisons.map((c) => (
              <article className="panel saved-comparison" key={c.id}>
                <SplitSquareHorizontal size={24} />
                <div>
                  <strong>{projects.find((p) => p.id === c.project_id)?.name}</strong>
                  <p>{c.analysis.summary}</p>
                  <span className="fine-print">
                    {formatDate(c.created_at)} · {c.analysis.provider}
                  </span>
                </div>
                <div className="pair-actions">
                  <button className="text-button" onClick={() => onOpen(c.before_id)}>
                    Baseline
                  </button>
                  <button className="text-button" onClick={() => onOpen(c.after_id)}>
                    Follow-up
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      requestedPair.current = project === c.project_id ? null : c;
                      window.scrollTo(0, 0);
                      setProject(c.project_id);
                      setBefore(c.before_id);
                      setAfter(c.after_id);
                      setResult(c);
                    }}
                  >
                    View pair
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            Saved comparisons will appear here with their original evidence links.
          </p>
        )}
      </section>
    </>
  );
}
export function ReportsPage({
  reports,
  projects,
  run,
  canReview,
  onOpen,
}: {
  reports: Report[];
  projects: Project[];
  run: Run;
  canReview: boolean;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Report | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <>
      {reports.length ? (
        <div className="report-layout">
          <div className="report-list">
            {reports.map((report) => (
              <button
                className={`panel report-card ${selected?.id === report.id ? 'selected' : ''}`}
                key={report.id}
                onClick={() => setSelected(report)}
              >
                <div>
                  <FileText size={23} />
                  <Status value={report.status} />
                </div>
                <h3>{report.title}</h3>
                <p>{projects.find((p) => p.id === report.project_id)?.name}</p>
                <span>
                  {report.body.evidence.length} cited assets · {formatDate(report.created_at)}
                </span>
              </button>
            ))}
          </div>
          {selected ? (
            <article className="panel report-preview">
              <div className="report-preview-actions">
                <Status
                  value={reports.find((r) => r.id === selected.id)?.status || selected.status}
                />
                <div>
                  <button
                    className="button secondary small"
                    onClick={() => download(`/reports/${selected.id}/pdf`)}
                  >
                    <Download size={15} />
                    PDF
                  </button>
                  {canReview && (
                    <button
                      className="button primary small"
                      disabled={
                        busy || reports.find((r) => r.id === selected.id)?.status === 'published'
                      }
                      onClick={async () => {
                        setBusy(true);
                        await run(
                          () => post(`/reports/${selected.id}/publish`, {}),
                          'Report published in the workspace.',
                        );
                        setBusy(false);
                      }}
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
              <span className="eyebrow">IMPACT REPORT / {formatDate(selected.created_at)}</span>
              <h2>{selected.title}</h2>
              <p className="location">
                <MapPin size={15} />
                {selected.body.project.location}
              </p>
              <p className="report-narrative">{selected.body.narrative}</p>
              {selected.body.metrics.length > 0 && (
                <div className="report-metrics">
                  {selected.body.metrics.map((m, i) => (
                    <div key={i}>
                      <strong>
                        {m.value} <small>{m.unit}</small>
                      </strong>
                      <span>{m.label}</span>
                      <p>{m.method}</p>
                      <button className="text-button" onClick={() => onOpen(m.evidenceId)}>
                        Source evidence
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <h3>Evidence behind the story</h3>
              {selected.body.evidence.map((a) => (
                <button key={a.id} className="report-evidence" onClick={() => onOpen(a.id)}>
                  <Media asset={a} />
                  <div>
                    <span className="small-label">{a.reference}</span>
                    <strong>{a.title}</strong>
                    <p>{a.analysis.summary}</p>
                    <span>
                      {formatDate(a.captured_at)} · {a.location}
                    </span>
                  </div>
                </button>
              ))}
              {selected.body.comparisons.map((c) => (
                <div className="report-observation" key={c.id}>
                  <h3>Before & after</h3>
                  <p>{c.analysis.summary}</p>
                  <ul>
                    {c.analysis.changes.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="callout">
                <ShieldCheck size={20} />
                <p>{selected.body.disclaimer}</p>
              </div>
              <span className="fine-print">
                Report snapshots preserve the evidence state at generation. PDF exports include
                source links and original media hashes.
              </span>
            </article>
          ) : (
            <Empty icon={<FileText size={32} />} title="Choose a report to read its story">
              Inspect the cited sources, download a PDF, or publish a reviewed report.
            </Empty>
          )}
        </div>
      ) : (
        <Empty icon={<FileText size={34} />} title="Your evidence has a story to tell">
          Approve field evidence, then create an impact report. Draft demo reports are supported;
          publishing requires real evidence.
        </Empty>
      )}
    </>
  );
}
export function ActivityPage({ jobs }: { jobs: Job[] }) {
  const [data, setData] = useState<{
      verification: { valid: boolean; head?: string; count?: number };
      events: AuditEvent[];
    } | null>(null),
    [error, setError] = useState('');
  const load = () =>
    void api<typeof data>('/audit')
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [jobs.length]);
  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="panel audit-summary">
        <ShieldCheck size={25} />
        <div>
          <h3>{data?.verification.valid ? 'Audit chain verified' : 'Checking audit integrity'}</h3>
          <p>{data?.verification.count || 0} linked events · append-only application audit trail</p>
        </div>
        <button className="button secondary" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <section className="panel jobs-panel">
        <div className="section-heading">
          <h2>Processing queue</h2>
          <Badge>Up to 3 attempts</Badge>
        </div>
        {jobs.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Evidence</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last update</th>
                  <th>Service message</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.title}</td>
                    <td>
                      <Status value={job.status} />
                    </td>
                    <td>{job.attempts}/3</td>
                    <td>{formatDate(job.updated_at)}</td>
                    <td>{job.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">New uploads are queued here automatically.</p>
        )}
      </section>
      <section className="panel activity-panel">
        <div className="section-heading">
          <h2>Evidence history</h2>
          <Badge>Latest 200 events</Badge>
        </div>
        {data?.events.map((event) => (
          <div className="activity-row" key={event.id}>
            <span className="activity-icon">
              {event.action.includes('review') ? (
                <CheckCircle2 size={17} />
              ) : event.action.includes('upload') ? (
                <Images size={17} />
              ) : (
                <Clock3 size={17} />
              )}
            </span>
            <div>
              <strong>{humanize(event.action)}</strong>
              <span>
                Record {event.entity_id.slice(0, 8)} · Actor {event.actor.slice(0, 8)}
              </span>
              <details>
                <summary>Inspect audit record</summary>
                <pre>{JSON.stringify({ ...event, detail: JSON.parse(event.detail) }, null, 2)}</pre>
              </details>
            </div>
            <time>{formatDate(event.created_at)}</time>
          </div>
        ))}
      </section>
    </>
  );
}
export function SettingsPage({
  settings,
  user,
  run,
}: {
  settings: Settings | null;
  user: User;
  run: Run;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const loadUsers = () => {
    if (user.role === 'admin')
      void api<User[]>('/users')
        .then(setUsers)
        .catch((e) => setError(e.message));
  };
  useEffect(() => {
    loadUsers();
  }, [user.role]);
  if (!settings) return <Loading />;
  const services = [
    {
      icon: Cloud,
      title: 'Cloudinary media',
      enabled: settings.cloudinary,
      description: settings.cloudinary
        ? 'Original media, video frames, optimized delivery and campaign crops.'
        : 'Local upload storage is active. Add Cloudinary credentials to your server .env.',
    },
    {
      icon: Sparkles,
      title: 'Vision & semantic discovery',
      enabled: settings.vision,
      description: settings.vision
        ? `Vision: ${settings.visionModel} · Embeddings: ${settings.embeddingModel}`
        : 'Metadata indexing is active. Add OPENAI_API_KEY to analyze images and search by meaning.',
    },
    {
      icon: Database,
      title: 'Persistent evidence store',
      enabled: true,
      description:
        'SQLite with durable analysis jobs, file hashes, report snapshots, and append-only audit events.',
    },
  ];
  return (
    <>
      <div className="settings-grid">
        {services.map((s) => (
          <section className="panel service-card" key={s.title}>
            <s.icon size={26} />
            <h3>{s.title}</h3>
            <Badge tone={s.enabled ? 'green' : 'amber'}>
              {s.enabled ? 'Configured' : 'Demo fallback'}
            </Badge>
            <p>{s.description}</p>
          </section>
        ))}
      </div>
      <section className="panel workspace-settings">
        <div className="section-heading">
          <h2>Workspace configuration</h2>
          <Badge tone={settings.demo ? 'amber' : 'green'}>
            {settings.demo ? 'Demo mode' : 'Live mode'}
          </Badge>
        </div>
        <dl className="metadata-grid">
          <div>
            <dt>Workspace</dt>
            <dd>{settings.workspace}</dd>
          </div>
          <div>
            <dt>Upload limit</dt>
            <dd>{settings.maxUploadMB} MB per file</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{settings.storage}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>12 hours · HTTP-only cookie</dd>
          </div>
        </dl>
        <p className="fine-print">
          Service secrets are configured on the server and are never returned to the browser.
          Restart the server after changing .env. Live mode requires a custom administrator
          password.
        </p>
      </section>
      {error && <div className="error">{error}</div>}
      {user.role === 'admin' && (
        <section className="panel team-panel">
          <div className="section-heading">
            <h2>Team access</h2>
            <LockKeyhole size={20} />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <Badge>{u.role}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Add a team member</h3>
          <form
            className="team-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fields = new FormData(form);
              setBusy(true);
              const ok = await run(
                () => post('/users', Object.fromEntries(fields)),
                'Team member created.',
              );
              if (ok) {
                form.reset();
                loadUsers();
              }
              setBusy(false);
            }}
          >
            <Field label="Name">
              <input name="name" required minLength={2} />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                minLength={12}
                placeholder="At least 12 characters"
              />
            </Field>
            <Field label="Role">
              <select name="role">
                <option value="editor">Editor</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </Field>
            <button className="button primary" disabled={busy}>
              <UserPlus size={16} />
              Add member
            </button>
          </form>
          <p className="fine-print">
            Editors upload, compare and prepare campaign media. Reviewers approve evidence and
            create or publish reports. Administrators can do both. All members share this workspace.
          </p>
        </section>
      )}
    </>
  );
}
