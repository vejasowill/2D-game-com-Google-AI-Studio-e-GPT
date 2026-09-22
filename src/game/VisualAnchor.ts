import { WorldCoord } from './types.ts';

/**
 * Ponto de ancoragem relativo [0.0 a 1.0] para alinhamento entre o asset visual e a base física.
 *
 * Exemplos típicos:
 * - Personagens, NPCs, Animais: Âncora na base dos pés (anchorX = 0.5, anchorY = 1.0)
 * - Vegetação (Árvores): Âncora na base do tronco (anchorX = 0.5, anchorY = 1.0)
 * - Objetos de chão: Âncora na base inferior (anchorX = 0.5, anchorY = 1.0)
 * - Projéteis e efeitos: Âncora centralizada (anchorX = 0.5, anchorY = 0.5)
 */
export interface VisualAnchor {
  readonly anchorX: number;
  readonly anchorY: number;
}

/** Ponto de ancoragem na linha de base inferior centralizada (pés / base do tronco no solo) */
export const ANCHOR_FEET: VisualAnchor = { anchorX: 0.5, anchorY: 1.0 };
export const ANCHOR_BOTTOM_CENTER: VisualAnchor = { anchorX: 0.5, anchorY: 1.0 };

/** Ponto de ancoragem centralizado geometricamente */
export const ANCHOR_CENTER: VisualAnchor = { anchorX: 0.5, anchorY: 0.5 };

/** Ponto de ancoragem no canto superior esquerdo */
export const ANCHOR_TOP_LEFT: VisualAnchor = { anchorX: 0.0, anchorY: 0.0 };

/**
 * Configuração genérica de dimensões visuais, escala e ponto de ancoragem para qualquer entidade do jogo.
 * A representação visual é 100% desacoplada das dimensões da hitbox física.
 */
export interface VisualConfig {
  /** Largura do sprite em pixels lógicos no mundo (ex: 32) */
  readonly visualWidth: number;
  /** Altura do sprite em pixels lógicos no mundo (ex: 64) */
  readonly visualHeight: number;
  /** Ponto de ancoragem horizontal relativo [0.0 = esquerda, 0.5 = centro, 1.0 = direita] */
  readonly anchorX: number;
  /** Ponto de ancoragem vertical relativo [0.0 = topo, 0.5 = centro, 1.0 = base dos pés/solo] */
  readonly anchorY: number;
  /** Fator de escala multiplicador da renderização (padrão: 1.0). Preserva inteiros para pixel art nítido */
  readonly scale?: number;
}

/**
 * Limites da caixa delimitadora visual no espaço de coordenadas do mundo.
 */
export interface VisualBounds {
  readonly worldX: number;
  readonly worldY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Calcula os limites visuais (bounding box) de uma entidade no espaço de mundo a partir
 * de sua posição física e configuração visual.
 * Função pura, determinística e sem efeitos colaterais.
 *
 * @param physicalPosition Posição (worldX, worldY) do canto superior-esquerdo da hitbox física.
 * @param physicalWidth Largura da hitbox física.
 * @param physicalHeight Altura da hitbox física.
 * @param config Configuração visual da entidade (dimensões e âncora).
 */
export function calculateEntityVisualBounds(
  physicalPosition: WorldCoord,
  physicalWidth: number,
  physicalHeight: number,
  config: VisualConfig,
): VisualBounds {
  const scale = config.scale ?? 1.0;
  const scaledWidth = config.visualWidth * scale;
  const scaledHeight = config.visualHeight * scale;

  // Ponto de referência fundamental no solo: centro horizontal e base inferior da hitbox física
  const footBaseX = physicalPosition.worldX + physicalWidth / 2;
  const footBaseY = physicalPosition.worldY + physicalHeight;

  // Posiciona a caixa visual para que o ponto (anchorX, anchorY) coincida com a base física
  const worldX = footBaseX - scaledWidth * config.anchorX;
  const worldY = footBaseY - scaledHeight * config.anchorY;

  return {
    worldX,
    worldY,
    width: scaledWidth,
    height: scaledHeight,
  };
}
