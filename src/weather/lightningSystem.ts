export interface LightningCallbacks {
  onFlash: (durationSeconds: number) => void;
  onThunder: (strength: number) => void;
}

interface PendingThunder {
  delay: number;
  strength: number;
}

export class LightningSystem {
  private flashCooldown = 3;
  private pending: PendingThunder[] = [];

  update(dt: number, enabled: boolean, intensity: number, callbacks: LightningCallbacks): void {
    if (!enabled || intensity <= 0.01) {
      this.pending.length = 0;
      this.flashCooldown = Math.min(this.flashCooldown, 2.2);
      return;
    }

    const intensityClamped = Math.max(0, Math.min(1, intensity));

    this.flashCooldown -= dt;
    if (this.flashCooldown <= 0) {
      this.flashCooldown = 1.5 + Math.random() * (8 - intensityClamped * 5.5);

      const flashDuration = 0.1 + Math.random() * 0.15;
      const thunderDelay = 0.2 + Math.random() * 1.8;
      const strength = 0.5 + Math.random() * 0.5 * intensityClamped;

      callbacks.onFlash(flashDuration);
      this.pending.push({ delay: thunderDelay, strength });
    }

    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const entry = this.pending[i];
      entry.delay -= dt;
      if (entry.delay <= 0) {
        callbacks.onThunder(entry.strength);
        this.pending.splice(i, 1);
      }
    }
  }

  triggerNow(callbacks: LightningCallbacks): void {
    const flashDuration = 0.1 + Math.random() * 0.15;
    callbacks.onFlash(flashDuration);
    this.pending.push({
      delay: 0.2 + Math.random() * 0.8,
      strength: 0.72 + Math.random() * 0.28
    });
  }
}
