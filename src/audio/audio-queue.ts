import type { AudioQueue } from './contracts';

interface AudioFetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface AudioQueueDependencies {
  fetchAudio?: (url: string, signal?: AbortSignal) => Promise<AudioFetchResponse>;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

interface QueueItem {
  url: string;
  signal?: AbortSignal;
  resolve(buffer: AudioBuffer): void;
  reject(error: unknown): void;
}

export class AudioTaskQueue implements AudioQueue {
  private readonly items: QueueItem[] = [];
  private processing = false;
  private readonly fetchAudio: NonNullable<AudioQueueDependencies['fetchAudio']>;

  constructor(private readonly dependencies: AudioQueueDependencies) {
    this.fetchAudio =
      dependencies.fetchAudio ??
      ((url, signal) => fetch(url, { signal }));
  }

  enqueue(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
    return new Promise<AudioBuffer>((resolve, reject) => {
      this.items.push({ url, signal, resolve, reject });
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.items.length > 0) {
        const item = this.items.shift()!;
        try {
          const response = await this.fetchAudio(item.url, item.signal);
          if (!response.ok) {
            throw new Error(`Audio request failed (${response.status}) for ${item.url}`);
          }
          const data = await response.arrayBuffer();
          const buffer = await this.dependencies.decodeAudioData(data);
          item.resolve(buffer);
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.processing = false;
      if (this.items.length > 0) void this.processQueue();
    }
  }
}
