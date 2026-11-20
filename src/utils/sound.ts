class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  tap() {
    this.playTone(540, 0.06, 'triangle', 0.06);
  }

  dice() {
    this.playTone(320, 0.05, 'square', 0.04, 0);
    this.playTone(460, 0.05, 'square', 0.04, 0.06);
    this.playTone(620, 0.08, 'triangle', 0.06, 0.12);
  }

  correct() {
    this.playTone(523.25, 0.12, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.09, 0.09);
    this.playTone(783.99, 0.22, 'triangle', 0.1, 0.18);
  }

  gift() {
    this.playTone(587.33, 0.1, 'sine', 0.08, 0);
    this.playTone(880, 0.14, 'sine', 0.09, 0.08);
    this.playTone(1174.66, 0.24, 'sine', 0.08, 0.16);
  }

  tick() {
    this.playTone(760, 0.04, 'sine', 0.04);
  }

  win() {
    this.playTone(523.25, 0.14, 'triangle', 0.1, 0);
    this.playTone(659.25, 0.14, 'triangle', 0.1, 0.12);
    this.playTone(783.99, 0.14, 'triangle', 0.1, 0.24);
    this.playTone(1046.5, 0.35, 'triangle', 0.12, 0.36);
  }
}

export const soundFx = new SoundEngine();
