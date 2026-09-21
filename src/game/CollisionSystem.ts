import { TILE_SIZE } from './constants.ts';
import { Player } from './Player.ts';
import { TileRegistry } from './TileRegistry.ts';
import { TileCoord, Vector2D, WorldCoord } from './types.ts';
import { World } from './World.ts';

/**
 * Caixa delimitadora alinhada aos eixos (AABB) no espaço de coordenadas do mundo.
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Sistema de Colisão e Movimento Espacial.
 *
 * Responsável por:
 * - Consultar tiles através do World;
 * - Consultar propriedades físicas através do TileRegistry;
 * - Validar se áreas espaciais (AABB) podem ser ocupadas;
 * - Resolver a movimentação por eixo (deslizamento);
 * - Bloquear passagem por tiles não caminháveis (ex: WATER).
 *
 * Não possui acoplamento com Canvas, Renderer, Camera ou Input.
 */
export class CollisionSystem {
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  /**
   * Obtém a caixa AABB representativa de uma entidade no espaço de mundo.
   */
  public getEntityBoundingBox(position: WorldCoord, size: number): BoundingBox {
    return {
      minX: position.worldX,
      minY: position.worldY,
      maxX: position.worldX + size,
      maxY: position.worldY + size,
    };
  }

  /**
   * Retorna a lista de coordenadas de tiles tocados por uma área retangular do mundo.
   * Utiliza as regras de conversão já existentes no World (worldToTile).
   */
  public getTilesInArea(
    worldX: number,
    worldY: number,
    width: number,
    height: number,
  ): TileCoord[] {
    if (width <= 0 || height <= 0) {
      return [];
    }

    // Margem infinitesimal para que o contato exato na aresta não invada indevidamente o tile adjacente
    const EPSILON = 1e-6;
    const minX = worldX;
    const minY = worldY;
    const maxX = worldX + width;
    const maxY = worldY + height;

    const topLeftTile = this.world.worldToTile({ worldX: minX, worldY: minY });
    const bottomRightTile = this.world.worldToTile({
      worldX: maxX - EPSILON,
      worldY: maxY - EPSILON,
    });

    const tiles: TileCoord[] = [];
    for (let tileY = topLeftTile.tileY; tileY <= bottomRightTile.tileY; tileY++) {
      for (let tileX = topLeftTile.tileX; tileX <= bottomRightTile.tileX; tileX++) {
        tiles.push({ tileX, tileY });
      }
    }

    return tiles;
  }

  /**
   * Determina se uma área retangular pode ser ocupada.
   *
   * Regras:
   * 1. Todos os tiles tocados pela área devem ser válidos e possuir walkable = true no TileRegistry.
   * Não há restrição de borda artificial de mundo; o espaço é ilimitado.
   */
  public canOccupyArea(
    worldX: number,
    worldY: number,
    width: number,
    height: number,
  ): boolean {
    // Consulta de walkability dos tiles ocupados
    const touchedTiles = this.getTilesInArea(worldX, worldY, width, height);
    for (const coord of touchedTiles) {
      if (!this.world.isValidCoord(coord.tileX, coord.tileY)) {
        return false;
      }

      const tile = this.world.getTile(coord.tileX, coord.tileY);
      if (!tile) {
        return false;
      }

      const definition = TileRegistry.get(tile.type);
      if (!definition.walkable) {
        return false;
      }
    }

    return true;
  }

  /**
   * Move o Player resolvendo a colisão de forma independente por eixo (X depois Y).
   * Isso assegura velocidade constante em qualquer direção e deslizamento suave em paredes/bordas de obstáculos.
   */
  public movePlayer(
    player: Player,
    direction: Vector2D,
    deltaTime: number,
  ): void {
    if (deltaTime <= 0) {
      return;
    }

    let dx = direction.x;
    let dy = direction.y;

    // Normalização para movimento diagonal uniforme
    if (dx !== 0 && dy !== 0) {
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        dx /= length;
        dy /= length;
      }
    }

    const deltaX = dx * player.speed * deltaTime;
    const deltaY = dy * player.speed * deltaTime;
    const size = player.size;

    // 1. Resolução do eixo X
    if (deltaX !== 0) {
      const desiredX = player.position.worldX + deltaX;

      if (this.canOccupyArea(desiredX, player.position.worldY, size, size)) {
        player.position.worldX = desiredX;
      } else {
        // Encostar rente ao limite do obstáculo no eixo X
        const snapX =
          deltaX > 0
            ? Math.floor((player.position.worldX + size) / TILE_SIZE + 1) * TILE_SIZE - size
            : Math.floor(player.position.worldX / TILE_SIZE) * TILE_SIZE;

        const isMovingTowardsSnap =
          deltaX > 0
            ? snapX > player.position.worldX && snapX <= desiredX
            : snapX < player.position.worldX && snapX >= desiredX;

        if (
          isMovingTowardsSnap &&
          this.canOccupyArea(snapX, player.position.worldY, size, size)
        ) {
          player.position.worldX = snapX;
        }
      }
    }

    // 2. Resolução do eixo Y
    if (deltaY !== 0) {
      const desiredY = player.position.worldY + deltaY;

      if (this.canOccupyArea(player.position.worldX, desiredY, size, size)) {
        player.position.worldY = desiredY;
      } else {
        // Encostar rente ao limite do obstáculo no eixo Y
        const snapY =
          deltaY > 0
            ? Math.floor((player.position.worldY + size) / TILE_SIZE + 1) * TILE_SIZE - size
            : Math.floor(player.position.worldY / TILE_SIZE) * TILE_SIZE;

        const isMovingTowardsSnap =
          deltaY > 0
            ? snapY > player.position.worldY && snapY <= desiredY
            : snapY < player.position.worldY && snapY >= desiredY;

        if (
          isMovingTowardsSnap &&
          this.canOccupyArea(player.position.worldX, snapY, size, size)
        ) {
          player.position.worldY = snapY;
        }
      }
    }
  }
}
