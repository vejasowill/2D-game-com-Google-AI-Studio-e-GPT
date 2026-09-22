import { Biome } from './Biome.ts';
import { WorldObject } from './WorldObject.ts';

/**
 * Classificação dos tipos de objetos naturais procedurais.
 */
export enum NaturalObjectType {
  TREE = 'tree',
  CACTUS = 'cactus',
  ROCK = 'rock',
  WILDFLOWER = 'wildflower',
}

/**
 * Regra e dados de geração para um tipo específico de objeto natural.
 */
export interface NaturalObjectDefinition {
  /** Tipo único e canônico do objeto natural */
  readonly type: NaturalObjectType;

  /** Biomas onde este objeto natural pode se materializar */
  readonly allowedBiomes: readonly Biome[];

  /** Probabilidade base de spawn em cada tile caminhável do bioma [0, 1) */
  readonly spawnChance: number;

  /** Dimensões espaciais de caixa delimitadora (em pixels) para o WorldObject */
  readonly width: number;
  readonly height: number;

  /** Jitter determinístico máximo (em pixels) a partir do centro do tile */
  readonly maxJitterX: number;
  readonly maxJitterY: number;
}

/**
 * Entidade concreta de objeto natural que implementa a interface base WorldObject.
 * Preserva compatibilidade integral com WorldObjectManager e o sistema espacial existente.
 */
export interface NaturalObject extends WorldObject {
  /** Tipo canônico de objeto natural */
  readonly naturalType: NaturalObjectType;

  /** Bioma no qual o objeto foi gerado */
  readonly biome: Biome;

  /** Coordenadas globais do tile de origem da entidade */
  readonly sourceTileX: number;
  readonly sourceTileY: number;

  /** Variação visual determinística (0..3) para detalhes de renderização */
  readonly variant: number;
}

/**
 * Registro determinístico das definições de objetos naturais por bioma.
 */
export const NATURAL_OBJECT_DEFINITIONS: Record<NaturalObjectType, NaturalObjectDefinition> = {
  [NaturalObjectType.TREE]: {
    type: NaturalObjectType.TREE,
    allowedBiomes: [Biome.FOREST],
    spawnChance: 0.38,
    width: 28,
    height: 38,
    maxJitterX: 4,
    maxJitterY: 3,
  },
  [NaturalObjectType.CACTUS]: {
    type: NaturalObjectType.CACTUS,
    allowedBiomes: [Biome.DESERT],
    spawnChance: 0.08,
    width: 14,
    height: 26,
    maxJitterX: 6,
    maxJitterY: 4,
  },
  [NaturalObjectType.ROCK]: {
    type: NaturalObjectType.ROCK,
    allowedBiomes: [Biome.MOUNTAIN],
    spawnChance: 0.18,
    width: 22,
    height: 16,
    maxJitterX: 5,
    maxJitterY: 4,
  },
  [NaturalObjectType.WILDFLOWER]: {
    type: NaturalObjectType.WILDFLOWER,
    allowedBiomes: [Biome.PLAINS],
    spawnChance: 0.10,
    width: 12,
    height: 12,
    maxJitterX: 6,
    maxJitterY: 5,
  },
};

/**
 * Mapeamento exclusivo de bioma para o tipo de objeto natural permitido.
 * Garante que biomas tenham apenas seus respectivos objetos naturais terrestres,
 * e que oceanos não tenham nenhum objeto terrestre.
 */
export const BIOME_TO_NATURAL_OBJECT: Partial<Record<Biome, NaturalObjectType>> = {
  [Biome.FOREST]: NaturalObjectType.TREE,
  [Biome.DESERT]: NaturalObjectType.CACTUS,
  [Biome.MOUNTAIN]: NaturalObjectType.ROCK,
  [Biome.PLAINS]: NaturalObjectType.WILDFLOWER,
  [Biome.OCEAN]: undefined,
};
