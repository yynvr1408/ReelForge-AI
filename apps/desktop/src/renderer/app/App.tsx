import { Sidebar } from '../components/Sidebar';
import { ServiceStatusBadge } from '../components/ServiceStatusBadge';
import { useAppStore } from '../stores/useAppStore';

import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { MediaLibraryPage } from '../features/media-library/MediaLibraryPage';
import { ReferenceLibraryPage } from '../features/reference-library/ReferenceLibraryPage';
import { StyleLibraryPage } from '../features/style-library/StyleLibraryPage';
import { EditorPage } from '../features/editor/EditorPage';
import { RenderQueuePage } from '../features/render-queue/RenderQueuePage';
import { TrainingStudioPage } from '../features/training-studio/TrainingStudioPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ModelManagerPage } from '../features/model-manager/ModelManagerPage';
import { UpdatesPage } from '../features/updates/UpdatesPage';

const SECTION_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  'media-library': 'Media Library',
  'reference-library': 'Reference Library',
  'style-library': 'Style Library',
  editor: 'Editor',
  'training-studio': 'Training Studio',
  'model-manager': 'Model Manager',
  'render-queue': 'Render Queue',
  updates: 'Updates',
  settings: 'Settings',
};

function ActiveSection() {
  const activeSection = useAppStore((s) => s.activeSection);

  switch (activeSection) {
    case 'dashboard':
      return <DashboardPage />;
    case 'projects':
      return <ProjectsPage />;
    case 'media-library':
      return <MediaLibraryPage />;
    case 'reference-library':
      return <ReferenceLibraryPage />;
    case 'style-library':
      return <StyleLibraryPage />;
    case 'editor':
      return <EditorPage />;
    case 'render-queue':
      return <RenderQueuePage />;
    case 'training-studio':
      return <TrainingStudioPage />;
    case 'model-manager':
      return <ModelManagerPage />;
    case 'updates':
      return <UpdatesPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return null;
  }
}

export default function App() {
  const activeSection = useAppStore((s) => s.activeSection);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-900 text-neutral-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
          <h1 className="text-base font-semibold text-neutral-100">
            {SECTION_TITLES[activeSection]}
          </h1>
          <ServiceStatusBadge />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <ActiveSection />
        </main>
      </div>
    </div>
  );
}
