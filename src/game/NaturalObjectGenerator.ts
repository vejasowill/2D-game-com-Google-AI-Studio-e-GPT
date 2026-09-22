import { Biome } from './Biome.ts';
import { CHUNK_SIZE, TILE_SIZE } from './constants.ts';
import { EcologicalDensityField } from './EcologicalDensityField.ts';
import {
  BIOME_TO_NATURAL_OBJECT,
  NATURAL_OBJECT_DEFINITIONS,
  NaturalObject,
  NaturalObjectType,
} from './NaturalObjectDefinition.ts';
import { NaturalTreeObject } from './NaturalTreeObject.ts';
import { TileRegistry } from './TileRegistry.ts';
import { ChunkCoord, TileType } from './types.ts';
import { deterministicHash2D, normalizeHash, WorldGenerator } from './WorldGenerator.ts';

/**
 * Gerador procedural determinístico de objetos naturais com distribuição ecológica modulada.
 *
 * Princípios arquiteturais:
 * - 100% determinístico e função pura de (seed, globalTileX, globalTileY);
 * - Totalmente independente da ordem de carregamento ou streaming de chunks;
 * - Nunca utiliza Math.random(), Date.now() ou estado mutável global;
 * - Respeita o contrato físico: nunca coloca objetos em WATER ou tiles não caminháveis;
 * - Respeita a identidade de bioma:
 *   - FOREST: árvores (TREE);
 *   - DESERT: cactos (CACTUS);
 *   - MOUNTAIN: rochas (ROCK);
 *   - PLAINS: flores silvestres (WILDFLOWER);
 *   - OCEAN: nenhum objeto terrestre;
 * - Probabilidade modulada por um campo contínuo de densidade ecológica espacial (EcologicalDensityField),
 *   criando bosques densos, zonas moderadas e clareiras orgânicas sem bolhas artificiais;
 * - Gera IDs estáveis no formato canônico: natural:<type>:<tileX>:<tileY>;
 * - Mantém ancoragem top-down coerente para Depth/Z-Sorting por linha de base.
 */
export class NaturalObjectGenerator {
  public readonly seed: number;
  private readonly worldGenerator: WorldGenerator;
  private readonly densityField: EcologicalDensityField;

  // Sementes derivadas para cada aspecto da geração de objetos naturais
  private readonly seedObject: number;
  private readonly seedJitterX: number;
  private readonly seedJitterY: number;
  private readonly seedVariant: number;

  constructor(worldGenerator: WorldGenerator) {
    this.worldGenerator = worldGenerator;
    this.seed = worldGenerator.seed | 0;

    // Campo de densidade ecológica espacial independente com semente derivada
    this.densityField = new EcologicalDensityField(this.seed);

    // Derivação ortogonal de sementes determinísticas
    this.seedObject = (this.seed ^ 0x9e3779b9) | 0;
    this.seedJitterX = (this.seed ^ 0xa341316c) | 0;
    this.seedJitterY = (this.seed ^ 0xc8013ea4) | 0;
    this.seedVariant = (this.seed ^ 0xad90777d) | 0;
  }

  /**
   * Retorna o campo determinístico de densidade ecológica.
   */
  public getDensityField(): EcologicalDensityField {
    return this.densityField;
  }

  /**
   * Amostra a densidade ecológica [0, 1) em uma coordenada global.
   * Consulta pura que nunca materializa chunks.
   */
  public getDensityAt(globalTileX: number, globalTileY: number): number {
    return this.densityField.getDensityAt(globalTileX, globalTileY);
  }

