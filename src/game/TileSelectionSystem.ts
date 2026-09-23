import { Camera } from './Camera.ts';
import { TILE_SIZE } from './constants.ts';
import { ScreenCoord, TileCoord, ViewportSize, WorldCoord } from './types.ts';
import { World } from './World.ts';

/**
 * Subsistema especializado e desacoplado para seleção de células do terreno (tiles).
 * Atende prioritariamente dispositivos móveis (toque na tela) e desktop (mouse).
 *
 * Pipeline de conversão espacial estrito:
 * Posição do Toque/Mouse (ScreenCoord)
 *   ↓ Camera.screenToWorld
 * Coordenada contínua no espaço do mundo (WorldCoord em pixels)
 *   ↓ World.worldToTile
 * Coordenada discreta na grade infinita de tiles (TileCoord)
 */
export class TileSelectionSystem {
  private selectedTile: TileCoord | null = null;

  /**
   * Converte uma coordenada de tela para uma coordenada inteira de tile na grade do mundo.
   */
  public screenToTileCoord(
    screenCoord: ScreenCoord,
    viewport: ViewportSize,
    camera: Camera,
    world: World,
  ): TileCoord {
    const worldCoord = camera.screenToWorld(screenCoord, viewport);
    return world.worldToTile(worldCoord);
  }

  /**
   * Define o tile selecionado atualmente.
   */
  public selectTile(tileCoord: TileCoord | null): void {
    if (!tileCoord) {
      this.selectedTile = null;
      return;
    }
    this.selectedTile = {
      tileX: Math.floor(tileCoord.tileX),
      tileY: Math.floor(tileCoord.tileY),
    };
  }

  /**
   * Alias de conveniência para definir o tile selecionado.
   */
  public setSelectedTile(tileCoord: TileCoord | null): void {
    this.selectTile(tileCoord);
  }

  /**
   * Retorna a coordenada do tile selecionado atualmente, ou null se não houver seleção.
   */
  public getSelectedTile(): TileCoord | null {
    return this.selectedTile ? { ...this.selectedTile } : null;
  }

  /**
   * Limpa a seleção ativa.
   */
  public clearSelection(): void {
    this.selectedTile = null;
  }

  /**
   * Verifica se o tile selecionado está dentro do alcance máximo a partir de uma coordenada de origem.
   */
  public isTileWithinRange(
    tileCoord: TileCoord,
    sourcePosition: WorldCoord,
    maxRange: number,
  ): boolean {
    const tileCenterWorldX = tileCoord.tileX * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterWorldY = tileCoord.tileY * TILE_SIZE + TILE_SIZE / 2;
    const distance = Math.hypot(
      tileCenterWorldX - sourcePosition.worldX,
      tileCenterWorldY - sourcePosition.worldY,
    );
    return distance <= maxRange;
  }
}
