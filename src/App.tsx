import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Aperture,
  LayoutDashboard,
  Images,
  FolderOpen,
  SplitSquareHorizontal,
  FileText,
  Activity,
  Settings2,
  Plus,
  LogOut,
  ChevronDown,
  ArrowUpRight,
  Menu,
  X,
  Leaf,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
} from 'lucide-react';
import { api, post, setCsrf, download } from './api';
import type {
  User,
  Page,
  Dashboard,
  Project,
  AssetResult,
  Settings,
  Report,
  Comparison,
  Job,
} from './types';
import { Loading } from './ui';
import {
  Overview,
  Evidence,
  Projects,
  ComparePage,
  ReportsPage,
  ActivityPage,
  SettingsPage,
} from './pages';
import { UploadModal, ProjectModal, EvidenceDetail, ReportModal } from './forms';
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'evidence', label: 'Evidence library', icon: Images },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'compare', label: 'Before & after', icon: SplitSquareHorizontal },
  { id: 'reports', label: 'Impact reports', icon: FileText },
  { id: 'activity', label: 'Activity & provenance', icon: Activity },
  { id: 'settings', label: 'Workspace settings', icon: Settings2 },
] as const;
export type Run = (task: () => Promise<unknown>, success?: string) => Promise<boolean>;
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [loginError, setLoginError] = useState(''),
    [loginBusy, setLoginBusy] = useState(false);
  const [page, setPage] = useState<Page>('overview'),
    [mobile, setMobile] = useState(false),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [assets, setAssets] = useState<AssetResult>({
      assets: [],
      total: 0,
      page: 1,
      pages: 1,
      searchMode: 'keyword',
    }),
    [settings, setSettings] = useState<Settings | null>(null),
    [reports, setReports] = useState<Report[]>([]),
    [comparisons, setComparisons] = useState<Comparison[]>([]),
    [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState<'upload' | 'project' | 'report' | null>(null),
    [selectedAsset, setSelectedAsset] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [assetLoading, setAssetLoading] = useState(false),
    [searchMode, setSearchMode] = useState<'keyword' | 'semantic'>('keyword');
  const canEdit = user?.role === 'admin' || user?.role === 'editor',
    canReview = user?.role === 'admin' || user?.role === 'reviewer';
  const assetRequest = useRef(0);
  useEffect(() => {
    void api<{ user: User; csrf: string }>('/auth/me')
      .then((data) => {
        setUser(data.user);
        setCsrf(data.csrf);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => {
      setUser(null);
      setError('Your session expired. Sign in again.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [d, p, s, r, c, j] = await Promise.all([
        api<Dashboard>('/dashboard'),
        api<Project[]>('/projects'),
        api<Settings>('/settings'),
        api<Report[]>('/reports'),
        api<Comparison[]>('/comparisons'),
        api<Job[]>('/jobs'),
      ]);
      setDashboard(d);
      setProjects(p);
      setSettings(s);
      setReports(r);
      setComparisons(c);
      setJobs(j);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const loadAssets = useCallback(
    async (mode: 'keyword' | 'semantic' = searchMode) => {
      const requestId = ++assetRequest.current;
      setAssetLoading(true);
      try {
        const params = new URLSearchParams(
          Object.fromEntries(
            Object.entries({ ...filters, q: query, mode }).filter(([, v]) => Boolean(v)),
          ),
        );
        const response = await api<AssetResult>(`/assets?${params}`);
        if (requestId === assetRequest.current) setAssets(response);
      } catch (e) {
        if (requestId === assetRequest.current) setError((e as Error).message);
      } finally {
        if (requestId === assetRequest.current) setAssetLoading(false);
      }
    },
    [filters, query, searchMode],
  );
  useEffect(() => {
    if (!user) return;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 7000);
    return () => clearInterval(timer);
  }, [user, refresh]);
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      void loadAssets('keyword');
    }, 250);
    return () => clearTimeout(timer);
  }, [user, filters, query]);
  useEffect(() => {
    if (!user || query) return;
    const timer = setInterval(() => {
      void loadAssets('keyword');
    }, 7000);
    return () => clearInterval(timer);
  }, [user, query, loadAssets]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const run: Run = async (task, success) => {
    try {
      await task();
      if (success) setToast(success);
      await Promise.all([refresh(), loadAssets('keyword')]);
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  };
  const navigate = (target: Page) => {
    setPage(target);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const upload = () => setModal('upload');
  if (checking) return <Loading />;
  if (!user)
    return (
      <div className="login-layout">
        <div className="login-story">
          <div className="brand">
            <Aperture size={34} />
            <span>
              impactlens<span className="brand-dot">.</span>
            </span>
          </div>
          <div>
            <span className="eyebrow light">FIELD EVIDENCE, CONNECTED</span>
            <h1>
              Every image.
              <br />A clearer picture <br />
              of impact.
            </h1>
            <p>
              Organize your field media, understand what changed, and tell stories your evidence can
              support.
            </p>
            <div className="login-chips">
              <span>
                <Leaf size={16} /> Sustainability
              </span>
              <span>
                <ShieldCheck size={16} /> Traceable evidence
              </span>
            </div>
          </div>
          <span className="login-foot">Built for the people making a difference.</span>
        </div>
        <main className="login-form">
          <span className="eyebrow">YOUR FIELD WORKSPACE</span>
          <h2>Welcome to ImpactLens</h2>
          <p>Sign in to turn your field media into organized evidence.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoginBusy(true);
              setLoginError('');
              const body = new FormData(e.currentTarget);
              try {
                const data = await post<{ user: User; csrf: string }>('/auth/login', {
                  email: body.get('email'),
                  password: body.get('password'),
                });
                setCsrf(data.csrf);
                setUser(data.user);
              } catch (err) {
                setLoginError((err as Error).message);
              } finally {
                setLoginBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                defaultValue="admin@impactlens.local"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                defaultValue="ImpactLens!2026"
                required
              />
            </label>
            {loginError && (
              <div className="error" role="alert">
                {loginError}
              </div>
            )}
            <button className="button primary full" disabled={loginBusy}>
              {loginBusy ? <LoaderCircle size={18} className="spin" /> : null}Sign in to workspace
            </button>
          </form>
          <div className="demo-login">
            <span className="small-label">LOCAL DEMO LOGIN</span>
            <p>
              <code>admin@impactlens.local</code>
              <br />
              <code>ImpactLens!2026</code>
            </p>
            <span>
              Live deployments use the administrator credentials in your server configuration.
            </span>
          </div>
        </main>
      </div>
    );
  return (
    <div className="app-shell">
      <button
        className="mobile-toggle icon-button"
        onClick={() => setMobile(!mobile)}
        aria-label="Toggle navigation"
      >
        {mobile ? <X /> : <Menu />}
      </button>
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="brand">
          <Aperture size={30} />
          <span>
            impactlens<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="workspace-chip">
          <span className="workspace-avatar">F</span>
          <div>
            <strong>Field workspace</strong>
            <small>{settings?.demo ? 'Demo workspace' : 'Shared workspace'}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'evidence' && (
                <span className="nav-count">{dashboard?.totals.assets || 0}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="evidence-promise">
            <ShieldCheck size={21} />
            <strong>Every story has a source.</strong>
            <p>Your original evidence stays connected to every insight.</p>
          </div>
          <div className="user-block">
            <span className="user-avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await post('/auth/logout', {});
                  setUser(null);
                  setDashboard(null);
                  setSelectedAsset(null);
                  setModal(null);
                } catch (e) {
                  setToast((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{nav.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${settings?.cloudinary ? 'live' : ''}`}>
              {settings?.cloudinary ? 'Cloudinary configured' : 'Local demo storage'}
            </span>
            <span className="topbar-avatar">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'overview'
                  ? 'YOUR IMPACT, IN FOCUS'
                  : page === 'compare'
                    ? 'SEE THE CHANGE'
                    : 'FIELD WORKSPACE'}
              </span>
              <h1>
                {page === 'overview'
                  ? 'Evidence to impact.'
                  : nav.find((item) => item.id === page)?.label}
              </h1>
              <p>
                {
                  (
                    {
                      overview: 'A living picture of your projects, grounded in field evidence.',
                      evidence: 'Find, review, and connect the moments that matter.',
                      projects: 'Keep your fieldwork connected by project, place, and time.',
                      compare: 'Bring baseline and follow-up evidence into the same frame.',
                      reports: 'Create source-backed stories from reviewed evidence.',
                      activity: 'Follow the complete journey from original asset to insight.',
                      settings: 'Manage your team and check your service connections.',
                    } as Record<Page, string>
                  )[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === 'overview' && (
                <button className="button secondary" onClick={() => download('/export?format=csv')}>
                  Export evidence <ArrowUpRight size={16} />
                </button>
              )}
              {page === 'projects' && canEdit ? (
                <button className="button primary" onClick={() => setModal('project')}>
                  <Plus size={17} />
                  New project
                </button>
              ) : page === 'reports' && canReview ? (
                <button className="button primary" onClick={() => setModal('report')}>
                  <Plus size={17} />
                  Create report
                </button>
              ) : (
                canEdit && (
                  <button className="button primary" onClick={upload}>
                    <Plus size={17} />
                    Upload evidence
                  </button>
                )
              )}
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              <AlertCircle size={17} />
              {error}
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {!dashboard ? (
            <Loading />
          ) : page === 'overview' ? (
            <Overview
              dashboard={dashboard}
              projects={projects}
              onOpen={setSelectedAsset}
              navigate={navigate}
              selectProject={(p) => {
                setFilters({ project: p });
                navigate('evidence');
              }}
            />
          ) : page === 'evidence' ? (
            <Evidence
              result={assets}
              projects={projects}
              query={query}
              setQuery={setQuery}
              filters={filters}
              setFilters={setFilters}
              loading={assetLoading}
              mode={searchMode}
              setMode={setSearchMode}
              search={() => void loadAssets()}
              onOpen={setSelectedAsset}
              vision={settings?.vision || false}
            />
          ) : page === 'projects' ? (
            <Projects
              projects={projects}
              onSelect={(p) => {
                setFilters({ project: p });
                navigate('evidence');
              }}
            />
          ) : page === 'compare' ? (
            <ComparePage
              projects={projects}
              comparisons={comparisons}
              run={run}
              canEdit={canEdit}
              onOpen={setSelectedAsset}
            />
          ) : page === 'reports' ? (
            <ReportsPage
              reports={reports}
              projects={projects}
              run={run}
              canReview={canReview}
              onOpen={setSelectedAsset}
            />
          ) : page === 'activity' ? (
            <ActivityPage jobs={jobs} />
          ) : (
            <SettingsPage settings={settings} user={user} run={run} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <Aperture size={14} /> ImpactLens
          </span>
          <span>Originals preserved. Insights accountable.</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast('')}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === 'upload' && (
        <UploadModal
          projects={projects}
          defaultProject={filters.project}
          onClose={() => setModal(null)}
          run={run}
          settings={settings}
        />
      )}{' '}
      {modal === 'project' && <ProjectModal onClose={() => setModal(null)} run={run} />}{' '}
      {modal === 'report' && (
        <ReportModal projects={projects} onClose={() => setModal(null)} run={run} />
      )}{' '}
      {selectedAsset && (
        <EvidenceDetail
          assetId={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          run={run}
          canEdit={canEdit}
          canReview={canReview}
        />
      )}
    </div>
  );
}