  /**
   * Calcula a probabilidade efetiva modulada pela densidade ecológica espacial.
   *
   * Garante:
   * - FOREST: modulação com transição suave entre clareiras orgânicas (densidade baixa),
   *   regiões médias e bosques densos, mantendo sempre passabilidade para o jogador;
   * - DESERT: cactos relativamente raros com pequenos agrupamentos e grandes áreas abertas;
   * - MOUNTAIN: rochas distribuídas irregularmente com agrupamentos ocasionais e encostas abertas;
   * - PLAINS: flores silvestres em delicadas concentrações naturais evitando dispersão uniforme.
   */
  public getEffectiveSpawnChance(
    type: NaturalObjectType,
    globalTileX: number,
    globalTileY: number,
  ): number {
    const def = NATURAL_OBJECT_DEFINITIONS[type];
    if (!def) return 0;

    const density = this.densityField.getDensityAt(globalTileX, globalTileY);

    let densityModifier = 1.0;

    switch (type) {
      case NaturalObjectType.TREE: {
        // Para florestas:
        // density < 0.35: clareiras naturais abertas e áreas limpas (modificador cai até 0.05)
        // density 0.35..0.65: densidade média / transição suave
        // density > 0.65: bosques densos com árvores abundantes (modificador até 1.70, spawnChance ~0.64)
        if (density < 0.35) {
          const t = density / 0.35;
          densityModifier = 0.04 + t * 0.36; // [0.04, 0.40]
        } else {
          const t = (density - 0.35) / 0.65;
          densityModifier = 0.40 + t * 1.30; // [0.40, 1.70]
        }
        break;
      }

      case NaturalObjectType.CACTUS: {
        // Para desertos:
        // Cactos são raros no geral. Áreas com density < 0.40 ficam praticamente limpas.
        // Áreas com density alta (oásis / aglomerados) concentram pequenos grupos.
        if (density < 0.40) {
          densityModifier = (density / 0.40) * 0.25; // [0.0, 0.25]
        } else {
          const t = (density - 0.40) / 0.60;
          densityModifier = 0.25 + t * 1.55; // [0.25, 1.80]
        }
        break;
      }

      case NaturalObjectType.ROCK: {
        // Para montanhas:
        // Distribuição irregular com áreas rochosas densas e platôs/vales mais abertos.
        if (density < 0.35) {
          densityModifier = 0.15 + (density / 0.35) * 0.35; // [0.15, 0.50]
        } else {
          const t = (density - 0.35) / 0.65;
          densityModifier = 0.50 + t * 0.90; // [0.50, 1.40]
        }
        break;
      }

      case NaturalObjectType.WILDFLOWER: {
        // Para planícies:
        // Flores em pequenas manchas orgânicas (density alta), deixando amplas faixas de pasto aberto.
        if (density < 0.45) {
          densityModifier = (density / 0.45) * 0.20; // [0.0, 0.20]
        } else {
          const t = (density - 0.45) / 0.55;
          densityModifier = 0.20 + t * 1.60; // [0.20, 1.80]
        }
        break;
      }
    }

    return def.spawnChance * densityModifier;
  }

