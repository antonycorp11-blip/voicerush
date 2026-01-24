
import { PitchResult } from '../types';

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array = new Float32Array(2048);
  private sampleCache: Map<string, AudioBuffer> = new Map();
  private currentlyPlaying: AudioBufferSourceNode | null = null;

  public async init(): Promise<void> {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended' || (this.audioCtx.state as any) === 'interrupted') {
        await this.audioCtx.resume();
      }
    } catch (e) {
      console.error("Falha ao inicializar AudioContext", e);
    }
  }

  public async preloadSample(url: string): Promise<void> {
    if (this.sampleCache.has(url)) return;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      if (!this.audioCtx) await this.init();
      if (this.audioCtx) {
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.sampleCache.set(url, audioBuffer);
      }
    } catch (err) {
      console.error("Erro ao carregar sample:", url, err);
    }
  }

  public async playSample(url: string, duration: number = 5.0): Promise<void> {
    await this.init();
    if (!this.audioCtx) return;

    if (this.currentlyPlaying) {
      try { this.currentlyPlaying.stop(); } catch (e) { }
    }

    let buffer = this.sampleCache.get(url);
    if (!buffer) {
      await this.preloadSample(url);
      buffer = this.sampleCache.get(url);
    }

    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(2.5, this.audioCtx.currentTime);
    // Sustain for longer to cover the window
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 8.0);

    source.connect(gain);
    gain.connect(this.audioCtx.destination);

    source.start();
    this.currentlyPlaying = source;

    source.onended = () => {
      if (this.currentlyPlaying === source) {
        this.currentlyPlaying = null;
      }
    };
  }

  public async playNoteOscillator(frequency: number, duration: number = 2.5): Promise<void> {
    await this.init();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency * 2, this.audioCtx.currentTime);

    gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(2.2, this.audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }

  public async startMic(): Promise<boolean> {
    try {
      await this.init();

      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      if (!this.audioCtx) return false;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.source.connect(this.analyser);
      return true;
    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
      return false;
    }
  }

  public stopMic(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
  }

  public getPitch(): PitchResult {
    if (!this.analyser || !this.audioCtx) return { pitch: null, clarity: 0 };

    this.analyser.getFloatTimeDomainData(this.buffer as any);

    let rms = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      rms += this.buffer[i] * this.buffer[i];
    }
    rms = Math.sqrt(rms / this.buffer.length);

    // Higher sensitivity threshold to ignore ambient noise
    if (rms < 0.008) return { pitch: null, clarity: 0 };

    let minDiff = Infinity;
    let bestOffset = -1;

    const minOffset = Math.floor(this.audioCtx.sampleRate / 1200);
    const maxOffset = Math.floor(this.audioCtx.sampleRate / 70);

    for (let offset = minOffset; offset < maxOffset; offset++) {
      let diff = 0;
      for (let i = 0; i < this.buffer.length - offset; i++) {
        diff += Math.abs(this.buffer[i] - this.buffer[i + offset]);
      }
      diff = diff / (this.buffer.length - offset);
      if (diff < minDiff) {
        minDiff = diff;
        bestOffset = offset;
      }
    }

    const clarity = 1 - (minDiff / rms);
    // Stricter clarity threshold (0.5) to ensure it's a real voice/note
    if (clarity > 0.5 && bestOffset > 0) {
      const pitch = this.audioCtx.sampleRate / bestOffset;
      return { pitch, clarity };
    }
    return { pitch: null, clarity };
    return { pitch: null, clarity };
  }
}

export const audioEngine = new AudioEngine();
