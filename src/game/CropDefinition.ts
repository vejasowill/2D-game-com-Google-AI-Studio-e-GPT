import type { HarvestDefinition } from './HarvestDefinition.ts';

/**
 * Definição imutável e puramente declarativa de uma cultura agrícola (Crop).
 *
 * Princípios arquiteturais:
 * 1. Descreve apenas as propriedades intrínsecas e estáveis da cultura.
 * 2. NÃO armazena coordenadas físicas, posições no mundo nem estados mutáveis em tempo de execução.
 * 3. NÃO depende de instâncias de WorldObject ou de entidades físicas.
 * 4. Extensível para múltiplas culturas futuras sem ramificações hardcoded no código de simulação.
 * 5. Determinística: durações de estágios são especificadas em segundos de tempo de mundo.
 */
export interface CropDefinition {
  /** Identificador único, estável e canônico da cultura (ex: 'turnip') */
  readonly id: string;

  /** Nome legível para exibição e depuração (ex: 'Nabo') */
  readonly name: string;

  /** Identificador do item de semente necessário para plantar esta cultura (ex: 'turnip_seed') */
  readonly seedItemId: string;

  /** Quantidade total de estágios de crescimento (ex: 4: 0 = semeado, 1 = broto, 2 = crescendo, 3 = maduro) */
  readonly totalStages: number;

  /**
   * Durações individuais de cada transição de estágio em segundos do mundo.
   * Por exemplo, para 4 estágios: [10, 10, 10] define 10s no estágio 0, 10s no estágio 1, 10s no estágio 2.
   */
  readonly stageDurations: readonly number[];

  /** Duração uniforme opcional de cada estágio em segundos caso stageDurations não seja fornecido individualmente */
  readonly stageDuration?: number;

  /** Quantidade base de itens produzidos futuramente na colheita */
  readonly yieldQuantity: number;

  /** Identificador do item que será gerado futuramente na colheita (ex: 'turnip') */
  readonly harvestItemId: string;

  /** Definição declarativa detalhada de colheita da cultura (opcional) */
  readonly harvestDefinition?: HarvestDefinition;

  /** Identificador simbólico de asset base no AssetManager (opcional) */
  readonly spriteAssetId?: string;

  /** Identificadores opcionais de sprites específicos por estágio no AssetManager */
  readonly stageSpriteAssetIds?: readonly string[];

  /** Metadados livres extensíveis para sistemas futuros (rega, estações, fertilizantes) */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
