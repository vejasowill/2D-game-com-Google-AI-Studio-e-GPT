import { PLAYER_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { ChunkStreamingSystem } from './ChunkStreamingSystem.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { GameLoop } from './GameLoop.ts';
import { Input } from './Input.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { Player } from './Player.ts';
import { Renderer } from './Renderer.ts';
import { TestToggleObject } from './TestToggleObject.ts';
import { World } from './World.ts';

export class Game {
  private world: World;
  private camera: Camera;
  private player: Player;
  private input: Input;
  private collisionSystem: CollisionSystem;
  private streamingSystem: ChunkStreamingSystem;
  private interactionSystem: InteractionSystem;
  private renderer: Renderer;
  private loop: GameLoop;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // 1. Instanciar o World (dados dos tiles e autoridade de chunks)
    this.world = new World();

    // Inicializar o registro central de itens declarativos
    ItemRegistry.ensureInitialized();

    // 2. Instanciar o sistema de colisão espacial baseado no World
    this.collisionSystem = new CollisionSystem(this.world);

    // 3. Obter a posição inicial segura para o Player sobre terreno caminhável próximo ao centro
    const initialPlayerPosition = this.world.getSafeSpawnWorldPosition(PLAYER_SIZE);
    this.player = new Player(initialPlayerPosition);

    // 4. Instanciar o subsistema de streaming espacial de chunks ao redor do Player
    this.streamingSystem = new ChunkStreamingSystem(this.world);
    // Carga inicial dos chunks ao redor da posição de spawn do Player
    this.streamingSystem.forceUpdate(this.player.position);

    // 5. Instanciar o sistema genérico de interação desacoplado
    this.interactionSystem = new InteractionSystem();

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
  }

  public getInteractionSystem(): InteractionSystem {
    return this.interactionSystem;
  }

  public getWorld(): World {
    return this.world;
  }

  public getPlayer(): Player {
    return this.player;
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

    // 6. Limpar estado transitório de teclas pressionadas no frame (ação discreta)
    this.input.clearFrameState();

    // 7. Atualizar a Camera acompanhando a posição do Player no espaço infinito do mundo com suavização visual
    const playerCenter = this.player.getCenter();
    this.camera.follow(playerCenter.worldX, playerCenter.worldY, deltaTime);
  }

  private render(): void {
    // Renderiza o mundo, o jogador e os prompts/debug de interação através da câmera no canvas
    this.renderer.render(this.world, this.camera, this.player, this.interactionSystem);
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
}
