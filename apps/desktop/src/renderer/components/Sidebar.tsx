import {
  LayoutDashboard,
  FolderKanban,
  Film,
  Library,
  Palette,
  Scissors,
  GraduationCap,
  Boxes,
  ListVideo,
  Settings as SettingsIcon,
} from 'lucide-react';

import { useAppStore, type NavSection } from '../stores/useAppStore';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'media-library', label: 'Media Library', icon: Film },
  { id: 'reference-library', label: 'Reference Library', icon: Library },
  { id: 'style-library', label: 'Style Library', icon: Palette },
  { id: 'editor', label: 'Editor', icon: Scissors },
  { id: 'training-studio', label: 'Training Studio', icon: GraduationCap },
  { id: 'model-manager', label: 'Model Manager', icon: Boxes },
  { id: 'render-queue', label: 'Render Queue', icon: ListVideo },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  const activeSection = useAppStore((s) => s.activeSection);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  return (
    <nav className="flex h-full w-56 flex-col gap-1 border-r border-white/10 bg-neutral-950 p-3">
      <div className="mb-3 px-2 py-1 text-sm font-semibold tracking-wide text-neutral-200">
        ReelForge <span className="text-orange-500">AI</span>
      </div>
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
              isActive
                ? 'bg-orange-500/15 text-orange-400'
                : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
