export interface AudioQueue {
  enqueue(url: string, signal?: AbortSignal): Promise<AudioBuffer>;
}
