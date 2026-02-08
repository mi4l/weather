import type { AppMode, AppState, BuildTool, SirenMode, WeatherMode } from '../app/types';

interface OverlayActions {
  onModeChange: (mode: AppMode) => void;
  onToolChange: (tool: BuildTool) => void;
  onWeatherModeChange: (mode: WeatherMode) => void;
  onSirenModeChange: (mode: SirenMode) => void;
  onWeatherToggle: (key: 'rain' | 'thunder' | 'tornado', value: boolean) => void;
  onIntensityChange: (value: number) => void;
  onPlayPause: () => void;
  onTimeScaleChange: (value: 1 | 2 | 4) => void;
  onAudioToggle: () => void;
  onVolumeChange: (value: number) => void;
  onReset: () => void;
  onNewWorld: () => void;
  onSpawnTornado: () => void;
}

export class OverlayUI {
  private readonly panel: HTMLDivElement;

  private readonly modeButtons = new Map<AppMode, HTMLButtonElement>();
  private readonly toolButtons = new Map<BuildTool, HTMLButtonElement>();
  private readonly weatherModeSelect: HTMLSelectElement;
  private readonly sirenModeSelect: HTMLSelectElement;

  private readonly weatherButtons: Record<'rain' | 'thunder' | 'tornado', HTMLButtonElement>;

  private readonly playButton: HTMLButtonElement;
  private readonly timeButtons = new Map<1 | 2 | 4, HTMLButtonElement>();
  private readonly intensitySlider: HTMLInputElement;
  private readonly audioButton: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly clockValue: HTMLSpanElement;

  constructor(root: HTMLElement, actions: OverlayActions) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    root.appendChild(this.panel);

    const title = document.createElement('h1');
    title.textContent = 'IsoWeather Town';
    this.panel.appendChild(title);

    const modeRow = this.makeRow('Mode');
    for (const mode of ['build', 'simulate'] as const) {
      const button = this.makeButton(mode[0].toUpperCase() + mode.slice(1), () => actions.onModeChange(mode));
      this.modeButtons.set(mode, button);
      modeRow.append(button);
    }

    const toolRow = this.makeRow('Build Tool');
    for (const tool of ['house', 'road', 'erase'] as const) {
      const label = tool === 'erase' ? 'Eraser' : tool[0].toUpperCase() + tool.slice(1);
      const button = this.makeButton(label, () => actions.onToolChange(tool));
      this.toolButtons.set(tool, button);
      toolRow.append(button);
    }

    const weatherModeRow = this.makeRow('Weather');
    this.weatherModeSelect = document.createElement('select');
    this.weatherModeSelect.innerHTML = `
      <option value="auto">Auto</option>
      <option value="manual">Manual</option>
    `;
    this.weatherModeSelect.addEventListener('change', () => {
      actions.onWeatherModeChange(this.weatherModeSelect.value as WeatherMode);
    });
    weatherModeRow.append(this.weatherModeSelect);

    const sirenModeRow = this.makeRow('Siren');
    this.sirenModeSelect = document.createElement('select');
    this.sirenModeSelect.innerHTML = `
      <option value="auto">Auto</option>
      <option value="classic">Classic</option>
      <option value="wail">Wail</option>
      <option value="hilo">Hi-Lo</option>
      <option value="pulse">Pulse</option>
    `;
    this.sirenModeSelect.addEventListener('change', () => {
      actions.onSirenModeChange(this.sirenModeSelect.value as SirenMode);
    });
    sirenModeRow.append(this.sirenModeSelect);

    const weatherToggleRow = this.makeRow('Events');
    const rainButton = this.makeButton('Rain', () => {
      actions.onWeatherToggle('rain', rainButton.dataset.active !== 'true');
    });
    const thunderButton = this.makeButton('Thunder', () => {
      actions.onWeatherToggle('thunder', thunderButton.dataset.active !== 'true');
    });
    const tornadoButton = this.makeButton('Tornado', () => {
      actions.onWeatherToggle('tornado', tornadoButton.dataset.active !== 'true');
    });

