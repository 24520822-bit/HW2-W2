# HW 2: Concurrent FIFO Audio Visualizer Queue Engine

A small browser app that queues audio URLs, fetches and decodes tracks in FIFO order, plays decoded buffers through the Web Audio API, and draws live frequency data on a Canvas.

## Requirements

- Node.js 22.12+ or 24+
- A modern browser with Web Audio API, Canvas 2D, and `requestAnimationFrame`
- Audio URLs must be reachable by the browser. Cross-origin servers need to allow CORS.

## Run locally

```sh
npm install
npm run dev
```

Paste an absolute audio URL and select **Add track**. Tracks are fetched and decoded in queue order. Select **Play** on a ready track to start playback and the visualizer. **Stop playback** stops and disconnects the active source and cancels the visualizer frame.

## Development checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Vitest runs unit and integration tests in jsdom. ESLint checks JavaScript and TypeScript; the build also performs TypeScript's project build.

## Audio queue contract

`AudioQueue.enqueue(url, signal?)` accepts a track URL and optional `AbortSignal`, returning a `Promise<AudioBuffer>`. `AudioTaskQueue` processes one item at a time: the next fetch starts only after the current URL has been fetched and decoded. HTTP, network, and decode failures reject only the relevant promise; later items continue.

```ts
const abort = new AbortController();
const buffer = await queue.enqueue(trackUrl, abort.signal);
```

Aborting a queued item prevents its fetch from starting. Aborting during fetch passes the signal to `fetch`, cancelling the request. `decodeAudioData` itself is not abortable: cancelling during decode rejects the caller, suppresses the decoded result, and allows the queue to continue after decoding settles.

## Web Audio and visualization

Playback connects a fresh `AudioBufferSourceNode` to an `AnalyserNode` and then to the audio destination. Sources are stopped when replaced or stopped by the user, and disconnected on stop or natural end. A source is never restarted.

The analyzer uses `fftSize = 512`. Web Audio defines `frequencyBinCount` as half the FFT size, so the visualizer receives 256 frequency bins. Canvas drawing runs directly from `requestAnimationFrame`, reuses one `Uint8Array`, and does not update UI state per frame. RAF targets the browser's display cadence (typically 60 Hz); actual frame rate depends on the device and browser.

## GitHub contribution workflow

1. Create a focused branch from `main` for the change.
2. Add or update tests, then run the development checks above.
3. Commit the change with a clear conventional commit message.
4. Open a pull request against `main` and include a concise summary and test results.
