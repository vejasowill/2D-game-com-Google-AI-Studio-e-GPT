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
import { CropRegistry } from './CropRegistry.ts';
import { PlantCropSystem } from './PlantCropSystem.ts';
import { WateringSystem } from './WateringSystem.ts';
import { HarvestSystem } from './HarvestSystem.ts';
import { TimeSystem } from './TimeSystem.ts';
import { RestSystem } from './RestSystem.ts';
import { calculateHudState, HudState } from './HudState.ts';
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
  private plantCropSystem: PlantCropSystem;
  private wateringSystem: WateringSystem;
  private harvestSystem: HarvestSystem;
  private restSystem: RestSystem;
  private renderer: Renderer;
  private loop: GameLoop;
  private canvas: HTMLCanvasElement;
  private isInventoryOpen: boolean = false;
  private draggedSlotIndex: number | null = null;
  private dragPos: { x: number; y: number } | null = null;
  private hoveredSlotIndex: number | null = null;
  private selectedInventorySlotIndex: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private handleWindowResize: (() => void) | null = null;
  private handlePointerDown: ((event: PointerEvent) => void) | null = null;
  private handlePointerMove: ((event: PointerEvent) => void) | null = null;
  private handlePointerUp: ((event: PointerEvent) => void) | null = null;
  private handlePointerCancel: ((event: PointerEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // 1. Instanciar o World (dados dos tiles e autoridade de chunks)
    this.world = new World();

    // Inicializar os registros centrais declarativos
    ItemRegistry.ensureInitialized();
    ToolRegistry.ensureInitialized();
    CropRegistry.ensureInitialized();

    // 2. Instanciar o sistema de colisão espacial baseado no World
    this.collisionSystem = new CollisionSystem(this.world);

    // 3. Obter a posição inicial segura para o Player sobre terreno caminhável próximo ao centro
    const initialPlayerPosition = this.world.getSafeSpawnWorldPosition(PLAYER_SIZE);
    this.player = new Player(initialPlayerPosition);
    // Equipar machado, enxada, regador e sementes iniciais para permitir teste completo do fluxo de cultivo
    this.player.inventory.addItemStack(createItemStack('axe', 1));
    this.player.inventory.addItemStack(createItemStack('hoe', 1));
    this.player.inventory.addItemStack(createItemStack('watering_can', 1));
    this.player.inventory.addItemStack(createItemStack('turnip_seed', 5));

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
    this.plantCropSystem = new PlantCropSystem();
    this.wateringSystem = new WateringSystem();
    this.harvestSystem = new HarvestSystem();
    this.restSystem = new RestSystem();
    this.interactionSystem.setHarvestSystem(this.harvestSystem);

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

  public getPlantCropSystem(): PlantCropSystem {
    return this.plantCropSystem;
  }

  public getWateringSystem(): WateringSystem {
    return this.wateringSystem;
  }

  public getHarvestSystem(): HarvestSystem {
    return this.harvestSystem;
  }

  public getTimeSystem(): TimeSystem {
    return this.world.getTimeSystem();
  }

  public getRestSystem(): RestSystem {
    return this.restSystem;
  }

  public getIsInventoryOpen(): boolean {
    return this.isInventoryOpen;
  }

  public toggleInventory(): void {
    this.setInventoryOpen(!this.isInventoryOpen);
  }

  public setInventoryOpen(open: boolean): void {
    this.isInventoryOpen = open;
    if (!open) {
      this.cancelInventoryDrag();
    }
  }

  public getDraggedSlotIndex(): number | null {
    return this.draggedSlotIndex;
  }

  public getDragPos(): { x: number; y: number } | null {
    return this.dragPos ? { ...this.dragPos } : null;
  }

  public getHoveredSlotIndex(): number | null {
    return this.hoveredSlotIndex;
  }

  public getSelectedInventorySlotIndex(): number | null {
    return this.selectedInventorySlotIndex;
  }

  public cancelInventoryDrag(): void {
    this.draggedSlotIndex = null;
    this.dragPos = null;
    this.hoveredSlotIndex = null;
    this.selectedInventorySlotIndex = null;
  }

  public handleInventoryDragStart(slotIndex: number, screenX: number, screenY: number): boolean {
    if (!this.isInventoryOpen) return false;
    if (!this.player.inventory.isValidSlotIndex(slotIndex)) return false;

    const stack = this.player.inventory.getSlot(slotIndex);
    if (!stack) return false;

    this.draggedSlotIndex = slotIndex;
    this.dragPos = { x: screenX, y: screenY };
    this.hoveredSlotIndex = slotIndex;
    return true;
  }

  public handleInventoryDragMove(screenX: number, screenY: number): void {
    if (!this.isInventoryOpen || this.draggedSlotIndex === null) return;

    this.dragPos = { x: screenX, y: screenY };
    this.hoveredSlotIndex = this.renderer.getInventorySlotAt(screenX, screenY);
  }

  public handleInventoryDragEnd(screenX: number, screenY: number): boolean {
    if (!this.isInventoryOpen || this.draggedSlotIndex === null) {
      this.cancelInventoryDrag();
      return false;
    }

    const fromSlot = this.draggedSlotIndex;
    const targetSlot = this.renderer.getInventorySlotAt(screenX, screenY);

    let moved = false;
    if (targetSlot !== null && targetSlot !== fromSlot) {
      moved = this.player.inventory.swapSlots(fromSlot, targetSlot);
    }

    this.draggedSlotIndex = null;
    this.dragPos = null;
    this.hoveredSlotIndex = null;
    return moved;
  }

  public getHudState(): HudState {
    return calculateHudState(this.world, this.player);
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

    if (this.handlePointerDown && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.handlePointerDown = null;
    }

    if (this.handlePointerMove && typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.handlePointerMove);
      this.handlePointerMove = null;
    }

    if (this.handlePointerUp && typeof window !== 'undefined') {
      window.removeEventListener('pointerup', this.handlePointerUp);
      this.handlePointerUp = null;
    }

    if (this.handlePointerCancel && typeof window !== 'undefined') {
      window.removeEventListener('pointercancel', this.handlePointerCancel);
      this.handlePointerCancel = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.handleWindowResize && typeof window !== 'undefined') {
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

    // 6.7. Alternar o painel de observabilidade do Inventário se solicitado
    if (this.input.isActionJustPressed('toggle_inventory')) {
      this.toggleInventory();
    }

    // 6.8. Atualizar timers de apresentação da HUD (tooltip temporário do item selecionado)
    this.renderer.update(deltaTime, this.player);

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
      this.isInventoryOpen,
      this.draggedSlotIndex,
      this.dragPos,
      this.hoveredSlotIndex,
      this.selectedInventorySlotIndex,
    );
  }

  private setupResize(canvas: HTMLCanvasElement): void {
    if (typeof window !== 'undefined') {
      this.handleWindowResize = () => {
        this.renderer.resize();
      };
      window.addEventListener('resize', this.handleWindowResize);
    }

    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
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

      // Tratamento prioritário caso o painel do Inventário esteja aberto
      if (this.isInventoryOpen) {
        // 1. Clique no botão de fechar [X]
        if (this.renderer.getInventoryCloseButtonAt(screenX, screenY)) {
          this.setInventoryOpen(false);
          return;
        }

        // 2. Clique em um dos 20 slots do inventário
        const clickedInvSlot = this.renderer.getInventorySlotAt(screenX, screenY);
        if (clickedInvSlot !== null) {
          // Se for um dos primeiros slots pertencentes à Hotbar (0 a 7), seleciona-o para uso rápido
          if (clickedInvSlot < this.player.hotbar.getSlotCount()) {
            this.player.hotbar.setSelectedSlot(clickedInvSlot);
          }

          // Se o slot possui um item, inicia imediatamente o arrasto (drag and drop)
          const stack = this.player.inventory.getSlot(clickedInvSlot);
          if (stack !== null) {
            this.handleInventoryDragStart(clickedInvSlot, screenX, screenY);
            if (typeof canvas.setPointerCapture === 'function') {
              try {
                canvas.setPointerCapture(event.pointerId);
              } catch {
                // Ignore se não suportado
              }
            }
          } else {
            // Se clicou em slot vazio e havia um slot selecionado anteriormente por clique
            if (this.selectedInventorySlotIndex !== null) {
              this.player.inventory.swapSlots(this.selectedInventorySlotIndex, clickedInvSlot);
              this.selectedInventorySlotIndex = null;
            }
          }
          return;
        }

        // 3. Clique dentro da área da janela modal consome o evento sem fechar
        if (this.renderer.isInsideInventoryPanel(screenX, screenY)) {
          this.selectedInventorySlotIndex = null;
          return;
        }

        // 4. Clique fora da janela modal fecha o inventário (experiência intuitiva e padrão)
        this.setInventoryOpen(false);
        return;
      }

      // 1. Verifica se o clique atingiu o botão [INV] da Hotbar
      if (this.renderer.getHotbarInventoryButtonAt(screenX, screenY, this.player)) {
        this.toggleInventory();
        return;
      }

      // 2. Verifica se o clique atingiu um slot da Hotbar
      const clickedSlot = this.renderer.getHotbarSlotAt(screenX, screenY, this.player);
      if (clickedSlot !== null) {
        this.player.hotbar.setSelectedSlot(clickedSlot);
        return;
      }

      // 3. Seleção de célula do terreno (toque no mobile ou clique no desktop)
      const selectedTile = this.tileSelectionSystem.screenToTileCoord(
        { screenX, screenY },
        viewport,
        this.camera,
        this.world,
      );
      this.tileSelectionSystem.selectTile(selectedTile);
    };

    this.handlePointerMove = (event: PointerEvent) => {
      if (!this.isInventoryOpen || this.draggedSlotIndex === null) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const viewport = this.renderer.getViewportSize();
      const screenX = (event.clientX - rect.left) * (viewport.width / rect.width);
      const screenY = (event.clientY - rect.top) * (viewport.height / rect.height);

      this.handleInventoryDragMove(screenX, screenY);
    };

    this.handlePointerUp = (event: PointerEvent) => {
      if (!this.isInventoryOpen || this.draggedSlotIndex === null) return;

      if (typeof canvas.releasePointerCapture === 'function') {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.cancelInventoryDrag();
        return;
      }

      const viewport = this.renderer.getViewportSize();
      const screenX = (event.clientX - rect.left) * (viewport.width / rect.width);
      const screenY = (event.clientY - rect.top) * (viewport.height / rect.height);

      const fromSlot = this.draggedSlotIndex;
      const targetSlot = this.renderer.getInventorySlotAt(screenX, screenY);

      // Finaliza o arrasto e realiza a troca/fusão no inventário real
      const moved = this.handleInventoryDragEnd(screenX, screenY);

      // Suporte complementar a clique simples: se soltou no mesmo slot de origem sem mover para outro
      if (!moved && targetSlot === fromSlot) {
        if (this.selectedInventorySlotIndex === null) {
          this.selectedInventorySlotIndex = fromSlot;
        } else if (this.selectedInventorySlotIndex === fromSlot) {
          this.selectedInventorySlotIndex = null;
        } else {
          this.player.inventory.swapSlots(this.selectedInventorySlotIndex, fromSlot);
          this.selectedInventorySlotIndex = null;
        }
      } else if (moved) {
        this.selectedInventorySlotIndex = null;
      }
    };

    this.handlePointerCancel = (event: PointerEvent) => {
      if (typeof canvas.releasePointerCapture === 'function') {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }
      this.cancelInventoryDrag();
    };

    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('pointerdown', this.handlePointerDown);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.handlePointerMove);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerCancel);
    }
  }
}
