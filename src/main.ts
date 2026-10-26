import './style.css';
import { mountAudioVisualizerApp } from './app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root element is missing');

if (typeof AudioContext === 'undefined') {
  root.textContent = 'This browser does not support the Web Audio API.';
} else {
  mountAudioVisualizerApp(root);
}
