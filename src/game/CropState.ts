import { CropDefinition } from './CropDefinition.ts';

/**
 * Representa os dados em tempo de execução de um cultivo ativo no terreno.
 *
 * Princípios arquiteturais:
 * 1. Associado estritamente à célula (tile) do terreno, sem instanciar WorldObjects pesados.
 * 2. Puramente determinístico: o estágio atual é derivado da diferença entre o tempo
 *    atual do mundo (worldTime) e o momento do plantio (plantedAt), sem depender de contagem de frames.
 * 3. Sobrevive a ciclos de descarregamento e recarregamento de chunks (streaming).
 * 4. Extensível para atributos futuros (água, fertilizantes, etc.) sem quebrar o modelo base.
 */
export interface CropData {
  /** Identificador canônico da cultura correspondente no CropRegistry */
  readonly cropId: string;

  /** Coordenada X inteira do tile na grade global do mundo */
  readonly tileX: number;

  /** Coordenada Y inteira do tile na grade global do mundo */
  readonly tileY: number;

  /** Timestamp determinístico em segundos do mundo no momento exato do plantio */
  readonly plantedAt: number;

  /** Indica se o solo ao redor do cultivo foi regado (reservado para mecânicas futuras) */
  readonly watered?: boolean;

  /** Indica se o cultivo recebeu fertilizante (reservado para mecânicas futuras) */
  readonly fertilized?: boolean;

  /** Metadados dinâmicos adicionais futuros */
  readonly customData?: Readonly<Record<string, unknown>>;
}

/**
 * Calcula determinística e puramente o estágio atual de crescimento de um cultivo.
 *
 * Invariantes rigorosas:
 * 1. ZERO chamadas a Math.random();
 * 2. 100% independente da taxa de quadros por segundo (FPS);
 * 3. Imune a pausas, acelerações de tempo ou streaming de chunks;
 * 4. Ao atingir o estágio máximo (totalStages - 1), o cultivo permanece maduro indefinidamente.
 *
 * @param crop Instância de dados do cultivo ativo
 * @param definition Definição declarativa da cultura
 * @param currentWorldTime Tempo atual do mundo em segundos
 * @returns Estágio inteiro de 0 até (totalStages - 1)
 */
export function calculateCropGrowthStage(
  crop: CropData,
  definition: CropDefinition,
  currentWorldTime: number,
): number {
  if (currentWorldTime <= crop.plantedAt) {
    return 0;
  }

  const maxStage = Math.max(0, definition.totalStages - 1);
  if (maxStage === 0) {
    return 0;
  }

  const elapsed = Math.max(0, currentWorldTime - crop.plantedAt);

  // Se a cultura possui durações explícitas por estágio (ex: [10, 10, 10] para 4 estágios)
  if (definition.stageDurations && definition.stageDurations.length > 0) {
    let accumulatedTime = 0;
    for (let stage = 0; stage < maxStage; stage++) {
      const durationForStage = definition.stageDurations[stage] ?? definition.stageDuration ?? 10;
      accumulatedTime += Math.max(0.001, durationForStage);
      if (elapsed < accumulatedTime) {
        return stage;
      }
    }
    return maxStage;
  }

  // Fallback para duração uniforme de estágio
  const uniformDuration = Math.max(0.001, definition.stageDuration ?? 10);
  const calculatedStage = Math.floor(elapsed / uniformDuration);
  return Math.min(maxStage, calculatedStage);
}

/**
 * Retorna true se o cultivo atingiu o estágio final maduro.
 */
export function isCropMature(
  crop: CropData,
  definition: CropDefinition,
  currentWorldTime: number,
): boolean {
  const currentStage = calculateCropGrowthStage(crop, definition, currentWorldTime);
  const maxStage = Math.max(0, definition.totalStages - 1);
  return currentStage >= maxStage;
}

/**
 * Retorna o progresso normalizado (0.0 a 1.0) do cultivo no estágio atual.
 */
export function getCropStageProgress(
  crop: CropData,
  definition: CropDefinition,
  currentWorldTime: number,
): number {
  if (currentWorldTime <= crop.plantedAt) {
    return 0;
  }

  const maxStage = Math.max(0, definition.totalStages - 1);
  const elapsed = Math.max(0, currentWorldTime - crop.plantedAt);

  let accumulatedTime = 0;
  for (let stage = 0; stage < maxStage; stage++) {
    const duration = definition.stageDurations?.[stage] ?? definition.stageDuration ?? 10;
    const stageStartTime = accumulatedTime;
    accumulatedTime += Math.max(0.001, duration);

    if (elapsed < accumulatedTime) {
      const timeInStage = elapsed - stageStartTime;
      return Math.min(1.0, Math.max(0.0, timeInStage / Math.max(0.001, duration)));
    }
  }

  return 1.0;
}
