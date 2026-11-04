// Fullscreen needs a real user activation; the Welcome click and the F key provide it.

export const Fullscreen = {
  get active(): boolean {
    return Boolean(document.fullscreenElement);
  },
  async request(): Promise<boolean> {
    if (document.fullscreenElement) return true;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      return true;
    } catch {
      return false;
    }
  },
  async exit(): Promise<void> {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  },
  async toggle(): Promise<void> {
    if (document.fullscreenElement) await Fullscreen.exit();
    else await Fullscreen.request();
  },
};
