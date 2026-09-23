import { DEFAULT_HOTBAR_SLOT_COUNT, DEFAULT_PLAYER_SPEED, PLAYER_SIZE } from './constants.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { Equipment, EquippedItem } from './Equipment.ts';
import { Hotbar } from './Hotbar.ts';
import { DEFAULT_INVENTORY_SLOT_COUNT, Inventory } from './Inventory.ts';
import { ItemStack } from './ItemStack.ts';
import {
  DEFAULT_PLAYER_VISUAL_CONFIG,
  PlayerAnimationState,
  PlayerVisualConfig,
  VisualBounds,
  calculatePlayerVisualBounds,
} from './PlayerVisual.ts';
import { InputSource, WorldCoord } from './types.ts';

export enum PlayerDirection {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
}

export class Player {
  public position: WorldCoord;
  public speed: number;
  public readonly size: number;
  public direction: PlayerDirection = PlayerDirection.DOWN;
  public isMoving: boolean = false;
  public isUsingItem: boolean = false;
  private useItemTimer: number = 0;

  /** Configuração das dimensões visuais e ancoragem gráfica (independente da hitbox física) */
  public visualConfig: PlayerVisualConfig = DEFAULT_PLAYER_VISUAL_CONFIG;

  /** Gerenciador de estado e ciclo de frames de animação */
  public readonly animationState: PlayerAnimationState = new PlayerAnimationState();

  /** Inventário de itens do Player (estado lógico desacoplado de física e mundo) */
  public readonly inventory: Inventory;

  /** Camada de seleção rápida de slots da Hotbar */
  public readonly hotbar: Hotbar;

  /** Subsistema e estado do item equipado derivado dinamicamente do inventário */
  public readonly equipment: Equipment;

  constructor(
    initialPosition: WorldCoord,
    speed: number = DEFAULT_PLAYER_SPEED,
    size: number = PLAYER_SIZE,
    inventorySlotCount: number = DEFAULT_INVENTORY_SLOT_COUNT,
    hotbarSlotCount: number = DEFAULT_HOTBAR_SLOT_COUNT,
  ) {
    this.position = { ...initialPosition };
    this.speed = speed;
    this.size = size;
    this.inventory = new Inventory(inventorySlotCount);
    this.hotbar = new Hotbar(Math.min(inventorySlotCount, hotbarSlotCount));
    this.equipment = new Equipment(this.inventory, this.hotbar);
  }

  /**
   * Retorna a representação descritiva do item atualmente equipado, ou null se o slot estiver vazio.
   */
  public getEquippedItem(): EquippedItem | null {
    return this.equipment.getEquippedItem();
  }

  /**
   * Retorna a referência direta ao ItemStack contido no slot ativo do inventário, ou null se vazio.
   */
  public getEquippedStack(): ItemStack | null {
    return this.equipment.getEquippedStack();
  }

  /**
   * Processa a seleção e navegação rápida de slots da Hotbar a partir dos inputs fornecidos.
   * Não afeta física, colisão, animação ou posição do Player.
   */
  public updateHotbar(input: InputSource): void {
    if (!input.isActionJustPressed) {
      return;
    }

    if (input.isActionJustPressed('next_slot')) {
      this.hotbar.nextSlot();
      return;
    }

    if (input.isActionJustPressed('prev_slot')) {
      this.hotbar.previousSlot();
      return;
    }

    const slotCount = this.hotbar.getSlotCount();
    for (let i = 0; i < slotCount; i++) {
      if (input.isActionJustPressed(`slot_${i + 1}`)) {
        this.hotbar.setSelectedSlot(i);
        return;
      }
    }
  }

  /**
   * Atualiza o Player no ciclo de frame.
   * Delega o cálculo de deslocamento e colisão espacial exclusivamente ao CollisionSystem.
   * O Player não possui regras sobre tipos de tiles ou walkability.
   * Atualiza a orientação visual apenas quando existir movimento ou intenção significativa (acima de EPSILON).
   * Se estiver parado, preserva estritamente a última direção conhecida.
   * Atualiza o ciclo de frames da animação de forma determinística com o deltaTime.
   */
  public update(
    deltaTime: number,
    input: InputSource,
    collisionSystem: CollisionSystem,
  ): void {
    const direction = input.getMovementDirection();
    const prevX = this.position.worldX;
    const prevY = this.position.worldY;

    collisionSystem.movePlayer(this, direction, deltaTime);

    const deltaX = this.position.worldX - prevX;
    const deltaY = this.position.worldY - prevY;
    const movedDistance = Math.hypot(deltaX, deltaY);
    const inputMagnitude = Math.hypot(direction.x, direction.y);

    const EPSILON = 1e-4;
    this.isMoving = movedDistance > EPSILON;

    // Atualiza a orientação visual com base na intenção de entrada ou deslocamento real
    if (inputMagnitude > EPSILON) {
      if (Math.abs(direction.x) > Math.abs(direction.y)) {
        this.direction = direction.x > 0 ? PlayerDirection.RIGHT : PlayerDirection.LEFT;
      } else {
        this.direction = direction.y > 0 ? PlayerDirection.DOWN : PlayerDirection.UP;
      }
    } else if (movedDistance > EPSILON) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.direction = deltaX > 0 ? PlayerDirection.RIGHT : PlayerDirection.LEFT;
      } else {
        this.direction = deltaY > 0 ? PlayerDirection.DOWN : PlayerDirection.UP;
      }
    }

    // Avança a máquina de estados de animação determinística
    this.animationState.update(deltaTime, this.isMoving);

    // Atualiza o estado transitório de uso de ferramenta
    if (this.useItemTimer > 0) {
      this.useItemTimer = Math.max(0, this.useItemTimer - deltaTime);
      if (this.useItemTimer === 0) {
        this.isUsingItem = false;
      }
    }

    // Processa a seleção rápida de slots da Hotbar a partir dos inputs do frame
    this.updateHotbar(input);
  }

  /**
   * Sinaliza que o jogador iniciou o uso de um item por um período determinístico.
   */
  public setUsingItem(using: boolean, duration: number = 0.2): void {
    this.isUsingItem = using;
    this.useItemTimer = using ? Math.max(0, duration) : 0;
  }

  /**
   * Retorna a coordenada Y global da linha de base dos pés do jogador.
   * Este é o ponto fundamental de ancoragem física no solo e critério estrito de Y-sorting.
   * Não é afetado por qualquer expansão na altura gráfica do sprite.
   */
  public getFootBaseY(): number {
    return this.position.worldY + this.size;
  }

  /**
   * Retorna a posição central dos pés do jogador no plano do solo em coordenadas mundiais.
   */
  public getFootPosition(): WorldCoord {
    return {
      worldX: this.position.worldX + this.size / 2,
      worldY: this.position.worldY + this.size,
    };
  }

  /**
   * Retorna os limites visuais (bounding box) da renderização gráfica do jogador,
   * calculados a partir da linha de base dos pés e da configuração visual ativa.
   */
  public getVisualBounds(config: PlayerVisualConfig = this.visualConfig): VisualBounds {
    return calculatePlayerVisualBounds(this.position, this.size, config);
  }

  /**
   * Retorna o centro geométrico da hitbox física do jogador no espaço de coordenadas do mundo.
   * Utilizado pelo sistema de acompanhamento da câmera para manter o foco inalterado.
   */
  public getCenter(): WorldCoord {
    return {
      worldX: this.position.worldX + this.size / 2,
      worldY: this.position.worldY + this.size / 2,
    };
  }
}


