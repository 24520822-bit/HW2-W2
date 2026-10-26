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
});
