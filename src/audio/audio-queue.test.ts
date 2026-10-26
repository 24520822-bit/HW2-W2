import { describe, expect, it, vi } from 'vitest';
import { AudioTaskQueue } from './audio-queue';

function bufferResponse(value: number) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Uint8Array.of(value).buffer,
  };
}

describe('AudioTaskQueue', () => {
  it('fetches and decodes concurrent enqueues in FIFO order', async () => {
    const events: string[] = [];
    const fetchAudio = vi.fn(async (url: string) => {
      events.push(`fetch:${url}`);
      return bufferResponse(url === 'first' ? 1 : 2);
    });
    const decodeAudioData = vi.fn(async (data: ArrayBuffer) => {
      events.push(`decode:${new Uint8Array(data)[0]}`);
      return { duration: 1 } as AudioBuffer;
    });
    const queue = new AudioTaskQueue({ fetchAudio, decodeAudioData });

    await Promise.all([queue.enqueue('first'), queue.enqueue('second')]);

    expect(events).toEqual([
      'fetch:first',
      'decode:1',
      'fetch:second',
      'decode:2',
    ]);
  });

  it('rejects a failed item and continues with the next item', async () => {
    const fetchAudio = vi.fn(async (url: string) => {
      if (url === 'broken') throw new Error('network failed');
      return bufferResponse(2);
    });
    const decodeAudioData = vi.fn(async () => ({ duration: 1 }) as AudioBuffer);
    const queue = new AudioTaskQueue({ fetchAudio, decodeAudioData });
    const failed = queue.enqueue('broken');
    const following = queue.enqueue('working');

    await expect(failed).rejects.toThrow('network failed');
    await expect(following).resolves.toMatchObject({ duration: 1 });
    expect(fetchAudio).toHaveBeenCalledTimes(2);
  });

  it('skips a queued item cancelled before its turn', async () => {
    let releaseDecode!: (buffer: AudioBuffer) => void;
    const firstDecode = new Promise<AudioBuffer>((resolve) => {
      releaseDecode = resolve;
    });
    const fetchAudio = vi.fn(async (url: string) => bufferResponse(url === 'first' ? 1 : 2));
    const decodeAudioData = vi
      .fn()
      .mockImplementationOnce(() => firstDecode)
      .mockResolvedValue({ duration: 1 } as AudioBuffer);
    const queue = new AudioTaskQueue({ fetchAudio, decodeAudioData });
    const first = queue.enqueue('first');
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const cancelled = queue.enqueue('cancelled', controller.signal);
    const last = queue.enqueue('last');

    controller.abort();
    releaseDecode({ duration: 1 } as AudioBuffer);
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.all([first, last]);

    expect(fetchAudio.mock.calls.map(([url]) => url)).toEqual(['first', 'last']);
  });

  it('aborts the active fetch when its signal is aborted', async () => {
    const fetchAudio = vi.fn((url: string, signal?: AbortSignal) => {
      if (url !== 'active') return Promise.resolve(bufferResponse(2));
      return new Promise<ReturnType<typeof bufferResponse>>((_, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      });
    });
    const decodeAudioData = vi.fn(async () => ({ duration: 1 }) as AudioBuffer);
    const queue = new AudioTaskQueue({ fetchAudio, decodeAudioData });
    const controller = new AbortController();
    const active = queue.enqueue('active', controller.signal);
    const following = queue.enqueue('following');

    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await expect(following).resolves.toMatchObject({ duration: 1 });
    expect(fetchAudio.mock.calls.map(([url]) => url)).toEqual(['active', 'following']);
  });

  it('does not resolve a cancelled decode and waits for it before continuing', async () => {
    let finishDecode!: (buffer: AudioBuffer) => void;
    const decodeInProgress = new Promise<AudioBuffer>((resolve) => {
      finishDecode = resolve;
    });
    const fetchAudio = vi.fn(async () => bufferResponse(1));
    const decodeAudioData = vi
      .fn()
      .mockImplementationOnce(() => decodeInProgress)
      .mockResolvedValue({ duration: 2 } as AudioBuffer);
    const queue = new AudioTaskQueue({ fetchAudio, decodeAudioData });
    const controller = new AbortController();
    const cancelled = queue.enqueue('decoding', controller.signal);
    const following = queue.enqueue('following');

    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(fetchAudio).toHaveBeenCalledTimes(1);

    finishDecode({ duration: 1 } as AudioBuffer);
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await expect(following).resolves.toMatchObject({ duration: 2 });
    expect(fetchAudio).toHaveBeenCalledTimes(2);
  });
});
