export type SirenMode = 'auto' | 'classic' | 'wail' | 'hilo' | 'pulse';

const MAX_SIREN_LEVEL = 0.375;
const MAX_MASTER_LEVEL = 0.5;
const RANDOM_SIREN_MODES: Exclude<SirenMode, 'auto'>[] = ['classic', 'wail', 'hilo', 'pulse'];

export class AudioEngine {
  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sirenGain: GainNode | null = null;

  private rainSource: AudioBufferSourceNode | null = null;
  private sirenOscA: OscillatorNode | null = null;
  private sirenOscB: OscillatorNode | null = null;

  private enabled = false;
  private paused = true;
  private masterVolume = 0.72;

  private sirenMode: SirenMode = 'auto';
  private activeSirenMode: Exclude<SirenMode, 'auto'> = 'classic';
  private sirenIsActive = false;
  private sirenLevel = 0;
  private sirenTarget = 0;
  private sirenPhase = 0;

  async ensureReady(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.createGraph();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateMasterGain();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.updateMasterGain();
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = volume;
    this.updateMasterGain();
  }

  setSirenMode(mode: SirenMode): void {
    this.sirenMode = mode;
    if (mode !== 'auto') {
      this.activeSirenMode = mode;
    }
  }

  setRainIntensity(level: number): void {
    if (!this.context || !this.rainGain) {
      return;
    }

    const now = this.context.currentTime;
    const target = Math.max(0, Math.min(1, level)) * 0.62;
    this.rainGain.gain.cancelScheduledValues(now);
    this.rainGain.gain.setTargetAtTime(target, now, 0.3);
  }

  setSirenActive(active: boolean): void {
    if (active && !this.sirenIsActive) {
      this.activeSirenMode = this.resolveSirenMode();
    }

    this.sirenIsActive = active;
    this.sirenTarget = active ? MAX_SIREN_LEVEL : 0;
  }

  triggerThunder(intensity: number): void {
    if (!this.context || !this.sfxGain || !this.enabled || this.paused) {
      return;
    }

    const duration = 2.6;
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i += 1) {
      const t = i / data.length;
      const falloff = Math.exp(-t * 4.8);
      const low = Math.sin(t * 18 * Math.PI) * 0.28;
      const noise = (Math.random() * 2 - 1) * 0.52;
      data[i] = (low + noise) * falloff;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.15;

    const gain = this.context.createGain();
    const target = Math.max(0.2, Math.min(1, intensity));
    gain.gain.value = target * 0.72;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start();
  }

  update(dt: number): void {
    if (!this.context || !this.sirenGain || !this.sirenOscA || !this.sirenOscB) {
      return;
    }

    const now = this.context.currentTime;
    this.sirenLevel += (this.sirenTarget - this.sirenLevel) * Math.min(1, dt * 4);
    this.sirenPhase += dt;

    let freqA = 560;
    let freqB = 730;
    let amplitudeScale = 1;

    switch (this.activeSirenMode) {
      case 'classic': {
        const wobble = Math.sin(this.sirenPhase * Math.PI * 2 * 0.75);
        freqA = 560 + wobble * 60;
        freqB = 730 - wobble * 54;
        break;
      }
      case 'wail': {
        const sweep = Math.sin(this.sirenPhase * Math.PI * 2 * 0.32);
        freqA = 430 + (sweep + 1) * 180;
        freqB = 620 + (sweep + 1) * 140;
        break;
      }
      case 'hilo': {
        const high = Math.floor(this.sirenPhase * 1.45) % 2 === 0;
        freqA = high ? 780 : 510;
        freqB = high ? 1020 : 690;
        break;
      }
      case 'pulse': {
        const pulse = Math.max(0, Math.sin(this.sirenPhase * Math.PI * 2 * 2));
        freqA = 520 + pulse * 290;
        freqB = 710 + pulse * 240;
        amplitudeScale = 0.38 + pulse * 0.62;
        break;
      }
    }

    this.sirenGain.gain.setTargetAtTime(this.sirenLevel * amplitudeScale, now, 0.15);
    this.sirenOscA.frequency.setTargetAtTime(freqA, now, 0.08);
    this.sirenOscB.frequency.setTargetAtTime(freqB, now, 0.08);
  }

  dispose(): void {
    this.rainSource?.stop();
    this.sirenOscA?.stop();
    this.sirenOscB?.stop();

    this.context?.close();

    this.rainSource = null;
    this.sirenOscA = null;
    this.sirenOscB = null;
    this.context = null;
  }

  private resolveSirenMode(): Exclude<SirenMode, 'auto'> {
    if (this.sirenMode !== 'auto') {
      return this.sirenMode;
    }

    const idx = Math.floor(Math.random() * RANDOM_SIREN_MODES.length);
    return RANDOM_SIREN_MODES[idx];
  }

  private createGraph(): void {
    if (!this.context) {
      return;
    }

    this.masterGain = this.context.createGain();
    this.rainGain = this.context.createGain();
    this.sfxGain = this.context.createGain();
    this.sirenGain = this.context.createGain();

    this.masterGain.gain.value = 0;
    this.rainGain.gain.value = 0;
    this.sfxGain.gain.value = 0.85;
    this.sirenGain.gain.value = 0;

    this.rainGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.sirenGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);

    this.createRainLoop();
    this.createSirenLoop();
    this.updateMasterGain();
  }

  private createRainLoop(): void {
    if (!this.context || !this.rainGain) {
      return;
    }

    const duration = 2.8;
    const sampleCount = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i += 1) {
      const white = Math.random() * 2 - 1;
      const flutter = Math.sin((i / sampleCount) * Math.PI * 18) * 0.15;
      channel[i] = white * 0.4 + flutter;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1000;

    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4200;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(this.rainGain);

    source.start();
    this.rainSource = source;
  }

  private createSirenLoop(): void {
    if (!this.context || !this.sirenGain) {
      return;
    }

    const oscA = this.context.createOscillator();
    const oscB = this.context.createOscillator();
    const gainA = this.context.createGain();
    const gainB = this.context.createGain();

    oscA.type = 'triangle';
    oscB.type = 'triangle';
    oscA.frequency.value = 560;
    oscB.frequency.value = 730;

    gainA.gain.value = 0.22;
    gainB.gain.value = 0.18;

    oscA.connect(gainA);
    oscB.connect(gainB);
    gainA.connect(this.sirenGain);
    gainB.connect(this.sirenGain);

    oscA.start();
    oscB.start();

    this.sirenOscA = oscA;
    this.sirenOscB = oscB;
  }

  private updateMasterGain(): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const now = this.context.currentTime;
    const target = this.enabled && !this.paused ? this.masterVolume * MAX_MASTER_LEVEL : 0;
    this.masterGain.gain.setTargetAtTime(target, now, 0.1);
  }
}
