import { Biome } from './Biome.ts';
import { TileType } from './types.ts';

/**
 * Estilo visual puro associado a uma célula de terreno na tela.
 * Totalmente desacoplado de propriedades físicas (walkable, movementCost).
 */
export interface TerrainVisualDefinition {
  readonly color: string;
  readonly borderColor?: string;
}

/**
 * Registro de estilos visuais de biomas para tipos de terreno.
 *
 * Princípio Arquitetural:
 * - Biome: classificação ambiental e climática.
 * - TileType: tipo de terreno físico (caminhável, custo de movimento).
 * - BiomeVisualRegistry: resolve a apresentação visual pura (cor/borda) a partir do par (Biome, TileType).
 *
 * O Renderer apenas consulta o BiomeVisualRegistry através de `BiomeVisualRegistry.getVisual(biome, tileType)`
 * sem precisar conter instruções condicionais (`if biome === ...`).
 */
export class BiomeVisualRegistry {
  private static readonly visuals: Map<string, TerrainVisualDefinition> = new Map();
  private static isInitialized = false;

  private static getCompositeKey(biome: Biome, tileType: TileType): string {
    return `${biome}:${tileType}`;
  }

  private static ensureInitialized(): void {
    if (this.isInitialized) {
      return;
    }

    // 1. OCEAN (Terreno aquático)
    // Azul profundo/oceânico com borda sutil em tom de água profunda
    this.register(Biome.OCEAN, TileType.WATER, {
      color: '#0369a1',
      borderColor: '#025380',
    });

    // Fallback para água em outros biomas caso venham a existir lagoas continentais
    this.registerFallback(TileType.WATER, {
      color: '#0284c7',
      borderColor: '#0369a1',
    });

    // Fallback para terreno removido/vazio em qualquer bioma
    this.registerFallback(TileType.EMPTY, {
      color: '#18181b',
      borderColor: '#09090b',
    });

    // Fallback para piso de madeira em qualquer bioma
    this.registerFallback(TileType.WOOD_FLOOR, {
      color: '#854d0e',
      borderColor: '#713f12',
    });

    // Fallback para solo arado/preparado em qualquer bioma
    this.registerFallback(TileType.TILLED_SOIL, {
      color: '#5c3d1e',
      borderColor: '#42280d',
    });

    // 2. PLAINS (Planície temperada / pradaria)
    // Verde claro natural com contorno de grama equilibrada
    this.register(Biome.PLAINS, TileType.GRASS, {
      color: '#4ade80',
      borderColor: '#22c55e',
    });

    // 3. FOREST (Floresta temperada / densa)
    // Verde mais escuro e fechado de folhagem densa
    this.register(Biome.FOREST, TileType.GRASS, {
      color: '#15803d',
      borderColor: '#166534',
    });

    // 4. DESERT (Deserto árido)
    // Tons quentes de areia/amarelo-terra seco
    this.register(Biome.DESERT, TileType.GRASS, {
      color: '#eab308',
      borderColor: '#ca8a04',
    });

    // 5. MOUNTAIN (Regiões de altitude rochosas / altiplanos)
    // Cinza e tons rochosos de pedra/pedregulho
    this.register(Biome.MOUNTAIN, TileType.GRASS, {
      color: '#64748b',
      borderColor: '#475569',
    });

    this.isInitialized = true;
  }

  /**
   * Registra a aparência visual de um tipo de terreno específico dentro de um determinado Bioma.
   */
  public static register(
    biome: Biome,
    tileType: TileType,
    visual: TerrainVisualDefinition,
  ): void {
    this.visuals.set(this.getCompositeKey(biome, tileType), visual);
  }

  /**
   * Registra fallback direto por TileType caso uma combinação não mapeada ocorra.
   */
  public static registerFallback(
    tileType: TileType,
    visual: TerrainVisualDefinition,
  ): void {
    this.visuals.set(`*:${tileType}`, visual);
  }

  /**
   * Obtém a definição visual para a combinação dada de Biome e TileType.
   * Totalmente determinístico, sem efeitos colaterais e sem alocação dinâmica.
   */
  public static getVisual(biome: Biome, tileType: TileType): TerrainVisualDefinition {
    this.ensureInitialized();

    const specific = this.visuals.get(this.getCompositeKey(biome, tileType));
    if (specific) {
      return specific;
    }

    const fallback = this.visuals.get(`*:${tileType}`);
    if (fallback) {
      return fallback;
    }

    // Fallback geral seguro
    if (tileType === TileType.WATER) {
      return { color: '#0284c7', borderColor: '#0369a1' };
    }
    if (tileType === TileType.EMPTY) {
      return { color: '#18181b', borderColor: '#09090b' };
    }
    if (tileType === TileType.WOOD_FLOOR) {
      return { color: '#854d0e', borderColor: '#713f12' };
    }
    return { color: '#2e7d32', borderColor: '#256629' };
  }
}
