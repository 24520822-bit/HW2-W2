import { AudioTaskQueue, type AudioQueueDependencies } from './audio/audio-queue';
import { AudioPlaybackController } from './audio/audio-playback';
import { CanvasFrequencyVisualizer } from './audio/canvas-visualizer';

export interface AudioVisualizerAppOptions {
  audioContext?: AudioContext;
  fetchAudio?: AudioQueueDependencies['fetchAudio'];
  requestFrame?: typeof requestAnimationFrame;
  cancelFrame?: typeof cancelAnimationFrame;
}

type TrackState = 'queued' | 'ready' | 'starting' | 'playing' | 'failed' | 'cancelled';

interface Track {
  id: number;
  url: string;
  state: TrackState;
  controller: AbortController;
  buffer: AudioBuffer | null;
  row: HTMLLIElement;
}

function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unknown audio error';
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export function mountAudioVisualizerApp(
  root: HTMLElement,
  options: AudioVisualizerAppOptions = {},
): void {
  root.innerHTML = `
    <main class="app-shell">
      <header class="hero">
        <p class="eyebrow">WEB AUDIO · FIFO QUEUE</p>
        <h1>Audio <span>Visualizer</span></h1>
        <p class="intro">Queue tracks, decode them in order, and watch the frequencies move.</p>
      </header>
      <section class="panel" aria-labelledby="queue-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">YOUR SESSION</p>
            <h2 id="queue-heading">Track queue</h2>
          </div>
          <span class="fft-badge">FFT 512 <i>·</i> 256 bins</span>
        </div>
        <form id="track-form" class="queue-form">
          <label class="visually-hidden" for="track-url">Audio track URL</label>
          <input id="track-url" name="url" type="url" placeholder="https://example.com/track.mp3" required />
          <button class="primary-button" type="submit">Add track <span aria-hidden="true">＋</span></button>
        </form>
        <p id="app-message" class="message" role="status" aria-live="polite">Ready for your first track.</p>
        <ul id="track-list" class="track-list" aria-label="Queued tracks"></ul>
      </section>
      <section class="panel visual-panel" aria-labelledby="visualizer-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">LIVE FREQUENCY RESPONSE</p>
            <h2 id="visualizer-heading">Visualizer</h2>
          </div>
          <button id="stop-playback" class="secondary-button" type="button">Stop playback</button>
        </div>
        <canvas id="frequency-canvas" width="960" height="240" aria-label="Audio frequency visualization"></canvas>
        <div class="canvas-axis" aria-hidden="true"><span>LOW</span><span>FREQUENCY</span><span>HIGH</span></div>
      </section>
      <footer>Audio is processed in your browser. Playback starts when you choose a ready track.</footer>
    </main>
  `;

  const audioContext = options.audioContext ?? new AudioContext();
  const playback = new AudioPlaybackController(audioContext);
  const queue = new AudioTaskQueue({
    fetchAudio: options.fetchAudio,
    decodeAudioData: (data) => audioContext.decodeAudioData(data),
  });
  const canvas = root.querySelector<HTMLCanvasElement>('#frequency-canvas')!;
  const visualizer = new CanvasFrequencyVisualizer(
    canvas,
    playback.analyser,
    options.requestFrame,
    options.cancelFrame,
  );
  const form = root.querySelector<HTMLFormElement>('#track-form')!;
  const input = root.querySelector<HTMLInputElement>('#track-url')!;
  const list = root.querySelector<HTMLUListElement>('#track-list')!;
  const message = root.querySelector<HTMLParagraphElement>('#app-message')!;
  const tracks = new Map<number, Track>();
  let nextTrackId = 1;
  let playingTrack: Track | null = null;

  const updateTrack = (track: Track, text: string): void => {
    track.row.dataset.state = track.state;
    track.row.querySelector<HTMLElement>('.track-status')!.textContent = text;
    track.row.querySelector<HTMLButtonElement>('[data-action="play"]')!.disabled =
      track.state !== 'ready';
    track.row.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.disabled =
      track.state !== 'queued';
  };

  const addTrack = (url: string): void => {
    const id = nextTrackId++;
    const row = document.createElement('li');
    row.className = 'track-item';
    row.innerHTML = `
      <div class="track-copy">
        <span class="track-url"></span>
        <span class="track-status" role="status">Queued</span>
      </div>
      <div class="track-actions">
        <button class="text-button" type="button" data-action="cancel">Cancel</button>
        <button class="play-button" type="button" data-action="play" disabled>Play</button>
      </div>
    `;
    row.querySelector<HTMLElement>('.track-url')!.textContent = url;
    const track: Track = {
      id,
      url,
      state: 'queued',
      controller: new AbortController(),
      buffer: null,
      row,
    };
    tracks.set(id, track);
    row.dataset.trackId = String(id);
    list.append(row);
    message.textContent = `Queued ${url}`;

    void queue.enqueue(url, track.controller.signal).then(
      (buffer) => {
        if (track.state !== 'queued') return;
        track.buffer = buffer;
        track.state = 'ready';
        updateTrack(track, 'Ready');
        message.textContent = `Ready to play: ${url}`;
      },
      (error: unknown) => {
        if (isAbortError(error)) {
          track.state = 'cancelled';
          updateTrack(track, 'Cancelled');
          message.textContent = `Cancelled ${url}`;
          return;
        }
        track.state = 'failed';
        const detail = errorMessage(error);
        updateTrack(track, `Failed: ${detail}`);
        message.textContent = `Could not load ${url}: ${detail}`;
      },
    );
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = input.value.trim();
    try {
      new URL(url);
    } catch {
      message.textContent = 'Enter a valid absolute audio URL.';
      input.focus();
      return;
    }
    addTrack(url);
    input.value = '';
    input.focus();
  });

  list.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const row = event.target.closest<HTMLLIElement>('.track-item');
    const track = row ? tracks.get(Number(row.dataset.trackId)) : undefined;
    if (!track) return;

    if (event.target.dataset.action === 'cancel' && track.state === 'queued') {
      track.controller.abort();
      return;
    }
    if (event.target.dataset.action !== 'play' || !track.buffer) return;

    if (playingTrack && playingTrack !== track) {
      playingTrack.state = 'ready';
      updateTrack(playingTrack, 'Ready');
    }
    const buffer = track.buffer;
    playingTrack = track;
    track.state = 'starting';
    updateTrack(track, 'Starting playback…');
    void playback
      .play(buffer, () => {
        if (playingTrack !== track) return;
        playingTrack = null;
        track.state = 'ready';
        updateTrack(track, 'Ready');
        visualizer.stop();
      })
      .then(() => {
        if (playingTrack !== track) return;
        track.state = 'playing';
        updateTrack(track, 'Playing');
        visualizer.start();
        message.textContent = `Playing ${track.url}`;
      })
      .catch((error: unknown) => {
        if (playingTrack !== track) return;
        playingTrack = null;
        track.state = 'ready';
        updateTrack(track, `Playback failed: ${errorMessage(error)}`);
        message.textContent = `Playback failed: ${errorMessage(error)}`;
        visualizer.stop();
      });
  });

  root.querySelector<HTMLButtonElement>('#stop-playback')!.addEventListener('click', () => {
    try {
      playback.stop();
    } catch (error) {
      message.textContent = `Could not stop playback: ${errorMessage(error)}`;
    } finally {
      visualizer.stop();
      if (playingTrack) {
        playingTrack.state = 'ready';
        updateTrack(playingTrack, 'Ready');
        playingTrack = null;
      }
    }
  });
}
