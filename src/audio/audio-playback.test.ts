import { describe, expect, it, vi } from 'vitest';
import { AudioPlaybackController, FFT_SIZE } from './audio-playback';

function createAudioContextMock() {
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 256,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const sources: Array<{
    buffer: AudioBuffer | null;
    onended: ((this: AudioScheduledSourceNode, event: Event) => unknown) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const context = {
    destination: {},
    createAnalyser: vi.fn(() => analyser),
    createBufferSource: vi.fn(() => {
      const source = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    }),
  };

  return {
    analyser,
    context: context as unknown as AudioContext,
    sources,
  };
}

describe('AudioPlaybackController', () => {
  it('configures a 512-point FFT with 256 frequency bins', () => {
    const { analyser, context } = createAudioContextMock();
    const player = new AudioPlaybackController(context);

    expect(FFT_SIZE).toBe(512);
    expect(analyser.fftSize).toBe(512);
    expect(player.analyser.frequencyBinCount).toBe(256);
  });

  it('plays a buffer through a newly created source and the analyser', () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    const buffer = { duration: 1 } as AudioBuffer;

    player.play(buffer);

    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(sources[0].buffer).toBe(buffer);
    expect(sources[0].connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(context.destination);
    expect(sources[0].start).toHaveBeenCalledTimes(1);
  });

  it('disconnects and releases the source when playback ends', () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    player.play({ duration: 1 } as AudioBuffer);
    const source = sources[0];

    source.onended?.call(source as unknown as AudioScheduledSourceNode, new Event('ended'));
    player.stop();

    expect(source.onended).toBeNull();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(source.stop).not.toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
  });

  it('stops and disconnects the active source when playback is cancelled', () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    player.play({ duration: 1 } as AudioBuffer);
    const source = sources[0];

    player.stop();
    player.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.onended).toBeNull();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
  });

  it('cleans up the old source before starting a new track', () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);

    player.play({ duration: 1 } as AudioBuffer);
    player.play({ duration: 2 } as AudioBuffer);

    expect(sources).toHaveLength(2);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sources[1].start).toHaveBeenCalledTimes(1);
    expect(analyser.connect).toHaveBeenCalledTimes(2);
  });
});
