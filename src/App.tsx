/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game.ts';
import { Input } from './game/Input.ts';
import { MobileControls } from './ui/MobileControls.tsx';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inputInstance, setInputInstance] = useState<Input | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas);
    setInputInstance(game.getInput());
    game.start();

    return () => {
      setInputInstance(null);
      game.destroy();
    };
  }, []);

  return (
    <main
      id="game-container"
      className="relative w-screen h-screen overflow-hidden bg-neutral-950 select-none flex items-center justify-center touch-none"
    >
      <canvas
        id="game-canvas"
        ref={canvasRef}
        className="block w-full h-full touch-none"
      />

      {/* Camada de Controles Móveis (Joystick, Interact, Use Item, Fullscreen) */}
      <MobileControls input={inputInstance} />

      {/* Dica de atalhos de teclado (discreta no topo esquerdo para desktop) */}
      <div className="absolute top-2.5 left-2.5 pointer-events-none bg-slate-900/80 backdrop-blur-xs border border-slate-700/60 rounded px-2 py-1 text-[10px] font-mono text-slate-300 shadow-md hidden md:block z-10">
        <div className="font-semibold text-amber-400 mb-0.5">Controles PC:</div>
        <div>WASD / Setas: Mover</div>
        <div>[E]: Interagir | [F]: Ferramenta</div>
        <div>1-8 / Toque: Hotbar</div>
      </div>
    </main>
  );
}

