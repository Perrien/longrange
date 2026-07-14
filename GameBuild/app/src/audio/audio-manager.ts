// WebAudio playback (task 1.5d) — a trimmed port of BallisticsToolkit steel-sim's
// AudioManager. Loads two bundled/precached clips (report, ping; sourced from
// BTK's MIT assets), plays the muzzle report immediately on every FIRE, and
// schedules the steel ping after the sound-travel delay with distance- and
// energy-scaled volume (see ./audio-model). Misses make no impact sound.
//
// iOS rule: an AudioContext starts suspended and only resumes inside a user
// gesture — so nothing is audible until the first FIRE tap calls `unlock()`.
// Clips are fetched at mount (no gesture, no sound) and decoded on unlock.

import { impactSoundParams } from './audio-model';

// Only two clips: the muzzle report (every shot) and the steel ping (hits only).
// A miss has no impact sound — a bullet into dirt/berm doesn't ring or ricochet
// (owner 2026-07-14), so the ricochet clip was dropped.
type SoundId = 'report' | 'ping';

/** Clip files live in app/public/audio/ → served at `${BASE_URL}audio/*.mp3` and
 * precached by the PWA (vite.config globPatterns includes mp3). */
const SOUND_FILES: Record<SoundId, string> = {
  report: 'audio/report.mp3',
  ping: 'audio/ping.mp3',
};

/** Per-clip loudness normalization (task 1.5d, owner feedback 2026-07-14). BTK's
 * raw clips are mastered at very different levels — measured mean/peak: ping
 * −40/−24 dB (quiet), report −26/0 dB. The ping is boosted to a ≈−30 dB base
 * (peaks stay < 0 dBFS) so it sits just under the report; the distance/energy
 * scaling in audio-model applies on top. Tuning knobs. */
const CLIP_BASE_GAIN: Record<SoundId, number> = {
  report: 0.9, // loudest (muzzle blast at the ear); slight headroom off 0 dBFS
  ping: 3.2, // quiet sample boosted up to the impact reference
};

interface PlayOptions {
  volume?: number;
  delaySeconds?: number;
  playbackRate?: number;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private readonly encoded = new Map<SoundId, ArrayBuffer>();
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private decoded = false;
  private readonly base: string;

  constructor(baseUrl?: string) {
    // Vite's BASE_URL ('./' here) keeps fetches correct under a PWA subpath.
    this.base = baseUrl ?? (import.meta.env?.BASE_URL ?? '/');
  }

  /** Fetch (but do not decode) every clip. Safe at mount — no context, no
   * gesture, no sound. Silently tolerates an offline/precache miss. */
  async preload(): Promise<void> {
    await Promise.all(
      (Object.keys(SOUND_FILES) as SoundId[]).map(async (id) => {
        if (this.encoded.has(id)) return;
        try {
          const res = await fetch(this.base + SOUND_FILES[id]);
          if (res.ok) this.encoded.set(id, await res.arrayBuffer());
        } catch {
          /* offline before precache / fetch blocked — that clip stays silent */
        }
      }),
    );
  }

  /** First-gesture unlock: create + resume the context and decode the clips.
   * Idempotent; must be called from within a user-gesture handler (FIRE tap) so
   * iOS lets the context resume. Returns when audio is ready to play. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    // resume() is kicked off synchronously here (in the gesture) before any await.
    // Recover from ANY non-running state, not just 'suspended': iOS also parks the
    // context as the non-standard 'interrupted' (after a background/phone-call/audio
    // interruption or a long main-thread stall), and a plain 'suspended' check would
    // never revive it. resume() inside the FIRE gesture brings it back to 'running'.
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — playback simply stays silent */
      }
    }
    if (!this.decoded) {
      await Promise.all(
        [...this.encoded].map(async ([id, buf]) => {
          try {
            // slice(0) — decodeAudioData detaches the buffer; keep the original.
            this.buffers.set(id, await this.ctx!.decodeAudioData(buf.slice(0)));
          } catch {
            /* undecodable clip — stays silent */
          }
        }),
      );
      this.decoded = true;
    }
  }

  private play(id: SoundId, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return; // not unlocked yet → silent
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.playbackRate ?? 1;
    const gain = ctx.createGain();
    // Per-clip normalization × the model's distance/energy/miss volume.
    gain.gain.value = (opts.volume ?? 1) * CLIP_BASE_GAIN[id];
    src.connect(gain).connect(ctx.destination);
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    src.start(ctx.currentTime + Math.max(0, opts.delaySeconds ?? 0));
  }

  /** Muzzle report — immediate, full volume (the shooter's own rifle). */
  report(volume = 1): void {
    this.play('report', { volume });
  }

  /** Steel ping on a HIT — delayed by sound travel, scaled by distance + impact
   * energy. Call only for hits; a miss plays no impact sound. */
  ping(
    distanceM: number,
    speedOfSoundMps: number,
    energyJ: number,
    refEnergyJ?: number,
    extraDelaySeconds = 0,
  ): void {
    const p = impactSoundParams(distanceM, speedOfSoundMps, energyJ, refEnergyJ);
    // `extraDelaySeconds` is the bullet's time of flight: the impact sound isn't
    // created until the round arrives, so it precedes the sound-travel delay.
    this.play('ping', {
      volume: p.volume,
      delaySeconds: Math.max(0, extraDelaySeconds) + p.delaySeconds,
      playbackRate: p.playbackRate,
    });
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.buffers.clear();
    this.decoded = false;
  }
}
