import { boot } from './app/game';
import './style.css';

const canvas = document.getElementById('scene-canvas');
const uiRoot = document.getElementById('ui-root');
const toastRoot = document.getElementById('toast-root');

if (!(canvas instanceof HTMLCanvasElement) || !uiRoot || !toastRoot) {
  throw new Error('App root elements are missing.');
}

boot(canvas, uiRoot, toastRoot);
