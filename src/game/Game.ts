import { PLAYER_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { ChunkStreamingSystem } from './ChunkStreamingSystem.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { GameLoop } from './GameLoop.ts';
import { Input } from './Input.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { PlaceTileSystem } from './PlaceTileSystem.ts';
import { BreakTileSystem } from './BreakTileSystem.ts';
import { PlaceableTileRegistry } from './PlaceableTileRegistry.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { SoilRegistry } from './SoilState.ts';
import { Player } from './Player.ts';
import { Renderer } from './Renderer.ts';
import { TestToggleObject } from './TestToggleObject.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { World } from './World.ts';

export class Game {
  private world: World;
  private camera: Camera;
  private player: Player;
  private input: Input;
  private collisionSystem: CollisionSystem;
  private streamingSystem: ChunkStreamingSystem;
  private interactionSystem: InteractionSystem;
  private itemUseSystem: ItemUseSystem;
  private placeTileSystem: PlaceTileSystem;
  private breakTileSystem: BreakTileSystem;
  private tileSelectionSystem: TileSelectionSystem;
  private renderer: Renderer;
  private loop: GameLoop;
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize: (() => void) | null = null;
  private handlePointerDown: ((event: PointerEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // 1. Instanciar o World (dados dos tiles e autoridade de chunks)
    this.world = new World();

    // Inicializar o registro central de itens declarativos
    ItemRegistry.ensureInitialized();
    ToolRegistry.ensureInitialized();

    // 2. Instanciar o sistema de colisão espacial baseado no World
    this.collisionSystem = new CollisionSystem(this.world);

    // 3. Obter a posição inicial segura para o Player sobre terreno caminhável próximo ao centro
    const initialPlayerPosition = this.world.getSafeSpawnWorldPosition(PLAYER_SIZE);
    this.player = new Player(initialPlayerPosition);
    // Equipar machado e enxada iniciais nos primeiros slots para demonstrar uso de ferramentas
    this.player.inventory.addItemStack(createItemStack('axe', 1));
    this.player.inventory.addItemStack(createItemStack('hoe', 1));

    // 4. Instanciar o subsistema de streaming espacial de chunks ao redor do Player
    this.streamingSystem = new ChunkStreamingSystem(this.world);
    // Carga inicial dos chunks ao redor da posição de spawn do Player
    this.streamingSystem.forceUpdate(this.player.position);

    // 5. Instanciar o sistema genérico de interação desacoplado, o sistema de uso de itens, colocação de blocos e seleção de tiles
    this.interactionSystem = new InteractionSystem();
    this.itemUseSystem = new ItemUseSystem();
    this.placeTileSystem = new PlaceTileSystem();
    this.breakTileSystem = new BreakTileSystem();
    this.tileSelectionSystem = new TileSelectionSystem();

    PlaceableTileRegistry.ensureInitialized();
    SoilRegistry.ensureInitialized();

    // Adicionar um objeto interativo demonstrativo técnico e limpo (TestToggleObject) próximo ao spawn
    const demoToggleBeacon = new TestToggleObject(
      'demo_beacon',
      {
        worldX: initialPlayerPosition.worldX + 48,
        worldY: initialPlayerPosition.worldY,
      },
      false, // Inicialmente OFF
      24,
      24,
    );
    this.world.getObjectManager().addObject(demoToggleBeacon);

    // 6. Instanciar a Camera centralizada no Player
    const playerCenter = this.player.getCenter();
    this.camera = new Camera(playerCenter.worldX, playerCenter.worldY);

    // 7. Instanciar o subsistema de Input
    this.input = new Input();

    // 8. Instanciar o Renderer gráfico (somente leitura de chunks carregados)
    this.renderer = new Renderer(canvas);

    // 9. Instanciar o GameLoop
    this.loop = new GameLoop({
      update: (dt: number) => this.update(dt),
      render: () => this.render(),
    });

    this.setupResize(canvas);
    this.setupPointerInput(canvas);
  }

  public getInteractionSystem(): InteractionSystem {
    return this.interactionSystem;
  }

  public getItemUseSystem(): ItemUseSystem {
    return this.itemUseSystem;
  }

  public getInput(): Input {
    return this.input;
  }

  public getRenderer(): Renderer {
    return this.renderer;
  }

  public getWorld(): World {
    return this.world;
  }

  public getPlayer(): Player {
    return this.player;
  }

  public getTileSelectionSystem(): TileSelectionSystem {
    return this.tileSelectionSystem;
  }

  public getPlaceTileSystem(): PlaceTileSystem {
    return this.placeTileSystem;
  }

  public getBreakTileSystem(): BreakTileSystem {
    return this.breakTileSystem;
  }

  public start(): void {
    this.loop.start();
  }

  public stop(): void {
    this.loop.stop();
  }

  public destroy(): void {
    this.stop();

    this.input.destroy();

    if (this.handlePointerDown) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.handlePointerDown = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.handleWindowResize) {
      window.removeEventListener('resize', this.handleWindowResize);
      this.handleWindowResize = null;
    }
  }

  private update(deltaTime: number): void {
    // Ordem arquitetural estrita:
    // Input -> Player.update -> Streaming / World -> InteractionSystem.update -> Camera.update -> Renderer.render

    // 1. Assegurar que os chunks da posição atual do Player estejam preparados no ChunkStreamingSystem
    this.streamingSystem.update(this.player.position);

    // 2. Atualizar o Player com o estado do Input, deltaTime e resolução de colisão pelo CollisionSystem
    this.player.update(deltaTime, this.input, this.collisionSystem);

    // 3. Se o deslocamento do Player cruzou uma fronteira de chunk, preparar os novos chunks imediatamente
    this.streamingSystem.update(this.player.position);

    // 4. Atualizar o relógio e a expiração de objetos temporários do mundo
    this.world.update(deltaTime);

    // 5. Executar o sistema de interação (busca determinística e execução de ação discreta se acionada)
    this.interactionSystem.update(this.player, this.world, this.input, deltaTime);

    // 6. Executar o sistema genérico de uso de ferramentas e itens equipados
    this.itemUseSystem.update(
      this.player,
      this.world,
      this.input,
      deltaTime,
      this.tileSelectionSystem,
    );

    // 6.5. Executar o sistema genérico de colocação de blocos (PLACE)
    this.placeTileSystem.update(
      this.player,
      this.world,
      this.input,
      this.tileSelectionSystem,
      deltaTime,
    );

    // 6.6. Executar o sistema genérico de quebra/remoção de blocos colocados (BREAK)
    this.breakTileSystem.update(
      this.player,
      this.world,
      this.input,
      this.tileSelectionSystem,
      deltaTime,
    );

    // 7. Limpar estado transitório de teclas pressionadas no frame (ação discreta)
    this.input.clearFrameState();

    // 8. Atualizar a Camera acompanhando a posição do Player no espaço infinito do mundo com suavização visual
    const playerCenter = this.player.getCenter();
    this.camera.follow(playerCenter.worldX, playerCenter.worldY, deltaTime);
  }

  private render(): void {
    // Renderiza o mundo, o jogador e os prompts/debug de interação e ferramentas através da câmera no canvas
    this.renderer.render(
      this.world,
      this.camera,
      this.player,
      this.interactionSystem,
      this.itemUseSystem,
      this.tileSelectionSystem,
    );
  }

  private setupResize(canvas: HTMLCanvasElement): void {
    this.handleWindowResize = () => {
      this.renderer.resize();
    };
    window.addEventListener('resize', this.handleWindowResize);

    if (canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        this.renderer.resize();
      });
      this.resizeObserver.observe(canvas.parentElement);
    }
  }

  private setupPointerInput(canvas: HTMLCanvasElement): void {
    this.handlePointerDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const viewport = this.renderer.getViewportSize();
      const screenX = (event.clientX - rect.left) * (viewport.width / rect.width);
      const screenY = (event.clientY - rect.top) * (viewport.height / rect.height);
      const clickedSlot = this.renderer.getHotbarSlotAt(screenX, screenY, this.player);

      if (clickedSlot !== null) {
        this.player.hotbar.setSelectedSlot(clickedSlot);
      } else {
        // Seleção de célula do terreno (toque no mobile ou clique no desktop)
        const selectedTile = this.tileSelectionSystem.screenToTileCoord(
          { screenX, screenY },
          viewport,
          this.camera,
          this.world,
        );
        this.tileSelectionSystem.selectTile(selectedTile);
      }
    };

    canvas.addEventListener('pointerdown', this.handlePointerDown);
  }
}
