import { useServiceStatus } from '../hooks/useServiceStatus';

const STATE_STYLES: Record<string, string> = {
  starting: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ready: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  stopped: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
};

const STATE_LABELS: Record<string, string> = {
  starting: 'Starting processing service…',
  ready: 'Processing service ready',
  error: 'Processing service error',
  stopped: 'Processing service stopped',
};

export function ServiceStatusBadge() {
  const status = useServiceStatus();
  const style = STATE_STYLES[status.state] ?? STATE_STYLES.stopped;
  const label = STATE_LABELS[status.state] ?? status.state;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${style}`}
      title={status.message}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </div>
  );
}
