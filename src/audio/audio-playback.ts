export const FFT_SIZE = 512;

export class AudioPlaybackController {
  readonly analyser: AnalyserNode;
  private activeSource: AudioBufferSourceNode | null = null;
  private playRequest = 0;

  constructor(private readonly context: AudioContext) {
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
  }

  async play(buffer: AudioBuffer, onEnded?: () => void): Promise<void> {
    const request = ++this.playRequest;
    this.stopActiveSource();
    if (this.context.state === 'suspended') await this.context.resume();
    if (request !== this.playRequest) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    this.activeSource = source;
    source.onended = () => {
      if (this.activeSource !== source) return;
      this.finish(source);
      onEnded?.();
    };

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
    this.playRequest += 1;
    this.stopActiveSource();
  }

  private stopActiveSource(): void {
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
