/**
 * Definição dos Biomas do jogo.
 *
 * Princípio Arquitetural:
 * BIOME ≠ TILE.
 *
 * - Biome: classificação ambiental e climática do mundo (temperatura, umidade, elevação).
 * - TileType: representação concreta do terreno na grade de chunks (GRASS, WATER, etc.).
 *
 * Nesta etapa de fundação:
 * OCEAN/WATER -> mapeia para TileType.WATER
 * PLAINS, FOREST, DESERT, MOUNTAIN -> mapeiam para TileType.GRASS
 */
export enum Biome {
  OCEAN = 'OCEAN',
  PLAINS = 'PLAINS',
  FOREST = 'FOREST',
  DESERT = 'DESERT',
  MOUNTAIN = 'MOUNTAIN',
}
