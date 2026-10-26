export class CanvasFrequencyVisualizer {
  private readonly context: CanvasRenderingContext2D;
  private readonly frequencyData: Uint8Array;
  private animationFrameId: number | null = null;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly analyser: AnalyserNode,
    private readonly requestFrame: typeof requestAnimationFrame = requestAnimationFrame,
    private readonly cancelFrame: typeof cancelAnimationFrame = cancelAnimationFrame,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    this.context = context;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleFrame();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId !== null) {
      this.cancelFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private scheduleFrame(): void {
    this.animationFrameId = this.requestFrame(this.drawFrame);
  }

  private readonly drawFrame: FrameRequestCallback = () => {
    if (!this.running) return;

    this.animationFrameId = null;
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = '#53d8fb';

    const barWidth = this.canvas.width / this.frequencyData.length;
    for (let index = 0; index < this.frequencyData.length; index += 1) {
      const barHeight = (this.frequencyData[index] / 255) * this.canvas.height;
      this.context.fillRect(
        index * barWidth,
        this.canvas.height - barHeight,
        Math.max(1, barWidth - 1),
        barHeight,
      );
    }

    this.scheduleFrame();
  };
}
