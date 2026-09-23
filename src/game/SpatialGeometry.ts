import { PlayerDirection } from './Player.ts';
import { WorldBounds, WorldCoord } from './types.ts';

/**
 * Utilitários puros de geometria espacial compartilhados entre sistemas de gameplay
 * (InteractionSystem, ItemUseSystem, etc.).
 *
 * Princípios:
 * 1. Funções matemáticas puras, sem efeitos colaterais e sem estado mutável.
 * 2. Desacopladas de Canvas, Renderer, Sprites e DOM.
 * 3. Baseadas estritamente em limites físicos (hitbox/AABB), nunca em dimensões de sprites.
 * 4. Determinísticas e compatíveis com coordenadas negativas em mundo infinito.
 */
export class SpatialGeometry {
  /**
   * Calcula a caixa delimitadora (AABB) de uma área direcional projetada à frente
   * do jogador com base em sua orientação e alcance.
   */
  public static calculateDirectionalArea(
    position: WorldCoord,
    size: number,
    direction: PlayerDirection,
    range: number,
    lateralMargin: number = 8,
    overlap: number = 4,
  ): WorldBounds {
    const px = position.worldX;
    const py = position.worldY;

    switch (direction) {
      case PlayerDirection.RIGHT: {
        const minX = px + size - overlap;
        const maxX = px + size + range;
        const minY = py - lateralMargin;
        const maxY = py + size + lateralMargin;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      case PlayerDirection.LEFT: {
        const minX = px - range;
        const maxX = px + overlap;
        const minY = py - lateralMargin;
        const maxY = py + size + lateralMargin;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      case PlayerDirection.DOWN: {
        const minX = px - lateralMargin;
        const maxX = px + size + lateralMargin;
        const minY = py + size - overlap;
        const maxY = py + size + range;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      case PlayerDirection.UP: {
        const minX = px - lateralMargin;
        const maxX = px + size + lateralMargin;
        const minY = py - range;
        const maxY = py + overlap;
        return {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
    }
  }

  /**
   * Obtém a coordenada do ponto frontal do jogador no espaço do mundo.
   */
  public static getDirectionFrontPoint(
    position: WorldCoord,
    size: number,
    direction: PlayerDirection,
  ): WorldCoord {
    const px = position.worldX;
    const py = position.worldY;
    const pcx = px + size / 2;
    const pcy = py + size / 2;

    switch (direction) {
      case PlayerDirection.RIGHT:
        return { worldX: px + size, worldY: pcy };
      case PlayerDirection.LEFT:
        return { worldX: px, worldY: pcy };
      case PlayerDirection.DOWN:
        return { worldX: pcx, worldY: py + size };
      case PlayerDirection.UP:
        return { worldX: pcx, worldY: py };
    }
  }

  /**
   * Verifica se uma caixa alvo está orientada no setor à frente da origem na direção cardeal informada.
   * Rejeita estritamente caixas localizadas nas costas da origem.
   */
  public static isObjectInFrontSector(
    originPosition: WorldCoord,
    originSize: number,
    direction: PlayerDirection,
    targetBounds: WorldBounds,
    angleTolerance: number = 16,
  ): boolean {
    const pcx = originPosition.worldX + originSize / 2;
    const pcy = originPosition.worldY + originSize / 2;

    const ocx = targetBounds.minX + targetBounds.width / 2;
    const ocy = targetBounds.minY + targetBounds.height / 2;

    const dx = ocx - pcx;
    const dy = ocy - pcy;

    switch (direction) {
      case PlayerDirection.RIGHT:
        return dx > 0 && dx >= Math.abs(dy) - angleTolerance;
      case PlayerDirection.LEFT:
        return dx < 0 && Math.abs(dx) >= Math.abs(dy) - angleTolerance;
      case PlayerDirection.DOWN:
        return dy > 0 && dy >= Math.abs(dx) - angleTolerance;
      case PlayerDirection.UP:
        return dy < 0 && Math.abs(dy) >= Math.abs(dx) - angleTolerance;
    }
  }

  /**
   * Calcula a menor distância euclidiana entre duas caixas AABB (em pixels).
   * Se as caixas se tocam ou sobrepõem, retorna 0.
   */
  public static calculateAABBDistance(
    minX1: number,
    minY1: number,
    maxX1: number,
    maxY1: number,
    minX2: number,
    minY2: number,
    maxX2: number,
    maxY2: number,
  ): number {
    const dx = Math.max(0, Math.max(minX1 - maxX2, minX2 - maxX1));
    const dy = Math.max(0, Math.max(minY1 - maxY2, minY2 - maxY1));
    return Math.hypot(dx, dy);
  }
}
