import { useEffect, useState } from 'react';
import { FolderKanban, Library, Palette, ListVideo, Plus } from 'lucide-react';

import { useAppStore } from '../../stores/useAppStore';
import type {
  Project,
  ReferenceVideo,
  RenderJob,
  StyleProfile,
} from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-neutral-950 p-4">
      <div className="rounded-md bg-orange-500/10 p-2 text-orange-400">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-semibold text-neutral-100">{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const status = useServiceStatus();
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const openProjectInEditor = useAppStore((s) => s.openProjectInEditor);

  const [projects, setProjects] = useState<Project[]>([]);
  const [references, setReferences] = useState<ReferenceVideo[]>([]);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status.state !== 'ready') return;
    let cancelled = false;
    Promise.all([
      window.reelforge.listProjects(),
      window.reelforge.listReferences(),
      window.reelforge.listStyleProfiles(),
      window.reelforge.listRenderJobs(),
    ]).then(([p, r, s, j]) => {
      if (cancelled) return;
      setProjects(p);
      setReferences(r);
      setProfiles(s);
      setRenderJobs(j);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status.state]);

  const activeJobs = renderJobs.filter(
    (j) => j.status === 'queued' || j.status === 'running',
  );
  const failedJobs = renderJobs.filter((j) => j.status === 'failed');

  if (status.state !== 'ready') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={FolderKanban}
          label="Projects"
          value={projects.length}
        />
        <StatCard
          icon={Library}
          label="Reference videos"
          value={references.length}
        />
        <StatCard
          icon={Palette}
          label="Style profiles"
          value={profiles.length}
        />
        <StatCard
          icon={ListVideo}
          label="Active render jobs"
          value={activeJobs.length}
        />
      </div>

      {failedJobs.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {failedJobs.length} render job{failedJobs.length > 1 ? 's' : ''} need
          attention. See Render Queue.
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">
            Recent projects
          </h2>
          <button
            type="button"
            onClick={() => setActiveSection('projects')}
            className="flex items-center gap-1 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
          >
            <Plus size={14} /> New project
          </button>
        </div>
        {loaded && projects.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No projects yet. Create one to start editing.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {projects.slice(0, 5).map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => openProjectInEditor(project.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
                >
                  <span>{project.name}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(project.updated_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
