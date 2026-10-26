import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAudioVisualizerApp } from './app';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function response(value: number) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Uint8Array.of(value).buffer,
  };
}

function rowFor(root: HTMLElement, url: string): HTMLLIElement {
  const row = Array.from(root.querySelectorAll<HTMLLIElement>('.track-item')).find(
    (item) => item.querySelector('.track-url')?.textContent === url,
  );
  if (!row) throw new Error(`No track row for ${url}`);
  return row;
}

function addTrack(root: HTMLElement, url: string): void {
  const input = root.querySelector<HTMLInputElement>('#track-url')!;
  input.value = url;
  root
    .querySelector<HTMLFormElement>('#track-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('audio visualizer app integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps FIFO, reports failed and cancelled tracks, and stops visualization', async () => {
    const root = document.createElement('main');
    document.body.append(root);
    const firstDecode = deferred<AudioBuffer>();
    const requested: string[] = [];
    const fetchAudio = vi.fn(async (url: string) => {
      requested.push(url);
      if (url.endsWith('/failed')) {
        return {
          ok: false,
          status: 503,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      return response(requested.length);
    });
    const decodeAudioData = vi
      .fn()
      .mockImplementationOnce(() => firstDecode.promise)
      .mockResolvedValue({ duration: 4 } as AudioBuffer);
    const analyser = {
      fftSize: 0,
      frequencyBinCount: 256,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn((data: Uint8Array) => data.fill(100)),
    };
    const sources: Array<{
      buffer: AudioBuffer | null;
      onended: ((this: AudioScheduledSourceNode, event: Event) => unknown) | null;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const audioContext = {
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
      decodeAudioData,
    } as unknown as AudioContext;
    const canvasContext = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D,
    );
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelFrame = vi.fn();

    mountAudioVisualizerApp(root, {
      audioContext,
      fetchAudio,
      requestFrame,
      cancelFrame,
    });

    const firstUrl = 'https://audio.example/first';
    const cancelledUrl = 'https://audio.example/cancelled';
    const failedUrl = 'https://audio.example/failed';
    const lastUrl = 'https://audio.example/last';
    addTrack(root, firstUrl);
    addTrack(root, cancelledUrl);
    addTrack(root, failedUrl);
    addTrack(root, lastUrl);

    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
    const cancelledRow = rowFor(root, cancelledUrl);
    cancelledRow.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
    await vi.waitFor(() =>
      expect(cancelledRow.querySelector('.track-status')?.textContent).toBe('Cancelled'),
    );

    firstDecode.resolve({ duration: 3 } as AudioBuffer);
    await vi.waitFor(() =>
      expect(rowFor(root, failedUrl).querySelector('.track-status')?.textContent).toContain(
        'Failed: Audio request failed (503)',
      ),
    );
    await vi.waitFor(() =>
      expect(rowFor(root, lastUrl).querySelector('.track-status')?.textContent).toBe('Ready'),
    );
    expect(requested).toEqual([firstUrl, failedUrl, lastUrl]);

    rowFor(root, lastUrl).querySelector<HTMLButtonElement>('[data-action="play"]')!.click();
    await vi.waitFor(() => expect(requestFrame).toHaveBeenCalledTimes(1));
    frames[0](16);
    root.querySelector<HTMLButtonElement>('#stop-playback')!.click();

    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalledTimes(1);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(1);
    root.remove();
  });
});
