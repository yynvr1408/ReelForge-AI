import { useEffect, useState } from 'react';
import { Plus, Trash2, FolderOpen } from 'lucide-react';

import type { Project } from '../../../shared/ipc-contract';
import { useAppStore } from '../../stores/useAppStore';
import { useServiceStatus } from '../../hooks/useServiceStatus';

export function ProjectsPage() {
  const status = useServiceStatus();
  const openProjectInEditor = useAppStore((s) => s.openProjectInEditor);

  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await window.reelforge.listProjects();
    setProjects(list);
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await window.reelforge.createProject(newName.trim());
      setNewName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await window.reelforge.deleteProject(id);
    await refresh();
  }

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New project name"
          className="flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Plus size={16} /> Create
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {projects.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No projects yet. Create your first project above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-neutral-950 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-neutral-100">
                  {project.name}
                </div>
                <div className="text-xs text-neutral-500">
                  Updated {new Date(project.updated_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openProjectInEditor(project.id)}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
                >
                  <FolderOpen size={14} /> Open
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(project.id)}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
