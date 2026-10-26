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
    state: 'running' as AudioContextState,
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
    resume: vi.fn(async () => undefined),
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

  it('plays a buffer through a newly created source and the analyser', async () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    const buffer = { duration: 1 } as AudioBuffer;

    await player.play(buffer);

    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(sources[0].buffer).toBe(buffer);
    expect(sources[0].connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(context.destination);
    expect(sources[0].start).toHaveBeenCalledTimes(1);
  });

  it('disconnects and releases the source when playback ends', async () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    await player.play({ duration: 1 } as AudioBuffer);
    const source = sources[0];

    source.onended?.call(source as unknown as AudioScheduledSourceNode, new Event('ended'));
    player.stop();

    expect(source.onended).toBeNull();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(source.stop).not.toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
  });

  it('notifies the caller after natural playback cleanup', async () => {
    const { context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    const onEnded = vi.fn();
    await player.play({ duration: 1 } as AudioBuffer, onEnded);

    sources[0].onended?.call(sources[0] as unknown as AudioScheduledSourceNode, new Event('ended'));

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended audio context before starting its source', async () => {
    let finishResume!: () => void;
    const resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResume = resolve;
        }),
    );
    const { context, sources } = createAudioContextMock();
    Object.defineProperty(context, 'state', { value: 'suspended', configurable: true });
    Object.defineProperty(context, 'resume', { value: resume });
    const player = new AudioPlaybackController(context);

    const pendingPlayback = player.play({ duration: 1 } as AudioBuffer);

    expect(resume).toHaveBeenCalledTimes(1);
    expect(context.createBufferSource).not.toHaveBeenCalled();
    finishResume();
    await pendingPlayback;
    expect(sources[0].start).toHaveBeenCalledTimes(1);
  });

  it('stops and disconnects the active source when playback is cancelled', async () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);
    await player.play({ duration: 1 } as AudioBuffer);
    const source = sources[0];

    player.stop();
    player.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.onended).toBeNull();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
  });

  it('cleans up the old source before starting a new track', async () => {
    const { analyser, context, sources } = createAudioContextMock();
    const player = new AudioPlaybackController(context);

    await player.play({ duration: 1 } as AudioBuffer);
    await player.play({ duration: 2 } as AudioBuffer);

    expect(sources).toHaveLength(2);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sources[1].start).toHaveBeenCalledTimes(1);
    expect(analyser.connect).toHaveBeenCalledTimes(2);
  });
});