    this.weatherButtons = {
      rain: rainButton,
      thunder: thunderButton,
      tornado: tornadoButton
    };

    weatherToggleRow.append(rainButton, thunderButton, tornadoButton);

    const intensityRow = this.makeRow('Intensity');
    this.intensitySlider = document.createElement('input');
    this.intensitySlider.type = 'range';
    this.intensitySlider.min = '0';
    this.intensitySlider.max = '1';
    this.intensitySlider.step = '0.01';
    this.intensitySlider.addEventListener('input', () => {
      actions.onIntensityChange(Number(this.intensitySlider.value));
    });
    intensityRow.append(this.intensitySlider);

    const playbackRow = this.makeRow('Simulation');
    this.playButton = this.makeButton('Play', () => actions.onPlayPause());
    this.playButton.dataset.ok = 'true';
    playbackRow.append(this.playButton);

    for (const scale of [1, 2, 4] as const) {
      const button = this.makeButton(`${scale}x`, () => actions.onTimeScaleChange(scale));
      this.timeButtons.set(scale, button);
      playbackRow.append(button);
    }

    const tornadoRow = this.makeRow('Testing');
    const spawnButton = this.makeButton('Spawn Tornado', () => actions.onSpawnTornado());
    tornadoRow.append(spawnButton);

    const audioRow = this.makeRow('Audio');
    this.audioButton = this.makeButton('Enable Audio', () => actions.onAudioToggle());
    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '1';
    this.volumeSlider.step = '0.01';
    this.volumeSlider.addEventListener('input', () => {
      actions.onVolumeChange(Number(this.volumeSlider.value));
    });

    audioRow.append(this.audioButton, this.volumeSlider);

    const resetRow = this.makeRow('World');
    const clearButton = this.makeButton('Reset', () => actions.onReset());
    clearButton.dataset.danger = 'true';
    const newWorldButton = this.makeButton('New World', () => actions.onNewWorld());
    resetRow.append(clearButton, newWorldButton);

    const clockRow = this.makeRow('Clock');
    this.clockValue = document.createElement('span');
    this.clockValue.textContent = '--:--';
    this.clockValue.style.fontVariantNumeric = 'tabular-nums';
    this.clockValue.style.fontSize = '0.9rem';
    this.clockValue.style.color = '#f5fbe8';
    clockRow.append(this.clockValue);
  }

  update(state: Readonly<AppState>): void {
    for (const [mode, button] of this.modeButtons) {
      button.dataset.active = String(state.mode === mode);
    }

    const buildMode = state.mode === 'build';

    for (const [tool, button] of this.toolButtons) {
      button.dataset.active = String(state.buildTool === tool);
      button.disabled = !buildMode;
    }

    this.weatherModeSelect.value = state.weatherMode;
    this.sirenModeSelect.value = state.sirenMode;

    const manualWeather = state.weatherMode === 'manual';
    for (const [key, button] of Object.entries(this.weatherButtons) as Array<
      ['rain' | 'thunder' | 'tornado', HTMLButtonElement]
    >) {
      button.dataset.active = String(state.weatherToggles[key]);
      button.disabled = !manualWeather;
    }

    this.intensitySlider.value = String(state.intensity);
    this.playButton.textContent = state.playing ? 'Pause' : 'Play';

    for (const [scale, button] of this.timeButtons) {
      button.dataset.active = String(state.timeScale === scale);
    }

    this.audioButton.textContent = state.audioEnabled ? 'Mute Audio' : 'Enable Audio';
    this.audioButton.dataset.active = String(state.audioEnabled);
    this.volumeSlider.value = String(state.masterVolume);
  }

  setClock(hours: number): void {
    const normalized = ((hours % 24) + 24) % 24;
    const h = Math.floor(normalized);
    const m = Math.floor((normalized - h) * 60);
    this.clockValue.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  private makeRow(labelText: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'panel-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    row.appendChild(label);

    this.panel.appendChild(row);
    return row;
  }

  private makeButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }
}
