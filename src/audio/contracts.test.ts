import { describe, expect, it } from 'vitest';
import type { AudioQueue } from './contracts';

describe('AudioQueue contract', () => {
  it('accepts a URL and optional abort signal and returns an AudioBuffer promise', () => {
    const queue: AudioQueue = {
      enqueue: async (_url: string, _signal?: AbortSignal): Promise<AudioBuffer> =>
        Promise.resolve({} as AudioBuffer),
    };

    expect(typeof queue.enqueue).toBe('function');
  });
});
