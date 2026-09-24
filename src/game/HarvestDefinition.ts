import { CropDefinition } from './CropDefinition.ts';

/**
 * Contrato imutável e puramente declarativo para a colheita de culturas agrícolas (HarvestDefinition).
 *
 * Princípios arquiteturais:
 * 1. Descreve formalmente como uma cultura é colhida e qual item/quantidade ela produz;
 * 2. Desacoplada de instâncias de WorldObject ou de entidades físicas;
 * 3. Permite colheita manual padrão ou requisito de ferramentas especializadas;
 * 4. Extensível para múltiplas culturas futuras sem ramificações hardcoded no código de gameplay;
 * 5. Totalmente determinística e imutável.
 */
export interface HarvestDefinition {
  /** Identificador canônico da cultura associada (ex: 'turnip') */
  readonly cropId: string;

  /** Identificador do item produzido na colheita no ItemRegistry (ex: 'turnip') */
  readonly harvestItemId: string;

  /** Quantidade determinística produzida na colheita (ex: 1) */
  readonly harvestQuantity: number;

  /**
   * Indica se a cultura deve estar estritamente no estágio maduro para permitir a colheita.
   * Padrão conceitual: true.
   */
  readonly requiresMaturity?: boolean;

  /**
   * Categoria da ferramenta opcional requerida para colheita (ex: 'sickle', 'scythe').
   * Se indefinido, permite colheita manual livre (via INTERACT).
   */
  readonly requiredToolCategory?: string;

  /** Ação formal da colheita (padrão: 'harvest') */
  readonly action?: string;

  /** Metadados livres extensíveis para sistemas futuros (drops secundários, resíduos, etc.) */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Retorna a HarvestDefinition declarada na cultura ou infere a definição padrão
 * a partir das propriedades base da CropDefinition (harvestItemId e yieldQuantity).
 */
export function getCropHarvestDefinition(cropDef: CropDefinition): HarvestDefinition {
  if (cropDef.harvestDefinition) {
    return cropDef.harvestDefinition;
  }

  return {
    cropId: cropDef.id,
    harvestItemId: cropDef.harvestItemId,
    harvestQuantity: cropDef.yieldQuantity,
    requiresMaturity: true,
    action: 'harvest',
    metadata: cropDef.metadata,
  };
}

/** Motivos padronizados e determinísticos de recusa ou falha na colheita */
export type HarvestFailureReason =
  | 'NO_CROP'
  | 'UNKNOWN_CROP'
  | 'NOT_MATURE'
  | 'OUT_OF_RANGE'
  | 'BEHIND_PLAYER'
  | 'INVENTORY_FULL'
  | 'MISSING_TOOL';

/** Resultado da avaliação prévia da viabilidade de colheita */
export interface HarvestEvaluation {
  readonly canHarvest: boolean;
  readonly failureReason?: HarvestFailureReason;
  readonly cropId?: string;
  readonly harvestDefinition?: HarvestDefinition;
}

/** Resultado estruturado após tentativa de execução de colheita */
export interface HarvestResult {
  readonly success: boolean;
  readonly tileX: number;
  readonly tileY: number;
  readonly cropId?: string;
  readonly harvestItemId?: string;
  readonly quantityProduced?: number;
  readonly failureReason?: HarvestFailureReason;
  readonly message?: string;
}
