/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Game } from './game/Game.ts';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas);
    game.start();

    return () => {
      game.destroy();
    };
  }, []);

  return (
    <main
      id="game-container"
      className="relative w-screen h-screen overflow-hidden bg-neutral-950 select-none flex items-center justify-center"
    >
      <canvas
        id="game-canvas"
        ref={canvasRef}
        className="block w-full h-full"
      />
      <div className="absolute top-3 left-3 pointer-events-none bg-slate-900/85 backdrop-blur-xs border border-slate-700/60 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 shadow-md">
        <div className="font-semibold text-amber-400 mb-0.5">Controles:</div>
        <div>WASD / Setas: Mover</div>
        <div>[E]: Interagir / Sacudir</div>
        <div>[F]: Usar Ferramenta (Cortar)</div>
        <div>1-8 / Clique: Selecionar Slot</div>
      </div>
    </main>
  );
}

