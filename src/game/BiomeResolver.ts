import { Biome } from './Biome.ts';
import { EnvironmentalData, TileType } from './types.ts';

/**
 * Constantes de limiares para resolução de biomas.
 * Centralizadas para permitir calibração futura de balanceamento de mapa.
 */
export const BIOME_THRESHOLDS = {
  // Elevação abaixo deste valor é classificada como região aquática (OCEAN)
  WATER_ELEVATION: 0.35,
  // Elevação acima deste valor é classificada como região de altitude (MOUNTAIN)
  MOUNTAIN_ELEVATION: 0.72,
  // Limiar de temperatura para regiões secas/quentes (DESERT)
  DESERT_TEMPERATURE: 0.52,
  // Limiar de umidade máxima para desertos
  DESERT_HUMIDITY: 0.46,
  // Limiar de umidade mínima para florestas
  FOREST_HUMIDITY: 0.54,
} as const;

/**
 * Resolvedor determinístico e puro de Biomas.
 *
 * Responsabilidade:
 * Mapear EnvironmentalData (temperature, humidity, elevation em [0, 1)) para um Biome.
 *
 * Regras:
 * 1. Elevação muito baixa (< WATER_ELEVATION) -> OCEAN
 * 2. Elevação alta (>= MOUNTAIN_ELEVATION) -> MOUNTAIN
 * 3. Temperatura alta e umidade baixa -> DESERT
 * 4. Umidade moderada a alta -> FOREST
 * 5. Demais combinações intermediárias -> PLAINS
 */
export class BiomeResolver {
  /**
   * Resolve o bioma a partir dos dados ambientais matemáticos.
   * Função 100% pura, determinística e sem efeitos colaterais.
   */
  public static resolveBiome(env: EnvironmentalData): Biome {
    // 1. Água / Oceano
    if (env.elevation < BIOME_THRESHOLDS.WATER_ELEVATION) {
      return Biome.OCEAN;
    }

    // 2. Montanhas / Altiplanos
    if (env.elevation >= BIOME_THRESHOLDS.MOUNTAIN_ELEVATION) {
      return Biome.MOUNTAIN;
    }

    // 3. Regiões quentes e secas: Deserto
    if (
      env.temperature >= BIOME_THRESHOLDS.DESERT_TEMPERATURE &&
      env.humidity < BIOME_THRESHOLDS.DESERT_HUMIDITY
    ) {
      return Biome.DESERT;
    }

    // 4. Regiões com umidade favorável: Floresta
    if (env.humidity >= BIOME_THRESHOLDS.FOREST_HUMIDITY) {
      return Biome.FOREST;
    }

    // 5. Planícies / Pradarias (default temperado)
    return Biome.PLAINS;
  }

  /**
   * Converte um Biome em um TileType concreto do terreno atual.
   *
   * Nesta etapa:
   * OCEAN -> TileType.WATER
   * Demais biomas terrestres (PLAINS, FOREST, DESERT, MOUNTAIN) -> TileType.GRASS
   */
  public static biomeToTileType(biome: Biome): TileType {
    if (biome === Biome.OCEAN) {
      return TileType.WATER;
    }
    return TileType.GRASS;
  }
}
