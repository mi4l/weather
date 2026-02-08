import type { AppState } from './types';

export type StoreListener = (state: Readonly<AppState>) => void;

const defaultState: AppState = {
  mode: 'build',
  buildTool: 'house',
  weatherMode: 'auto',
  sirenMode: 'auto',
  weatherToggles: {
    rain: true,
    thunder: true,
    tornado: true
  },
  intensity: 0.6,
  playing: false,
  timeScale: 1,
  audioEnabled: false,
  masterVolume: 0.72
};

export class AppStore {
  private state: AppState = { ...defaultState };
  private readonly listeners = new Set<StoreListener>();

  getState(): Readonly<AppState> {
    return this.state;
  }

  update(patch: Partial<AppState>): void {
    this.state = {
      ...this.state,
      ...patch
    };
    this.emit();
  }

  updateNested<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state = {
      ...this.state,
      [key]: value
    };
    this.emit();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.state = { ...defaultState, weatherToggles: { ...defaultState.weatherToggles } };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
