import { ChunkManager } from './ChunkManager.ts';
import { Chunk } from './Chunk.ts';
import { Biome } from './Biome.ts';
import { BiomeVisualRegistry, TerrainVisualDefinition } from './BiomeVisualRegistry.ts';
import { DEFAULT_WORLD_SEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { CropData } from './CropState.ts';
import { CropSystem } from './CropSystem.ts';
import { DestroyedNaturalObjectRegistry } from './DestroyedNaturalObjectRegistry.ts';
import { ItemDropObject } from './ItemDropObject.ts';
import { ModifyTileMutation, WorldMutation } from './InteractionTypes.ts';
import { NaturalObject } from './NaturalObjectDefinition.ts';
import { NaturalObjectGenerator } from './NaturalObjectGenerator.ts';
import { isTemporaryWorldObject } from './TemporaryWorldObject.ts';
import { TemporaryObjectSystem } from './TemporaryObjectSystem.ts';
import { TimeSystem } from './TimeSystem.ts';
import { TimeSystemConfig } from './GameTime.ts';
import { TileModificationRegistry } from './TileModificationRegistry.ts';
import { TileModificationResult, TileOperationContext } from './TileModificationTypes.ts';
import { TileRegistry } from './TileRegistry.ts';
import { EnvironmentalData, Tile, TileCoord, TileType, WorldCoord } from './types.ts';
import { WorldGenerator } from './WorldGenerator.ts';
import { WorldMutationHandler } from './WorldMutationHandler.ts';
import { WorldObject } from './WorldObject.ts';
import { WorldObjectManager } from './WorldObjectManager.ts';

export class World {
  private readonly worldGenerator: WorldGenerator;
  private readonly chunkManager: ChunkManager;
  private readonly objectManager: WorldObjectManager;
  private readonly temporaryObjectSystem: TemporaryObjectSystem;
  private readonly destroyedNaturalObjectRegistry: DestroyedNaturalObjectRegistry;
  private readonly tileModificationRegistry: TileModificationRegistry;
  private readonly cropSystem: CropSystem;
  private readonly timeSystem: TimeSystem;

  constructor(
    seed: number = DEFAULT_WORLD_SEED,
    timeSystemOrConfig?: TimeSystem | TimeSystemConfig,
  ) {
    this.worldGenerator = new WorldGenerator(seed);
    this.chunkManager = new ChunkManager(this.worldGenerator);
    this.objectManager = new WorldObjectManager();
    this.timeSystem =
      timeSystemOrConfig instanceof TimeSystem
        ? timeSystemOrConfig
        : new TimeSystem(timeSystemOrConfig);
    this.temporaryObjectSystem = new TemporaryObjectSystem(this.timeSystem.getTotalElapsedSeconds());
    this.destroyedNaturalObjectRegistry = new DestroyedNaturalObjectRegistry();
    this.tileModificationRegistry = new TileModificationRegistry();
    this.cropSystem = new CropSystem();

    // Integrar o ciclo de vida do WorldObjectManager com o TemporaryObjectSystem
    this.objectManager.setListener({
      onObjectAdded: (object: WorldObject) => {
        if (isTemporaryWorldObject(object)) {
          this.temporaryObjectSystem.register(object);
        }
      },
      onObjectRemoved: (objectId: string) => {
        this.temporaryObjectSystem.unregister(objectId);
      },
    });

    // Sincronizar o ciclo de vida dos chunks do terreno:
    // 1. Modificações persistentes de terreno (TileModificationRegistry) são restauradas no Chunk;
    // 2. Objetos procedurais naturais gerados pelo seed do terreno entram e saem na carga/descarga de chunks;
    // 3. Objetos marcados no DestroyedNaturalObjectRegistry são permanentemente ignorados e NÃO rematerializados;
    // 4. Entidades dinâmicas (drops, baús, construções) permanecem no WorldObjectManager com autoridade independente.
    this.chunkManager.setLifecycleListener({
      onChunkLoaded: (chunk: Chunk) => {
        // Reaplicar quaisquer modificações de terreno registradas para este chunk
        const modifications = this.tileModificationRegistry.getModificationsInChunk(
          chunk.coord.chunkX,
          chunk.coord.chunkY,
        );
        for (const mod of modifications) {
          const { localX, localY } = ChunkManager.globalTileToChunkCoord(mod.tileX, mod.tileY);
          chunk.setTile(localX, localY, mod.type);
        }

        // Adicionar objetos naturais não destruídos
        for (const obj of chunk.getNaturalObjects()) {
          if (!this.destroyedNaturalObjectRegistry.isDestroyedObject(obj)) {
            this.objectManager.addObject(obj);
          }
        }
      },
      onChunkUnloaded: (chunk: Chunk) => {
        for (const obj of chunk.getNaturalObjects()) {
          this.objectManager.removeObject(obj.id);
        }
      },
    });
  }

  /**
   * Atualiza a simulação do mundo com o deltaTime decorrido:
   * 1. Avança o subsistema de autoridade temporal desacoplada (TimeSystem);
   * 2. Processa o sistema de expiração de objetos temporários via Min-Heap sincronizado.
   */
  public update(deltaTime: number): void {
    this.timeSystem.update(deltaTime);
    this.temporaryObjectSystem.update(this, this.timeSystem.getLastDeltaSeconds());
  }

  /**
   * Retorna o tempo de simulação acumulado no mundo em segundos de forma determinística.
   */
  public getTime(): number {
    return this.timeSystem.getTotalElapsedSeconds();
  }

  /**
   * Retorna o subsistema desacoplado de gerenciamento temporal do mundo.
   */
  public getTimeSystem(): TimeSystem {
    return this.timeSystem;
  }

  /**
   * Ajusta o tempo de simulação do mundo de forma atômica (recursos determinísticos e testes).
   */
  public setTime(time: number): void {
    if (time >= 0) {
      this.timeSystem.setTime(time);
      this.temporaryObjectSystem.setTime(time);
    }
  }

  /**
   * Retorna o subsistema dedicado de gerenciamento de objetos temporários.
   */
  public getTemporaryObjectSystem(): TemporaryObjectSystem {
    return this.temporaryObjectSystem;
  }

  /**
   * Retorna o registro de objetos naturais destruídos permanentemente.
   */
  public getDestroyedNaturalObjectRegistry(): DestroyedNaturalObjectRegistry {
    return this.destroyedNaturalObjectRegistry;
  }

  /**
   * Retorna o registro de modificações de terreno do jogador.
   */
  public getTileModificationRegistry(): TileModificationRegistry {
    return this.tileModificationRegistry;
  }

  /**
   * Retorna a referência do sistema persistente de culturas agrícolas do mundo.
   */
  public getCropSystem(): CropSystem {
    return this.cropSystem;
  }

  /**
   * Verifica rapidamente se há uma cultura ativa plantada na célula especificada.
   * Custo O(1), sem materializar chunks.
   */
  public hasCropAt(tileX: number, tileY: number): boolean {
    return this.cropSystem.hasCrop(tileX, tileY);
  }

  /**
   * Retorna os dados do cultivo ativo na célula especificada, ou null caso não exista.
   * Custo O(1), sem materializar chunks.
   */
  public getCropAt(tileX: number, tileY: number): CropData | null {
    return this.cropSystem.getCrop(tileX, tileY);
  }

  /**
   * Retorna o estágio determinístico de crescimento do cultivo na célula especificada.
   */
  public getCropGrowthStage(tileX: number, tileY: number): number {
    return this.cropSystem.getGrowthStage(tileX, tileY, this.getTime());
  }

  /**
   * Verifica se o cultivo na célula especificada está regado.
   * Custo O(1), sem materializar chunks.
   */
  public isCropWatered(tileX: number, tileY: number): boolean {
    return this.cropSystem.isWatered(tileX, tileY);
  }

  /**
   * Rega o cultivo presente na célula especificada no instante atual do mundo.
   */
  public waterCrop(tileX: number, tileY: number): boolean {
    return this.cropSystem.waterCrop(tileX, tileY, this.getTime());
  }

  /**
   * Consulta o estado efetivo de um tile no mundo considerando as alterações do jogador.
   *
   * Resolução:
   * 1. Verifica se existe modificação persistente em TileModificationRegistry;
   * 2. Se existir, usa o tile modificado correspondente;
   * 3. Caso contrário, se o chunk estiver carregado, consulta o tile do chunk;
   * 4. Se o chunk não estiver carregado, consulta o WorldGenerator sem materializar chunks.
   *
   * Operação O(1), determinística e segura para leitura pura.
   */
  public getEffectiveTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    const modification = this.tileModificationRegistry.getModification(tileX, tileY);
    if (modification) {
      return { type: modification.type };
    }
    const loadedChunkTile = this.chunkManager.getLoadedTile(tileX, tileY);
    if (loadedChunkTile) {
      return loadedChunkTile;
    }
    return { type: this.worldGenerator.getTileTypeAt(tileX, tileY) };
  }

  /**
   * Consulta rápida se um objeto natural com o ID fornecido está destruído.
   * Não materializa chunks.
   */
  public isNaturalObjectDestroyed(objectId: string): boolean {
    return this.destroyedNaturalObjectRegistry.isDestroyed(objectId);
  }

  public getSeed(): number {
    return this.worldGenerator.seed;
  }

  /**
   * Retorna o gerador procedural subjacente.
   */
  public getWorldGenerator(): WorldGenerator {
    return this.worldGenerator;
  }

  /**
   * Consulta os dados ambientais (temperatura, umidade, elevação) para uma coordenada global.
   * Função pura e direta: NUNCA materializa ou aloca chunks no ChunkManager.
   */
  public getEnvironmentalDataAt(tileX: number, tileY: number): EnvironmentalData {
    return this.worldGenerator.getEnvironmentalDataAt(tileX, tileY);
  }

  /**
   * Consulta o bioma determinístico para uma coordenada global.
   * Função pura e direta: NUNCA materializa ou aloca chunks no ChunkManager.
   */
  public getBiomeAt(tileX: number, tileY: number): Biome {
    return this.worldGenerator.getBiomeAt(tileX, tileY);
  }

  /**
   * Resolve a aparência visual pura de um terreno a partir de sua coordenada global e de seu TileType físico.
   * Função pura e direta: NUNCA materializa ou aloca chunks no ChunkManager.
   *
   * Fluxo:
   * (tileX, tileY) -> Biome -> BiomeVisualRegistry.getVisual(biome, tileType) -> TerrainVisualDefinition
   */
  public getTerrainVisualAt(tileX: number, tileY: number, tileType: TileType): TerrainVisualDefinition {
    const biome = this.worldGenerator.getBiomeAt(tileX, tileY);
    return BiomeVisualRegistry.getVisual(biome, tileType);
  }

  /**
   * Retorna o gerenciador dedicado de WorldObjects (separado do terreno/tiles).
   */
  public getObjectManager(): WorldObjectManager {
    return this.objectManager;
  }

  /**
   * Retorna o gerador determinístico de objetos naturais associado ao World.
   */
  public getNaturalObjectGenerator(): NaturalObjectGenerator {
    return this.worldGenerator.getNaturalObjectGenerator();
  }

  /**
   * Consulta um objeto natural determinístico em uma coordenada global de tile.
   * Função pura: NUNCA materializa ou aloca chunks no ChunkManager.
   */
  public getNaturalObjectAt(tileX: number, tileY: number): NaturalObject | null {
    return this.worldGenerator.getNaturalObjectGenerator().getNaturalObjectAt(tileX, tileY);
  }

  /**
   * Consulta o valor de densidade ecológica [0, 1) em uma coordenada global de tile.
   * Função pura: NUNCA materializa ou aloca chunks no ChunkManager.
   */
  public getEcologicalDensityAt(tileX: number, tileY: number): number {
    return this.worldGenerator.getNaturalObjectGenerator().getDensityAt(tileX, tileY);
  }

  /**
   * Consulta um tile global em qualquer coordenada espacial inteira (positiva, negativa ou distante).
   * O ChunkManager carrega/gera o chunk sob demanda de forma determinística.
   */
  public getTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    const modification = this.tileModificationRegistry.getModification(tileX, tileY);
    if (modification) {
      return { type: modification.type };
    }
    return this.chunkManager.getTile(tileX, tileY);
  }

  /**
   * Consulta um tile global SOMENTE se o chunk correspondente já estiver carregado na memória.
   * NUNCA gera um novo chunk. Retorna null caso o chunk ainda não esteja carregado.
   * Utilizado pelo Renderer e pelo CollisionSystem para leitura pura sem causar geração acidental.
   */
  public getLoadedTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const chunk = this.chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    if (!chunk) {
      return null;
    }
    const modification = this.tileModificationRegistry.getModification(tileX, tileY);
    if (modification) {
      return { type: modification.type };
    }
    return chunk.getTile(localX, localY);
  }

  /**
   * Retorna o ChunkManager subjacente para subsistemas dedicados (como ChunkStreamingSystem).
   */
  public getChunkManager(): ChunkManager {
    return this.chunkManager;
  }

  /**
   * Retorna a quantidade de chunks atualmente carregados na memória.
   */
  public getLoadedChunkCount(): number {
    return this.chunkManager.getLoadedChunkCount();
  }

  /**
   * Define o tipo de tile em uma coordenada global.
   * Registra a alteração no TileModificationRegistry e atualiza o Chunk correspondente.
   */
  public setTile(tileX: number, tileY: number, type: TileType): boolean {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return false;
    }
    this.tileModificationRegistry.registerModification({
      tileX,
      tileY,
      type,
      modifiedAt: this.getTime(),
    });
    return this.chunkManager.setTile(tileX, tileY, type);
  }

  /**
   * Aplica diretamente uma modificação de terreno no registro persistente.
   * Se o chunk correspondente estiver carregado na memória, atualiza seu estado sem forçar
   * a geração de chunks ainda não carregados.
   */
  public applyTileModification(tileX: number, tileY: number, type: TileType, previousType?: TileType): boolean {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return false;
    }
    this.tileModificationRegistry.registerModification({
      tileX,
      tileY,
      type,
      previousType,
      modifiedAt: this.getTime(),
    });
    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const loadedChunk = this.chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    if (loadedChunk) {
      loadedChunk.setTile(localX, localY, type);
    }
    return true;
  }

  /**
   * Modifica o tipo de um tile no mundo, registrando a alteração no TileModificationRegistry.
   */
  public modifyTile(tileX: number, tileY: number, newTileType: TileType, previousTileType?: TileType): boolean {
    return this.applyTileModification(tileX, tileY, newTileType, previousTileType);
  }

  /**
   * Restaura uma modificação de terreno realizada pelo jogador, retornando a célula ao seu estado anterior.
   * Se o estado restaurado for idêntico ao terreno procedural natural, remove a modificação para liberar memória;
   * caso contrário, preserva a modificação prévia para garantir consistência mesmo após unload/reload.
   */
  public restoreTileModification(tileX: number, tileY: number): boolean {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return false;
    }
    const modification = this.tileModificationRegistry.getModification(tileX, tileY);
    if (!modification) {
      return false;
    }
    const proceduralType = this.worldGenerator.getTileTypeAt(tileX, tileY);
    const restoredType = modification.previousType ?? proceduralType;

    if (restoredType === proceduralType) {
      this.tileModificationRegistry.removeModification(tileX, tileY);
    } else {
      this.tileModificationRegistry.registerModification({
        tileX,
        tileY,
        type: restoredType,
        modifiedAt: this.getTime(),
      });
    }

    const { chunkCoord, localX, localY } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    const loadedChunk = this.chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    if (loadedChunk) {
      loadedChunk.setTile(localX, localY, restoredType);
    }
    return true;
  }

  /**
   * Operação genérica de remoção / alteração de terreno.
   * Não possui acoplamento com ferramentas concretas (machado, picareta, pá),
   * atuando como contrato declarativo universal para mutação de tiles.
   */
  public removeTile(
    tileX: number,
    tileY: number,
    context?: TileOperationContext,
  ): TileModificationResult {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return {
        success: false,
        tileX,
        tileY,
        previousTile: null,
        newTile: null,
        failureReason: 'INVALID_COORDINATES',
      };
    }

    const currentTile = this.getEffectiveTile(tileX, tileY);
    if (!currentTile) {
      return {
        success: false,
        tileX,
        tileY,
        previousTile: null,
        newTile: null,
        failureReason: 'TILE_NOT_FOUND',
      };
    }

    // 1. Validação de alcance se especificado
    if (context?.sourcePosition && context.maxRange !== undefined) {
      const tileCenterWorldX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const tileCenterWorldY = tileY * TILE_SIZE + TILE_SIZE / 2;
      const distance = Math.hypot(
        tileCenterWorldX - context.sourcePosition.worldX,
        tileCenterWorldY - context.sourcePosition.worldY,
      );
      if (distance > context.maxRange) {
        return {
          success: false,
          tileX,
          tileY,
          previousTile: currentTile,
          newTile: null,
          failureReason: 'OUT_OF_RANGE',
        };
      }
    }

    // 2. Validação customizada via predicado
    if (context?.canRemovePredicate && !context.canRemovePredicate(currentTile, tileX, tileY)) {
      return {
        success: false,
        tileX,
        tileY,
        previousTile: currentTile,
        newTile: null,
        failureReason: 'REMOVAL_PREVENTED_BY_PREDICATE',
      };
    }

    // 3. Determinar o tipo de tile resultante
    let targetType: TileType;
    if (context?.replacementTileType) {
      targetType = context.replacementTileType;
    } else if (currentTile.type === TileType.WATER || currentTile.type === TileType.EMPTY) {
      // Se era um tile bloqueante (água/vazio), a ação de remoção/limpeza torna-o caminhável (GRASS)
      targetType = TileType.GRASS;
    } else {
      // Se era um tile caminhável (GRASS), a remoção escava/esvazia para EMPTY
      targetType = TileType.EMPTY;
    }

    // 4. Impedir modificação redundante para o mesmo estado
    if (currentTile.type === targetType) {
      return {
        success: false,
        tileX,
        tileY,
        previousTile: currentTile,
        newTile: null,
        failureReason: 'ALREADY_IN_TARGET_STATE',
      };
    }

    // 5. Construir as mutações de mundo declarativas
    const tileMutation: ModifyTileMutation = {
      type: 'modify_tile',
      tileX,
      tileY,
      newTileType: targetType,
      previousTileType: currentTile.type,
    };
    const mutations: WorldMutation[] = [tileMutation];

    // 6. Criar drops declarativos se configurados
    if (context?.drops && context.drops.length > 0 && !context.skipWorldDropSpawn) {
      for (const drop of context.drops) {
        const dropObj = new ItemDropObject(
          `drop:tile:${tileX}:${tileY}:${drop.itemId}:${Math.floor(this.getTime() * 1000)}`,
          {
            worldX: tileX * TILE_SIZE + (TILE_SIZE - 16) / 2,
            worldY: tileY * TILE_SIZE + (TILE_SIZE - 16) / 2,
          },
          drop.itemId,
          drop.quantity,
          16,
          16,
          this.getTime(),
        );
        mutations.push({
          type: 'create_object',
          object: dropObj,
        });
      }
    }

    // 7. Aplicar as mutações de forma consistente
    this.applyTileModification(tileX, tileY, targetType);

    // Se houver drops no mundo, aplicar as mutações de objeto via WorldMutationHandler
    if (mutations.length > 1) {
      for (let i = 1; i < mutations.length; i++) {
        WorldMutationHandler.applyMutation(this, mutations[i]);
      }
    }

    return {
      success: true,
      tileX,
      tileY,
      previousTile: currentTile,
      newTile: { type: targetType },
      drops: context?.drops,
      mutations,
    };
  }

  /**
   * O espaço do World é ilimitado em coordenadas de grade; qualquer par de inteiros é uma coordenada válida.
   */
  public isValidTileCoord(tileX: number, tileY: number): boolean {
    return Number.isInteger(tileX) && Number.isInteger(tileY);
  }

  public isValidCoord(tileX: number, tileY: number): boolean {
    return this.isValidTileCoord(tileX, tileY);
  }

  /**
   * O World é ilimitado e não possui bordas globais finitas.
   */
  public hasBounds(): boolean {
    return false;
  }

  /**
   * Localiza a coordenada de tile caminhável mais próxima a partir de um ponto de referência global (padrão: 0, 0).
   * Consulta a função pura WorldGenerator.getTileTypeAt diretamente para não materializar chunks na memória.
   * Executa busca em anéis concêntricos determinísticos ao redor da origem.
   */
  public findNearestWalkableTile(
    startTileX: number = 0,
    startTileY: number = 0,
  ): TileCoord {
    const isWalkable = (tx: number, ty: number): boolean => {
      // Consulta direta e pura ao WorldGenerator (sem instanciar chunks no ChunkManager)
      const tileType = this.worldGenerator.getTileTypeAt(tx, ty);
      const def = TileRegistry.get(tileType);
      return def.walkable;
    };

    if (isWalkable(startTileX, startTileY)) {
      return { tileX: startTileX, tileY: startTileY };
    }

    // Busca concêntrica determinística em anéis
    const maxSearchRadius = 128;
    for (let radius = 1; radius <= maxSearchRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
            continue;
          }
          const tx = startTileX + dx;
          const ty = startTileY + dy;
          if (isWalkable(tx, ty)) {
            return { tileX: tx, tileY: ty };
          }
        }
      }
    }

    return { tileX: startTileX, tileY: startTileY };
  }

  /**
   * Retorna a posição inicial segura para o Player no espaço contínuo do mundo (pixels),
   * centralizado dentro de um tile garantidamente caminhável próximo à origem (0,0).
   */
  public getSafeSpawnWorldPosition(entitySize: number = PLAYER_SIZE): WorldCoord {
    const spawnTile = this.findNearestWalkableTile(0, 0);
    const tileWorld = this.tileToWorld(spawnTile);
    return {
      worldX: tileWorld.worldX + (TILE_SIZE - entitySize) / 2,
      worldY: tileWorld.worldY + (TILE_SIZE - entitySize) / 2,
    };
  }

  /**
   * Conversão explícita: Coordenadas de Tile -> Coordenadas de Mundo (pixels).
   */
  public tileToWorld(tileCoord: TileCoord): WorldCoord {
    return {
      worldX: tileCoord.tileX * TILE_SIZE,
      worldY: tileCoord.tileY * TILE_SIZE,
    };
  }

  /**
   * Conversão explícita: Coordenadas de Mundo (pixels) -> Coordenadas de Tile.
   */
  public worldToTile(worldCoord: WorldCoord): TileCoord {
    return {
      tileX: Math.floor(worldCoord.worldX / TILE_SIZE),
      tileY: Math.floor(worldCoord.worldY / TILE_SIZE),
    };
  }
}


