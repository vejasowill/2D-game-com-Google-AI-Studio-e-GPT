import { CHUNK_SIZE } from './constants.ts';
import { CropDefinition } from './CropDefinition.ts';
import { CropRegistry } from './CropRegistry.ts';
import {
  calculateCropGrowthStage,
  CropData,
  isCropMature,
} from './CropState.ts';
import { TileModificationRegistry } from './TileModificationRegistry.ts';

/**
 * Sistema central e persistente responsável pelo gerenciamento de culturas plantadas no mundo (CropSystem).
 *
 * Princípios arquiteturais:
 * 1. Não transforma plantas em WorldObjects comuns ou entidades físicas: associa cultivos puramente às células de terreno (tiles);
 * 2. Armazena apenas células que possuem cultivo ativo, indexadas em O(1);
 * 3. Consultas NUNCA materializam chunks no ChunkManager nem forçam geração procedural;
 * 4. Sobrevive a unload e reload de chunks mantendo a integridade temporal determinística;
 * 5. Índice secundário por chunk para renderização eficiente O(1) de cultivos visíveis;
 * 6. Suporte completo a coordenadas positivas, negativas e fronteiras de chunk.
 */
export class CropSystem {
  /** Armazenamento principal indexado pela chave global estável `tileX,tileY` */
  private readonly crops: Map<string, CropData> = new Map();

  /** Índice secundário para mapear chave de chunk `chunkX,chunkY` para o conjunto de chaves de tiles com cultivo */
  private readonly chunkCropIndex: Map<string, Set<string>> = new Map();

  /**
   * Registra o plantio de uma cultura em uma coordenada de terreno.
   *
   * @param tileX Coordenada X inteira do tile
   * @param tileY Coordenada Y inteira do tile
   * @param cropId Identificador da cultura no CropRegistry
   * @param plantedAt Momento determinístico do plantio em segundos do mundo
   * @returns true se o plantio foi registrado com sucesso, false se já havia cultivo no local
   */
  public plantCrop(tileX: number, tileY: number, cropId: string, plantedAt: number): boolean {
    const normalizedX = Math.floor(tileX);
    const normalizedY = Math.floor(tileY);
    const coordKey = TileModificationRegistry.createCoordKey(normalizedX, normalizedY);

    if (this.crops.has(coordKey)) {
      return false;
    }

    const cropData: CropData = {
      cropId,
      tileX: normalizedX,
      tileY: normalizedY,
      plantedAt,
    };

    this.crops.set(coordKey, cropData);

    const chunkX = Math.floor(normalizedX / CHUNK_SIZE);
    const chunkY = Math.floor(normalizedY / CHUNK_SIZE);
    const chunkKey = TileModificationRegistry.createChunkKey(chunkX, chunkY);

    let cropSet = this.chunkCropIndex.get(chunkKey);
    if (!cropSet) {
      cropSet = new Set();
      this.chunkCropIndex.set(chunkKey, cropSet);
    }
    cropSet.add(coordKey);

    return true;
  }

  /**
   * Registra a rega de um cultivo no mundo, atualizando o estado de rega e acumulando o tempo determinístico.
   *
   * @param tileX Coordenada X inteira do tile
   * @param tileY Coordenada Y inteira do tile
   * @param wateredAt Timestamp do mundo no instante da rega
   * @returns true se o cultivo existia e foi regado com sucesso, false caso contrário
   */
  public waterCrop(tileX: number, tileY: number, wateredAt: number): boolean {
    const normalizedX = Math.floor(tileX);
    const normalizedY = Math.floor(tileY);
    const coordKey = TileModificationRegistry.createCoordKey(normalizedX, normalizedY);

    const existing = this.crops.get(coordKey);
    if (!existing) {
      return false;
    }

    // Se já estava regado anteriormente, acumula o período ativo anterior de forma idempotente e determinística
    let accumulated = existing.wateredTimeAccumulated ?? 0;
    if (existing.watered && existing.lastWateredAt !== undefined && wateredAt > existing.lastWateredAt) {
      accumulated += Math.max(0, wateredAt - existing.lastWateredAt);
    }

    const updatedCrop: CropData = {
      ...existing,
      watered: true,
      lastWateredAt: wateredAt,
      wateredTimeAccumulated: accumulated,
    };

    this.crops.set(coordKey, updatedCrop);
    return true;
  }

