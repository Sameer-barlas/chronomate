// Single-instance Web Audio API synthesizer unlocked strictly on user gesture

let sharedAudioCtx: AudioContext | null = null;

function ensureUnlockedAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!sharedAudioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playClockSwitchClick(player: 'p1' | 'p2', enabled: boolean): void {
  if (!enabled) return;
  try {
    const ctx = ensureUnlockedAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(player === 'p1' ? 620 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.038);

      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.042);
    }
  } catch {
    // Ignore audio hardware/permission errors
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {
    // Ignore vibration errors
  }
}

export function playFlagBuzzer(enabled: boolean): void {
  if (!enabled) return;
  try {
    const ctx = ensureUnlockedAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.setValueAtTime(260, now + 0.18);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch {
    // Ignore audio errors
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([70, 40, 120]);
    }
  } catch {
    // Ignore vibration errors
  }
}
