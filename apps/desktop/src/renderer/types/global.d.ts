import type { ReelforgeApi } from '../../preload';

declare global {
  interface Window {
    reelforge: ReelforgeApi;
  }
}

export {};
