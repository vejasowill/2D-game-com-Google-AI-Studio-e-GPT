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
    </main>
  );
}

