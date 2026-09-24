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

  /** Indica se o cultivo está atualmente regado */
  readonly watered?: boolean;

  /** Timestamp do mundo da última vez em que foi regado */
  readonly lastWateredAt?: number;

  /** Tempo total acumulado em segundos em que o cultivo esteve regado antes da rega atual */
  readonly wateredTimeAccumulated?: number;

  /** Indica se o cultivo recebeu fertilizante (reservado para mecânicas futuras) */
  readonly fertilized?: boolean;

  /** Metadados dinâmicos adicionais futuros */
  readonly customData?: Readonly<Record<string, unknown>>;
}

/**
 * Retorna determinística e puramente a duração efetiva total em segundos em que o cultivo
 * esteve com água disponível para crescimento.
 *
 * Princípios:
 * 1. ZERO chamadas a Math.random();
 * 2. 100% independente de FPS, pausas ou taxa de chamadas;
 * 3. Se o cultivo não estiver regado (watered === false), intervalos de tempo seco
 *    NÃO agregam nenhum tempo de crescimento;
 * 4. Suporta múltiplos ciclos alternados de rega e seca através do tempo acumulado.
 */
export function getCropEffectiveGrowthTime(crop: CropData, currentWorldTime: number): number {
  const accumulated = crop.wateredTimeAccumulated ?? 0;
  if (!crop.watered) {
    return accumulated;
  }
  const waterStart = crop.lastWateredAt ?? crop.plantedAt;
  const currentActiveSpan = Math.max(0, currentWorldTime - waterStart);
  return accumulated + currentActiveSpan;
}

/**
 * Calcula determinística e puramente o estágio atual de crescimento de um cultivo.
 *
 * Invariantes rigorosas:
 * 1. ZERO chamadas a Math.random();
 * 2. 100% independente da taxa de quadros por segundo (FPS);
 * 3. O crescimento progride EXCLUSIVAMENTE durante períodos em que a cultura está regada;
 * 4. Imune a pausas, acelerações de tempo ou streaming de chunks;
 * 5. Ao atingir o estágio máximo (totalStages - 1), o cultivo permanece maduro indefinidamente.
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
  const maxStage = Math.max(0, definition.totalStages - 1);
  if (maxStage === 0) {
    return 0;
  }

  // O crescimento decorre unicamente do tempo efetivamente regado
  const effectiveGrowthTime = getCropEffectiveGrowthTime(crop, currentWorldTime);
  if (effectiveGrowthTime <= 0) {
    return 0;
  }

  // Se a cultura possui durações explícitas por estágio (ex: [10, 10, 10] para 4 estágios)
  if (definition.stageDurations && definition.stageDurations.length > 0) {
    let accumulatedTime = 0;
    for (let stage = 0; stage < maxStage; stage++) {
      const durationForStage = definition.stageDurations[stage] ?? definition.stageDuration ?? 10;
      accumulatedTime += Math.max(0.001, durationForStage);
      if (effectiveGrowthTime < accumulatedTime) {
        return stage;
      }
    }
    return maxStage;
  }

  // Fallback para duração uniforme de estágio
  const uniformDuration = Math.max(0.001, definition.stageDuration ?? 10);
  const calculatedStage = Math.floor(effectiveGrowthTime / uniformDuration);
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
  const effectiveGrowthTime = getCropEffectiveGrowthTime(crop, currentWorldTime);
  if (effectiveGrowthTime <= 0) {
    return 0;
  }

  const maxStage = Math.max(0, definition.totalStages - 1);

  let accumulatedTime = 0;
  for (let stage = 0; stage < maxStage; stage++) {
    const duration = definition.stageDurations?.[stage] ?? definition.stageDuration ?? 10;
    const stageStartTime = accumulatedTime;
    accumulatedTime += Math.max(0.001, duration);

    if (effectiveGrowthTime < accumulatedTime) {
      const timeInStage = effectiveGrowthTime - stageStartTime;
      return Math.min(1.0, Math.max(0.0, timeInStage / Math.max(0.001, duration)));
    }
  }

  return 1.0;
}