  /**
   * Consulta se um objeto natural determinístico existe na coordenada global de tile.
   * Função pura: não aloca chunks na memória do ChunkManager.
   */
  public getNaturalObjectAt(globalTileX: number, globalTileY: number): NaturalObject | null {
    // 0. Preservar clareira no ponto de spawn inicial (0, 0)
    if (globalTileX === 0 && globalTileY === 0) {
      return null;
    }

    // 1. Verificar terreno: se for água ou não caminhável, nunca gera objeto natural terrestre
    const tileType = this.worldGenerator.getTileTypeAt(globalTileX, globalTileY);
    if (tileType === TileType.WATER) {
      return null;
    }
    const tileDef = TileRegistry.get(tileType);
    if (!tileDef.walkable) {
      return null;
    }

    // 2. Verificar bioma: se for OCEAN, nunca gera objeto natural terrestre
    const biome = this.worldGenerator.getBiomeAt(globalTileX, globalTileY);
    if (biome === Biome.OCEAN) {
      return null;
    }

    // 3. Mapear bioma para o tipo de objeto natural permitido
    const objectType = BIOME_TO_NATURAL_OBJECT[biome];
    if (!objectType) {
      return null;
    }

    const def = NATURAL_OBJECT_DEFINITIONS[objectType];
    if (!def) {
      return null;
    }

    // 4. Probabilidade modulada pelo campo de densidade ecológica espacial
    const effectiveChance = this.getEffectiveSpawnChance(objectType, globalTileX, globalTileY);

    // Teste de probabilidade determinístico via hash do tile
    const hash = normalizeHash(deterministicHash2D(this.seedObject, globalTileX, globalTileY));
    if (hash >= effectiveChance) {
      return null;
    }

    // 5. Regra de espaçamento para objetos com volume (TREE e ROCK):
    // Evita aglomeração direta em tiles ortogonalmente adjacentes.
    // O tile com maior hash na vizinhança vence a prioridade de materialização.
    if (objectType === NaturalObjectType.TREE || objectType === NaturalObjectType.ROCK) {
      const neighbors = [
        [globalTileX + 1, globalTileY],
        [globalTileX - 1, globalTileY],
        [globalTileX, globalTileY + 1],
        [globalTileX, globalTileY - 1],
      ];

      for (const [nx, ny] of neighbors) {
        // Disputa somente com vizinhos do mesmo bioma e caminháveis
        const neighborTileType = this.worldGenerator.getTileTypeAt(nx, ny);
        if (neighborTileType === TileType.WATER) continue;
        const neighborBiome = this.worldGenerator.getBiomeAt(nx, ny);
        if (neighborBiome !== biome) continue;

        const neighborChance = this.getEffectiveSpawnChance(objectType, nx, ny);
        const neighborHash = normalizeHash(deterministicHash2D(this.seedObject, nx, ny));
        if (neighborHash < neighborChance) {
          // Ambos são candidatos válidos. O maior hash prevalece.
          // Critério de desempate puramente determinístico caso os hashes sejam idênticos.
          if (
            neighborHash > hash ||
            (neighborHash === hash && (nx * 10007 + ny) > (globalTileX * 10007 + globalTileY))
          ) {
            return null;
          }
        }
      }
    }

    // 6. Cálculo da posição contínua no mundo com jitter determinístico
    const tileWorldX = globalTileX * TILE_SIZE;
    const tileWorldY = globalTileY * TILE_SIZE;

    const centerX = tileWorldX + TILE_SIZE / 2;
    // Ancoragem na base do tile (terço inferior para sensação de profundidade top-down)
    const baseWorldY = tileWorldY + TILE_SIZE * 0.85;

    const jitterHashX = normalizeHash(deterministicHash2D(this.seedJitterX, globalTileX, globalTileY));
    const jitterHashY = normalizeHash(deterministicHash2D(this.seedJitterY, globalTileX, globalTileY));

    const jitterX = (jitterHashX - 0.5) * 2 * def.maxJitterX;
    const jitterY = (jitterHashY - 0.5) * 2 * def.maxJitterY;

    const worldX = Math.round(centerX - def.width / 2 + jitterX);
    const worldY = Math.round(baseWorldY - def.height + jitterY);

    // 7. Variação visual determinística (0..3)
    const variant = (deterministicHash2D(this.seedVariant, globalTileX, globalTileY) >>> 0) % 4;

    // 8. ID estável e único: natural:<type>:<tileX>:<tileY>
    const id = `natural:${def.type}:${globalTileX}:${globalTileY}`;

    if (def.type === NaturalObjectType.TREE) {
      return new NaturalTreeObject(
        id,
        { worldX, worldY },
        def.width,
        def.height,
        biome,
        globalTileX,
        globalTileY,
        variant,
      );
    }

    return {
      id,
      type: def.type,
      position: { worldX, worldY },
      width: def.width,
      height: def.height,
      naturalType: def.type,
      biome,
      sourceTileX: globalTileX,
      sourceTileY: globalTileY,
      variant,
    };
  }

  /**
   * Gera determinísticamente a lista de todos os objetos naturais de um chunk.
   * Produz exatamente o mesmo resultado para o mesmo chunkCoord e seed,
   * independentemente de quando ou em que ordem for chamado.
   */
  public generateForChunk(chunkCoord: ChunkCoord): NaturalObject[] {
    const objects: NaturalObject[] = [];
    for (let localY = 0; localY < CHUNK_SIZE; localY++) {
      const globalTileY = chunkCoord.chunkY * CHUNK_SIZE + localY;
      for (let localX = 0; localX < CHUNK_SIZE; localX++) {
        const globalTileX = chunkCoord.chunkX * CHUNK_SIZE + localX;
        const obj = this.getNaturalObjectAt(globalTileX, globalTileY);
        if (obj !== null) {
          objects.push(obj);
        }
      }
    }
    return objects;
  }
}
