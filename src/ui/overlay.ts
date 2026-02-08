import type { AppState } from '../app/types';

interface OverlayActions {
  onPlayPause: () => void;
  onVolumeChange: (value: number) => void;
  onNewWorld: () => void;
  onSpawnTornado: () => void;
}

export class OverlayUI {
  private readonly playButton: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;

  constructor(root: HTMLElement, actions: OverlayActions) {
    const panel = document.createElement('div');
    panel.className = 'panel panel-compact';
    root.appendChild(panel);

    const controlsRow = document.createElement('div');
    controlsRow.className = 'panel-row panel-row-compact';
    panel.appendChild(controlsRow);

    this.playButton = this.makeButton('▶', () => actions.onPlayPause());
    this.playButton.classList.add('icon-button');
    this.playButton.dataset.ok = 'true';
    this.playButton.title = 'Play';
    controlsRow.append(this.playButton);

    const volumeWrap = document.createElement('label');
    volumeWrap.className = 'volume-wrap';
    volumeWrap.textContent = 'Vol';
    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '100';
    this.volumeSlider.step = '1';
    this.volumeSlider.addEventListener('input', () => {
      actions.onVolumeChange(Number(this.volumeSlider.value));
    });
    volumeWrap.append(this.volumeSlider);
    controlsRow.append(volumeWrap);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'panel-row panel-row-compact';
    panel.appendChild(actionsRow);

    const newButton = this.makeButton('New', () => actions.onNewWorld());
    newButton.classList.add('small-button');
    actionsRow.append(newButton);

    const tornadoButton = this.makeButton('Tornado', () => actions.onSpawnTornado());
    tornadoButton.classList.add('small-button');
    tornadoButton.dataset.danger = 'true';
    actionsRow.append(tornadoButton);
  }

  update(state: Readonly<AppState>): void {
    const isPlaying = state.playing;
    this.playButton.textContent = isPlaying ? '⏸' : '▶';
    this.playButton.title = isPlaying ? 'Pause' : 'Play';
    this.playButton.setAttribute('aria-label', isPlaying ? 'Pause simulation' : 'Play simulation');
    this.volumeSlider.value = String(Math.round(state.masterVolume * 100));
  }

  setClock(_hours: number): void {
    // Compact controls intentionally omit the clock display.
  }

  private makeButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }
}
