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
  cancelled: boolean;
  settled: boolean;
  abortListener?: () => void;
  resolve(buffer: AudioBuffer): void;
  reject(error: unknown): void;
}

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
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
    if (signal?.aborted) return Promise.reject(createAbortError());

    return new Promise<AudioBuffer>((resolve, reject) => {
      const item: QueueItem = {
        url,
        signal,
        cancelled: false,
        settled: false,
        resolve: (buffer) => {
          if (item.settled || item.cancelled) return;
          item.settled = true;
          resolve(buffer);
        },
        reject: (error) => {
          if (item.settled) return;
          item.settled = true;
          reject(error);
        },
      };
      item.abortListener = () => {
        item.cancelled = true;
        item.reject(createAbortError());
      };
      signal?.addEventListener('abort', item.abortListener, { once: true });
      if (signal?.aborted) {
        item.abortListener();
        return;
      }
      this.items.push(item);
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.items.length > 0) {
        const item = this.items.shift()!;
        if (item.cancelled || item.signal?.aborted) {
          item.cancelled = true;
          item.reject(createAbortError());
          this.removeAbortListener(item);
          continue;
        }
        try {
          const response = await this.fetchAudio(item.url, item.signal);
          if (!response.ok) {
            throw new Error(`Audio request failed (${response.status}) for ${item.url}`);
          }
          const data = await response.arrayBuffer();
          const buffer = await this.dependencies.decodeAudioData(data);
          if (!item.cancelled) item.resolve(buffer);
        } catch (error) {
          item.reject(error);
        } finally {
          this.removeAbortListener(item);
        }
      }
    } finally {
      this.processing = false;
      if (this.items.length > 0) void this.processQueue();
    }
  }

  private removeAbortListener(item: QueueItem): void {
    if (item.abortListener) {
      item.signal?.removeEventListener('abort', item.abortListener);
      item.abortListener = undefined;
    }
  }
}
