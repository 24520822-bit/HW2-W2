import { describe, expect, it, vi } from 'vitest';
import { CanvasFrequencyVisualizer } from './canvas-visualizer';

function createVisualizerHarness() {
  const callbacks: FrameRequestCallback[] = [];
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  };
  const canvas = {
    width: 400,
    height: 200,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  const analyser = {
    frequencyBinCount: 4,
    getByteFrequencyData: vi.fn((data: Uint8Array) => data.fill(128)),
  } as unknown as AnalyserNode;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const cancelFrame = vi.fn();
  const visualizer = new CanvasFrequencyVisualizer(
    canvas,
    analyser,
    requestFrame,
    cancelFrame,
  );

  return { analyser, callbacks, cancelFrame, context, requestFrame, visualizer };
}

describe('CanvasFrequencyVisualizer', () => {
  it('uses one RAF loop and renders analyser frequency data', () => {
    const { analyser, callbacks, context, requestFrame, visualizer } =
      createVisualizerHarness();

    visualizer.start();
    visualizer.start();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    callbacks[0](16);

    expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(1);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 200);
    expect(context.fillRect).toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('reuses one frequency-data array across animation frames', () => {
    const { analyser, callbacks, visualizer } = createVisualizerHarness();
    visualizer.start();

    callbacks[0](16);
    callbacks[1](32);

    const frequencyData = vi.mocked(analyser.getByteFrequencyData).mock.calls;
    expect(frequencyData[0][0]).toBe(frequencyData[1][0]);
  });

  it('cancels the pending frame and draws nothing after stop', () => {
    const { analyser, callbacks, cancelFrame, context, requestFrame, visualizer } =
      createVisualizerHarness();
    visualizer.start();
    const pendingFrame = callbacks[0];

    visualizer.stop();
    pendingFrame(16);

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(analyser.getByteFrequencyData).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });
});
