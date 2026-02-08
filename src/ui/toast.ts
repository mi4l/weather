export class ToastManager {
  constructor(private readonly root: HTMLElement) {}

  show(message: string, durationMs = 2600): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.root.appendChild(toast);

    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, Math.max(200, durationMs - 220));

    window.setTimeout(() => {
      toast.remove();
    }, durationMs);
  }
}
