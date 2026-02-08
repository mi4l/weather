import type { WorldSnapshot } from '../world/types';

const STORAGE_KEY = 'isoweather-town-v1';

export interface SavedState {
  world: WorldSnapshot;
}

export function saveToStorage(data: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota and serialization errors.
  }
}

export function loadFromStorage(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SavedState;
    if (!parsed?.world) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore permission errors.
  }
}
