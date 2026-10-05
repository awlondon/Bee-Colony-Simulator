import { Game } from './game/Game';

declare global {
  interface Window {
    __game?: Game;
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

try {
  const game = new Game(canvas, hudRoot);
  window.__game = game; // handy for debugging and the end-to-end tests
  game.start();
} catch (err) {
  console.error(err);
  hudRoot.innerHTML = `<div class="fatal show">Bee Colony Simulator could not start.<br/>${
    err instanceof Error ? err.message : String(err)
  }<br/>WebGL is required.</div>`;
}
