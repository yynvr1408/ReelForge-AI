import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import type {
  ReferenceVideo,
  StyleProfile,
} from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

export function StyleLibraryPage() {
  const status = useServiceStatus();
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [references, setReferences] = useState<ReferenceVideo[]>([]);
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [profileName, setProfileName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [p, r] = await Promise.all([
      window.reelforge.listStyleProfiles(),
      window.reelforge.listReferences(),
    ]);
    setProfiles(p);
    setReferences(r.filter((ref) => ref.analysis_status === 'complete'));
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  function toggleRef(id: string) {
    setSelectedRefIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    if (!profileName.trim() || selectedRefIds.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      await window.reelforge.createStyleProfile(
        profileName.trim(),
        selectedRefIds,
      );
      setProfileName('');
      setSelectedRefIds([]);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create style profile',
      );
    } finally {
      setCreating(false);
    }
  }

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-200">
          Create a style profile
        </h2>
        {references.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Analyze at least one reference video in the Reference Library before
            creating a profile.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name"
              className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500"
            />
            <div className="flex flex-col gap-1">
              {references.map((ref) => (
                <label
                  key={ref.id}
                  className="flex items-center gap-2 text-sm text-neutral-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedRefIds.includes(ref.id)}
                    onChange={() => toggleRef(ref.id)}
                    className="accent-orange-500"
                  />
                  {ref.name}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={
                creating || !profileName.trim() || selectedRefIds.length === 0
              }
              className="flex w-fit items-center gap-1.5 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Plus size={16} /> Create profile
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-200">
          Saved profiles
        </h2>
        {profiles.length === 0 ? (
          <p className="text-sm text-neutral-500">No style profiles yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profiles.map((profile) => {
              const pacing = profile.profile_json.pacing as
                | Record<string, number>
                | undefined;
              return (
                <li
                  key={profile.id}
                  className="rounded-lg border border-white/10 bg-neutral-950 px-4 py-3"
                >
                  <div className="text-sm font-medium text-neutral-100">
                    {profile.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {profile.source_reference_ids.length} reference(s) ·
                    confidence {(profile.confidence * 100).toFixed(0)}%
                    {pacing
                      ? ` · median shot ${pacing.median_shot_duration_seconds.toFixed(2)}s`
                      : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
