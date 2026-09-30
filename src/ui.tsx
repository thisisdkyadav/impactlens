import { useEffect, useRef, type ReactNode } from 'react';
import {
  X,
  Image as ImageIcon,
  Film,
  Check,
  Clock3,
  AlertTriangle,
  LoaderCircle,
} from 'lucide-react';
import type { Asset } from './types';
import { formatDate } from './api';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === 'approved' || value === 'ready' || value === 'completed' || value === 'published'
          ? 'green'
          : value === 'rejected' || value === 'failed'
            ? 'red'
            : 'amber'
      }
    >
      {value === 'approved' || value === 'completed' ? (
        <Check size={12} />
      ) : value === 'failed' || value === 'rejected' ? (
        <AlertTriangle size={12} />
      ) : (
        <Clock3 size={12} />
      )}{' '}
      {value}
    </Badge>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" />
      <p>Loading your workspace…</p>
    </div>
  );
}
export function Media({
  asset,
  className = '',
  controls = false,
}: {
  asset: Asset;
  className?: string;
  controls?: boolean;
}) {
  if (asset.kind === 'video' && controls)
    return (
      <video
        className={className}
        src={asset.url}
        poster={asset.thumbnail !== asset.url ? asset.thumbnail : undefined}
        controls
        preload="metadata"
      />
    );
  if (asset.kind === 'video' && asset.thumbnail === asset.url)
    return (
      <div className={`video-placeholder ${className}`}>
        <Film size={38} />
        <span>Field video</span>
      </div>
    );
  return (
    <img
      className={className}
      src={asset.thumbnail || asset.url}
      alt={asset.title}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.opacity = '0';
        e.currentTarget.parentElement?.classList.add('image-unavailable');
      }}
    />
  );
}
export function AssetCard({
  asset,
  project,
  onOpen,
}: {
  asset: Asset;
  project?: string;
  onOpen: () => void;
}) {
  return (
    <button className="asset-card" onClick={onOpen}>
      <div className="asset-image">
        <Media asset={asset} />
        <span className="media-type">
          {asset.kind === 'video' ? <Film size={13} /> : <ImageIcon size={13} />} {asset.kind}
        </span>
        <span className="phase-tag">{asset.phase}</span>
        {asset.demo && <span className="demo-tag">Illustrative demo</span>}
      </div>
      <div className="asset-card-body">
        <div className="asset-subtitle">
          {project || 'Field evidence'}
          <span>{formatDate(asset.captured_at)}</span>
        </div>
        <h3>{asset.title}</h3>
        <div className="asset-footer">
          <Status value={asset.review} />
          <span>{asset.analysis.tags?.slice(0, 2).join(' · ') || asset.status}</span>
        </div>
      </div>
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
