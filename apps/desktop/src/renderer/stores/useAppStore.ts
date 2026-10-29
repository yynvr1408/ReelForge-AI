import { create } from 'zustand';

export type NavSection =
  | 'dashboard'
  | 'projects'
  | 'media-library'
  | 'reference-library'
  | 'style-library'
  | 'editor'
  | 'training-studio'
  | 'model-manager'
  | 'render-queue'
  | 'updates'
  | 'settings';

interface AppState {
  activeSection: NavSection;
  activeProjectId: string | null;
  setActiveSection: (section: NavSection) => void;
  setActiveProjectId: (projectId: string | null) => void;
  openProjectInEditor: (projectId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeSection: 'dashboard',
  activeProjectId: null,
  setActiveSection: (section) => set({ activeSection: section }),
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
  openProjectInEditor: (projectId) =>
    set({ activeProjectId: projectId, activeSection: 'editor' }),
}));
