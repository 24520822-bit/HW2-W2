import { describe, expect, it } from 'vitest';
import type { AudioQueue } from './contracts';

describe('AudioQueue contract', () => {
  it('accepts a URL and optional abort signal and returns an AudioBuffer promise', async () => {
    const url = 'https://audio.example/track.mp3';
    const controller = new AbortController();
    const buffer = {} as AudioBuffer;
    const queue: AudioQueue = {
      enqueue: async (trackUrl, signal) => {
        expect(trackUrl).toBe(url);
        expect(signal).toBe(controller.signal);
        return buffer;
      },
    };

    await expect(queue.enqueue(url, controller.signal)).resolves.toBe(buffer);
  });
});
