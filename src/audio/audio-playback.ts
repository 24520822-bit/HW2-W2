export const FFT_SIZE = 512;

export class AudioPlaybackController {
  readonly analyser: AnalyserNode;
  private activeSource: AudioBufferSourceNode | null = null;

  constructor(private readonly context: AudioContext) {
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
  }

  play(buffer: AudioBuffer): void {
    this.stop();

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    this.activeSource = source;
    source.onended = () => this.finish(source);

    try {
      this.analyser.connect(this.context.destination);
      source.connect(this.analyser);
      source.start();
    } catch (error) {
      this.finish(source);
      throw error;
    }
  }

  stop(): void {
    const source = this.activeSource;
    if (!source) return;

    this.activeSource = null;
    source.onended = null;
    try {
      source.stop();
    } finally {
      source.disconnect();
      this.analyser.disconnect();
    }
  }

  private finish(source: AudioBufferSourceNode): void {
    if (this.activeSource !== source) return;

    this.activeSource = null;
    source.onended = null;
    source.disconnect();
    this.analyser.disconnect();
  }
}