  /**
   * Remove o estado de rega de um cultivo (ex: solo perde umidade ou teste determinístico de seca),
   * congelando o tempo de crescimento no total acumulado até o instante driedAt.
   */
  public dryCrop(tileX: number, tileY: number, driedAt: number): boolean {
    const normalizedX = Math.floor(tileX);
    const normalizedY = Math.floor(tileY);
    const coordKey = TileModificationRegistry.createCoordKey(normalizedX, normalizedY);

    const existing = this.crops.get(coordKey);
    if (!existing || !existing.watered) {
      return false;
    }

    const waterStart = existing.lastWateredAt ?? existing.plantedAt;
    const addedTime = Math.max(0, driedAt - waterStart);

    const updatedCrop: CropData = {
      ...existing,
      watered: false,
      lastWateredAt: undefined,
      wateredTimeAccumulated: (existing.wateredTimeAccumulated ?? 0) + addedTime,
    };

    this.crops.set(coordKey, updatedCrop);
    return true;
  }

  /**
   * Consulta se o cultivo em determinado tile está atualmente no estado regado (watered).
   * Custo O(1), sem materializar chunks.
   */
  public isWatered(tileX: number, tileY: number): boolean {
    const crop = this.getCrop(tileX, tileY);
    return crop ? crop.watered === true : false;
  }

  /**
   * Remove o cultivo de uma coordenada de terreno (ex: colheita futura ou remoção).
   */
  public removeCrop(tileX: number, tileY: number): boolean {
    const normalizedX = Math.floor(tileX);
    const normalizedY = Math.floor(tileY);
    const coordKey = TileModificationRegistry.createCoordKey(normalizedX, normalizedY);

    const existed = this.crops.delete(coordKey);
    if (existed) {
      const chunkX = Math.floor(normalizedX / CHUNK_SIZE);
      const chunkY = Math.floor(normalizedY / CHUNK_SIZE);
      const chunkKey = TileModificationRegistry.createChunkKey(chunkX, chunkY);
      const cropSet = this.chunkCropIndex.get(chunkKey);
      if (cropSet) {
        cropSet.delete(coordKey);
        if (cropSet.size === 0) {
          this.chunkCropIndex.delete(chunkKey);
        }
      }
    }
    return existed;
  }

  /**
   * Consulta se existe um cultivo ativo na coordenada de terreno informada.
   * Custo O(1), sem materializar chunks.
   */
  public hasCrop(tileX: number, tileY: number): boolean {
    const coordKey = TileModificationRegistry.createCoordKey(tileX, tileY);
    return this.crops.has(coordKey);
  }

  /**
   * Retorna os dados do cultivo ativo na coordenada, ou null caso não haja cultivo.
   * Custo O(1), sem materializar chunks.
   */
  public getCrop(tileX: number, tileY: number): CropData | null {
    const coordKey = TileModificationRegistry.createCoordKey(tileX, tileY);
    return this.crops.get(coordKey) ?? null;
  }

  /**
   * Retorna o estágio determinístico de crescimento de um cultivo no instante fornecido.
   * Retorna 0 caso não haja cultivo ou caso a cultura não seja encontrada.
   */
  public getGrowthStage(tileX: number, tileY: number, currentWorldTime: number): number {
    const crop = this.getCrop(tileX, tileY);
    if (!crop) {
      return 0;
    }
    const def = CropRegistry.get(crop.cropId);
    if (!def) {
      return 0;
    }
    return calculateCropGrowthStage(crop, def, currentWorldTime);
  }

  /**
   * Verifica se o cultivo no tile indicado atingiu o estágio maduro.
   */
  public isMature(tileX: number, tileY: number, currentWorldTime: number): boolean {
    const crop = this.getCrop(tileX, tileY);
    if (!crop) {
      return false;
    }
    const def = CropRegistry.get(crop.cropId);
    if (!def) {
      return false;
    }
    return isCropMature(crop, def, currentWorldTime);
  }

  /**
   * Retorna todos os cultivos presentes em um chunk específico.
   * Permite renderização imediata sem percorrer o mundo todo.
   */
  public getCropsInChunk(chunkX: number, chunkY: number): readonly CropData[] {
    const chunkKey = TileModificationRegistry.createChunkKey(chunkX, chunkY);
    const coordKeys = this.chunkCropIndex.get(chunkKey);
    if (!coordKeys || coordKeys.size === 0) {
      return [];
    }

    const result: CropData[] = [];
    for (const key of coordKeys) {
      const crop = this.crops.get(key);
      if (crop) {
        result.push(crop);
      }
    }
    return result;
  }

  /**
   * Retorna uma lista de todos os cultivos ativos registrados.
   */
  public getAllCrops(): readonly CropData[] {
    return Array.from(this.crops.values());
  }

  /**
   * Retorna o total de cultivos ativos globalmente.
   */
  public getCropCount(): number {
    return this.crops.size;
  }

  /**
   * Limpa todos os cultivos registrados (útil para testes isolados e redefinição de mundo).
   */
  public clear(): void {
    this.crops.clear();
    this.chunkCropIndex.clear();
  }
}
