import { ChunkManager } from './ChunkManager.ts';
import { Chunk } from './Chunk.ts';
import { Biome } from './Biome.ts';
import { BiomeVisualRegistry, TerrainVisualDefinition } from './BiomeVisualRegistry.ts';
import { DEFAULT_WORLD_SEED, PLAYER_SIZE, TILE_SIZE } from './constants.ts';
import { DestroyedNaturalObjectRegistry } from './DestroyedNaturalObjectRegistry.ts';
import { NaturalObject } from './NaturalObjectDefinition.ts';
import { NaturalObjectGenerator } from './NaturalObjectGenerator.ts';
import { isTemporaryWorldObject } from './TemporaryWorldObject.ts';
import { TemporaryObjectSystem } from './TemporaryObjectSystem.ts';
import { TileRegistry } from './TileRegistry.ts';
import { EnvironmentalData, Tile, TileCoord, TileType, WorldCoord } from './types.ts';
import { WorldGenerator } from './WorldGenerator.ts';
import { WorldObject } from './WorldObject.ts';
import { WorldObjectManager } from './WorldObjectManager.ts';

export class World {
  private readonly worldGenerator: WorldGenerator;
  private readonly chunkManager: ChunkManager;
  private readonly objectManager: WorldObjectManager;
  private readonly temporaryObjectSystem: TemporaryObjectSystem;
  private readonly destroyedNaturalObjectRegistry: DestroyedNaturalObjectRegistry;
  private worldTime: number = 0;

  constructor(seed: number = DEFAULT_WORLD_SEED) {
    this.worldGenerator = new WorldGenerator(seed);
    this.chunkManager = new ChunkManager(this.worldGenerator);
    this.objectManager = new WorldObjectManager();
    this.temporaryObjectSystem = new TemporaryObjectSystem(this.worldTime);
    this.destroyedNaturalObjectRegistry = new DestroyedNaturalObjectRegistry();

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

    // Sincronizar o ciclo de vida dos chunks do terreno com o WorldObjectManager:
    // Apenas objetos procedurais naturais gerados pelo seed do terreno entram e saem na carga/descarga de chunks.
    // Objetos marcados no DestroyedNaturalObjectRegistry são permanentemente ignorados e NÃO rematerializados.
    // Entidades dinâmicas (drops, baús, construções) permanecem no WorldObjectManager com autoridade independente.
    this.chunkManager.setLifecycleListener({
      onChunkLoaded: (chunk: Chunk) => {
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
   * 1. Avança o relógio monotônico de simulação do mundo;
   * 2. Processa o sistema de expiração de objetos temporários via Min-Heap.
   */
  public update(deltaTime: number): void {
    if (deltaTime > 0) {
      this.worldTime += deltaTime;
    }
    this.temporaryObjectSystem.update(this, deltaTime);
  }

  /**
   * Retorna o tempo de simulação acumulado no mundo em segundos.
   */
  public getTime(): number {
    return this.worldTime;
  }

  /**
   * Ajusta o tempo de simulação do mundo de forma atômica (recursos determinísticos e testes).
   */
  public setTime(time: number): void {
    if (time >= 0) {
      this.worldTime = time;
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
    return this.chunkManager.getTile(tileX, tileY);
  }

  /**
   * Consulta um tile global SOMENTE se o chunk correspondente já estiver carregado na memória.
   * NUNCA gera um novo chunk. Retorna null caso o chunk ainda não esteja carregado.
   * Utilizado pelo Renderer para garantir leitura pura sem causar geração acidental.
   */
  public getLoadedTile(tileX: number, tileY: number): Tile | null {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return null;
    }
    return this.chunkManager.getLoadedTile(tileX, tileY);
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
   */
  public setTile(tileX: number, tileY: number, type: TileType): boolean {
    if (!this.isValidTileCoord(tileX, tileY)) {
      return false;
    }
    return this.chunkManager.setTile(tileX, tileY, type);
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


