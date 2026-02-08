export type AppMode = 'build' | 'simulate';
export type BuildTool = 'house' | 'road' | 'erase';
export type WeatherMode = 'auto' | 'manual';
export type SirenMode = 'auto' | 'classic' | 'wail' | 'hilo' | 'pulse';

export interface WeatherToggles {
  rain: boolean;
  thunder: boolean;
  tornado: boolean;
}

export interface AppState {
  mode: AppMode;
  buildTool: BuildTool;
  weatherMode: WeatherMode;
  sirenMode: SirenMode;
  weatherToggles: WeatherToggles;
  intensity: number;
  playing: boolean;
  timeScale: 1 | 2 | 4;
  audioEnabled: boolean;
  masterVolume: number;
}
