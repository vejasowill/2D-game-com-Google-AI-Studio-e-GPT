import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '../game/Input.ts';

interface MobileControlsProps {
  input: Input | null;
}

export function MobileControls({ input }: MobileControlsProps) {
  // Estado do botão de fullscreen
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Posição visual do thumb do joystick (em pixels de offset relativo ao centro)
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState<boolean>(false);

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  // Monitora alterações de Fullscreen do documento
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFullscreen = Boolean(
        document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement,
      );
      setIsFullscreen(isDocFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Alterna tela cheia com tratamento seguro de erros (não quebra em iframes restritos)
  const handleToggleFullscreen = useCallback(async (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    try {
      const docWithWebkit = document as unknown as {
        webkitFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const docElWithWebkit = document.documentElement as unknown as {
        webkitRequestFullscreen?: () => Promise<void>;
      };

      if (!document.fullscreenElement && !docWithWebkit.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (docElWithWebkit.webkitRequestFullscreen) {
          await docElWithWebkit.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (docWithWebkit.webkitExitFullscreen) {
          await docWithWebkit.webkitExitFullscreen();
        }
      }
    } catch {
      // Falha silenciosa e segura quando bloqueado por permissões de sandbox do browser/iframe
    }
  }, []);

  // =========================================================================
  // JOYSTICK TOUCH HANDLERS (POINTER CAPTURE MULTI-TOUCH)
  // =========================================================================

  const processJoystickMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!joystickRef.current || !input) return;

      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const maxRadius = rect.width / 2 - 12; // Limite interno da borda

      const distance = Math.hypot(deltaX, deltaY);
      const DEADZONE = 4;

      if (distance < DEADZONE) {
        setKnobPos({ x: 0, y: 0 });
        input.resetTouchMovement();
        return;
      }

      // Clamping ao círculo máximo do joystick
      const clampedDist = Math.min(distance, maxRadius);
      const angle = Math.atan2(deltaY, deltaX);

      const knobX = Math.cos(angle) * clampedDist;
      const knobY = Math.sin(angle) * clampedDist;
      setKnobPos({ x: knobX, y: knobY });

      // Normaliza o vetor [0, 1] respeitando 360 graus
      // Movimentos diagonais atingem no máximo magnitude 1.0
      const normalizedMagnitude = clampedDist / maxRadius;
      const vx = Math.cos(angle) * normalizedMagnitude;
      const vy = Math.sin(angle) * normalizedMagnitude;

      input.setTouchMovement(vx, vy);
    },
    [input],
  );

  const handleJoystickPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      activePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Fallback se não suportado
      }
      setIsJoystickActive(true);
      processJoystickMove(e.clientX, e.clientY);
    },
    [processJoystickMove],
  );

  const handleJoystickPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isJoystickActive || activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      processJoystickMove(e.clientX, e.clientY);
    },
    [isJoystickActive, processJoystickMove],
  );

  const handleJoystickPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Fallback
      }

      activePointerIdRef.current = null;
      setIsJoystickActive(false);
      setKnobPos({ x: 0, y: 0 });
      if (input) {
        input.resetTouchMovement();
      }
    },
    [input],
  );

  // =========================================================================
  // BOTÕES DE AÇÃO: INTERACT, USE_ITEM & PLACE
  // =========================================================================

  const handleActionDown = useCallback(
    (action: 'interact' | 'use_item' | 'place', e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!input) return;
      input.triggerActionDown(action);
    },
    [input],
  );

  const handleActionUp = useCallback(
    (action: 'interact' | 'use_item' | 'place', e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!input) return;
      input.triggerActionUp(action);
    },
    [input],
  );

  return (
    <div
      id="mobile-touch-overlay"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-20"
      style={{
        paddingTop: 'env(safe-area-inset-top, 8px)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
        paddingLeft: 'env(safe-area-inset-left, 8px)',
        paddingRight: 'env(safe-area-inset-right, 8px)',
      }}
    >
      {/* 1. BOTÃO DE TELA CHEIA (Canto Superior Direito) */}
      <div className="absolute top-2.5 right-2.5 pointer-events-auto z-30">
        <button
          type="button"
          aria-label={isFullscreen ? 'Sair da Tela Cheia' : 'Entrar em Tela Cheia'}
          onPointerDown={handleToggleFullscreen}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900/85 hover:bg-slate-800 active:bg-slate-700 border border-slate-700/70 text-slate-300 active:text-white shadow-lg text-xs font-mono touch-manipulation cursor-pointer transition-colors"
        >
          <span className="text-sm font-bold leading-none">{isFullscreen ? '🗗' : '⛶'}</span>
          <span className="text-[10px] uppercase tracking-wider">{isFullscreen ? 'Sair' : 'Tela Cheia'}</span>
        </button>
      </div>

      {/* 2. JOYSTICK VIRTUAL DE MOVIMENTO (Canto Inferior Esquerdo) */}
      <div
        className="absolute bottom-4 left-4 pointer-events-auto touch-none select-none z-30"
        style={{ width: '130px', height: '130px' }}
      >
        <div
          ref={joystickRef}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          className={`relative w-full h-full rounded-full border-2 transition-colors flex items-center justify-center ${
            isJoystickActive
              ? 'bg-slate-900/75 border-sky-400/80 shadow-[0_0_15px_rgba(56,189,248,0.25)]'
              : 'bg-slate-950/60 border-slate-700/60'
          }`}
        >
          {/* Eixos direcionais sutis de referência */}
          <div className="absolute w-[1px] h-3/4 bg-slate-700/30 pointer-events-none" />
          <div className="absolute h-[1px] w-3/4 bg-slate-700/30 pointer-events-none" />

          {/* Rótulo de função claro e minimalista */}
          <span className="absolute bottom-2 text-[9px] font-mono tracking-widest text-slate-400/60 pointer-events-none uppercase">
            Mover
          </span>

          {/* Thumb / Manete analógica móvel */}
          <div
            className={`absolute w-12 h-12 rounded-full border shadow-md flex items-center justify-center pointer-events-none transition-transform duration-75 ${
              isJoystickActive
                ? 'bg-sky-500/90 border-sky-200 text-white shadow-sky-500/50 scale-105'
                : 'bg-slate-300/80 border-white/80 text-slate-800'
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          >
            <div className="w-4 h-4 rounded-full bg-white/40" />
          </div>
        </div>
      </div>

      {/* 3. BOTÕES DE AÇÃO SEPARADOS: PLACE, INTERACT & USE ITEM (Lado Direito Inferior) */}
      <div className="absolute bottom-4 right-4 pointer-events-auto touch-none select-none z-30 flex items-end gap-3">
        {/* BOTÃO PLACE (Colocação do bloco associado ao item equipado no tile selecionado) */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label="Colocar Bloco"
            onPointerDown={(e) => handleActionDown('place', e)}
            onPointerUp={(e) => handleActionUp('place', e)}
            onPointerCancel={(e) => handleActionUp('place', e)}
            className="w-13 h-13 rounded-full bg-indigo-950/80 hover:bg-indigo-900/90 active:bg-indigo-700 active:scale-95 border-2 border-indigo-500/80 active:border-indigo-300 text-indigo-200 active:text-white shadow-lg flex flex-col items-center justify-center touch-manipulation cursor-pointer transition-all"
          >
            <span className="text-base font-black leading-none">Q</span>
            <span className="text-[8px] font-mono tracking-tighter uppercase mt-0.5">Bloco</span>
          </button>
          <span className="text-[9px] font-mono text-indigo-400/80 mt-1 uppercase tracking-wider font-semibold">
            Colocar
          </span>
        </div>

        {/* BOTÃO INTERACT (Interação genérica de mundo: Sacudir árvore, Coletar drop) */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label="Interagir"
            onPointerDown={(e) => handleActionDown('interact', e)}
            onPointerUp={(e) => handleActionUp('interact', e)}
            onPointerCancel={(e) => handleActionUp('interact', e)}
            className="w-14 h-14 rounded-full bg-emerald-950/80 hover:bg-emerald-900/90 active:bg-emerald-700 active:scale-95 border-2 border-emerald-500/80 active:border-emerald-300 text-emerald-200 active:text-white shadow-lg flex flex-col items-center justify-center touch-manipulation cursor-pointer transition-all"
          >
            <span className="text-base font-black leading-none">E</span>
            <span className="text-[8px] font-mono tracking-tighter uppercase mt-0.5">Ação</span>
          </button>
          <span className="text-[9px] font-mono text-emerald-400/80 mt-1 uppercase tracking-wider font-semibold">
            Interagir
          </span>
        </div>

        {/* BOTÃO USE ITEM / TOOL (Uso do item ou ferramenta equipada: Cortar com Machado) */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label="Usar Ferramenta"
            onPointerDown={(e) => handleActionDown('use_item', e)}
            onPointerUp={(e) => handleActionUp('use_item', e)}
            onPointerCancel={(e) => handleActionUp('use_item', e)}
            className="w-16 h-16 rounded-full bg-amber-950/85 hover:bg-amber-900/90 active:bg-amber-700 active:scale-95 border-2 border-amber-500/90 active:border-amber-300 text-amber-200 active:text-white shadow-xl flex flex-col items-center justify-center touch-manipulation cursor-pointer transition-all"
          >
            <span className="text-lg font-black leading-none">F</span>
            <span className="text-[9px] font-mono tracking-tighter uppercase mt-0.5">Usar</span>
          </button>
          <span className="text-[9px] font-mono text-amber-400/90 mt-1 uppercase tracking-wider font-semibold">
            Ferramenta
          </span>
        </div>
      </div>
    </div>
  );
}
