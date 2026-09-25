import { AssetManager } from './AssetManager.ts';
import { TILE_SIZE } from './constants.ts';
import { Camera } from './Camera.ts';
import { CropRegistry } from './CropRegistry.ts';
import { CropData } from './CropState.ts';
import { InteractionSystem } from './InteractionSystem.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { Player } from './Player.ts';
import { PlayerRenderer } from './PlayerRenderer.ts';
import { SpriteRenderer } from './SpriteRenderer.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { World } from './World.ts';
import { WorldObject } from './WorldObject.ts';
import { TileType, ViewportSize } from './types.ts';
import { calculateHudState, HudState } from './HudState.ts';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  // Estilo visual inicial de fundo
  private readonly clearColor: string = '#121316';

  // Sub-renderizador dedicado de Pixel Art e do Player
  public readonly spriteRenderer: SpriteRenderer;
  public readonly playerRenderer: PlayerRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to obtain CanvasRenderingContext2D.');
    }
    this.ctx = context;
    this.spriteRenderer = new SpriteRenderer(this.ctx);
    this.playerRenderer = new PlayerRenderer(this.ctx);
    this.resize();
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    const hasWindow = typeof window !== 'undefined';
    const displayWidth = parent ? parent.clientWidth : (hasWindow ? window.innerWidth : (this.canvas.width || 800));
    const displayHeight = parent ? parent.clientHeight : (hasWindow ? window.innerHeight : (this.canvas.height || 600));

    // Suporte a telas de alta densidade de pixels (Retina / mobile)
    const dpr = hasWindow && window.devicePixelRatio ? window.devicePixelRatio : 1;
    this.width = displayWidth;
    this.height = displayHeight;

    this.canvas.width = Math.floor(displayWidth * dpr);
    this.canvas.height = Math.floor(displayHeight * dpr);
    if (this.canvas.style) {
      this.canvas.style.width = `${displayWidth}px`;
      this.canvas.style.height = `${displayHeight}px`;
    }

    if (typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Reafirma estritamente a desativação de suavização de pixel art após redimensionamento do Canvas
    this.spriteRenderer.enforcePixelArtSmoothing();
  }

  public getViewportSize(): ViewportSize {
    return { width: this.width, height: this.height };
  }

  /**
   * Transforma os dados do World em pixels na tela através da Camera
   */
  public render(
    world: World,
    camera: Camera,
    player: Player,
    interactionSystem?: InteractionSystem,
    itemUseSystem?: ItemUseSystem,
    tileSelectionSystem?: TileSelectionSystem,
  ): void {
    // 1. Limpar fundo escuro
    this.ctx.fillStyle = this.clearColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const viewport = this.getViewportSize();

    // 2. Determinar a faixa de tiles visíveis na viewport através da Camera
    const topLeftWorld = camera.screenToWorld({ screenX: 0, screenY: 0 }, viewport);
    const bottomRightWorld = camera.screenToWorld(
      { screenX: viewport.width, screenY: viewport.height },
      viewport,
    );

    // Margem de 1 tile para desenhar tiles que tocam parcialmente a borda da viewport
    const minTileX = Math.floor(topLeftWorld.worldX / TILE_SIZE) - 1;
    const maxTileX = Math.floor(bottomRightWorld.worldX / TILE_SIZE) + 1;
    const minTileY = Math.floor(topLeftWorld.worldY / TILE_SIZE) - 1;
    const maxTileY = Math.floor(bottomRightWorld.worldY / TILE_SIZE) + 1;

    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
        // Leitura pura: consulta somente se o chunk já estiver carregado na memória.
        // O Renderer NUNCA provoca a geração de chunks.
        const tile = world.getLoadedTile(tileX, tileY);
        if (!tile) continue;

        // Passo 1: Converter Coordenadas de Tile -> Coordenadas de Mundo (pixels)
        const worldCoord = world.tileToWorld({ tileX, tileY });

        // Passo 2: Converter Coordenadas de Mundo -> Coordenadas de Tela via Camera
        const screenCoord = camera.worldToScreen(worldCoord, viewport);

        // Passo 3: Frustum culling simples e direto
        if (
          screenCoord.screenX + TILE_SIZE < 0 ||
          screenCoord.screenX > this.width ||
          screenCoord.screenY + TILE_SIZE < 0 ||
          screenCoord.screenY > this.height
        ) {
          continue;
        }

        // Passo 4: Desenhar o tile no Canvas de acordo com seu estilo visual resolvido
        const visual = world.getTerrainVisualAt(tileX, tileY, tile.type);
        this.ctx.fillStyle = visual.color;
        this.ctx.fillRect(
          screenCoord.screenX,
          screenCoord.screenY,
          TILE_SIZE,
          TILE_SIZE,
        );

        if (visual.borderColor) {
          // Contorno sutil para evidenciar a malha de tiles
          this.ctx.strokeStyle = visual.borderColor;
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(
            screenCoord.screenX + 0.5,
            screenCoord.screenY + 0.5,
            TILE_SIZE - 1,
            TILE_SIZE - 1,
          );
        }

        // Variação procedural discreta para solo cultivável (sulcos paralelos sutis)
        if (tile.type === TileType.TILLED_SOIL) {
          this.ctx.fillStyle = 'rgba(40, 20, 5, 0.45)';
          const grooveHeight = 1;
          this.ctx.fillRect(screenCoord.screenX + 2, screenCoord.screenY + 4, TILE_SIZE - 4, grooveHeight);
          this.ctx.fillRect(screenCoord.screenX + 2, screenCoord.screenY + 8, TILE_SIZE - 4, grooveHeight);
          this.ctx.fillRect(screenCoord.screenX + 2, screenCoord.screenY + 12, TILE_SIZE - 4, grooveHeight);
        }

        // Renderização técnica do cultivo ativo (se houver)
        const crop = world.getCropAt(tileX, tileY);
        if (crop) {
          // Feedback técnico mínimo de solo regado/úmido em Pixel Art
          if (crop.watered) {
            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
            this.ctx.fillRect(screenCoord.screenX + 1, screenCoord.screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
            this.ctx.fillRect(screenCoord.screenX + 3, screenCoord.screenY + 3, 2, 1);
            this.ctx.fillRect(screenCoord.screenX + 11, screenCoord.screenY + 9, 2, 1);
          }

          const stage = world.getCropGrowthStage(tileX, tileY);
          this.renderCrop(crop, stage, screenCoord.screenX, screenCoord.screenY);
        }
      }
    }

    // 2.5. Renderizar indicador sutil e discreto da célula de terreno selecionada
    if (tileSelectionSystem) {
      const selected = tileSelectionSystem.getSelectedTile();
      if (selected) {
        const worldPos = world.tileToWorld(selected);
        const screenPos = camera.worldToScreen(worldPos, viewport);
        if (
          screenPos.screenX + TILE_SIZE >= 0 &&
          screenPos.screenX <= this.width &&
          screenPos.screenY + TILE_SIZE >= 0 &&
          screenPos.screenY <= this.height
        ) {
          if (typeof this.ctx.save === 'function') {
            this.ctx.save();
          }
          this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)'; // Amarelo discreto/sóbrio
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(
            screenPos.screenX + 0.5,
            screenPos.screenY + 0.5,
            TILE_SIZE - 1,
            TILE_SIZE - 1,
          );
          if (typeof this.ctx.restore === 'function') {
            this.ctx.restore();
          }
        }
      }
    }

    // 3. Renderizar WorldObjects e Player com ordenação por profundidade (Z-Sorting / Y-Sorting)
    const margin = 64;
    const minX = topLeftWorld.worldX - margin;
    const minY = topLeftWorld.worldY - margin;
    const areaWidth = (bottomRightWorld.worldX - topLeftWorld.worldX) + margin * 2;
    const areaHeight = (bottomRightWorld.worldY - topLeftWorld.worldY) + margin * 2;
    const visibleObjects = world.getObjectManager().getObjectsInArea(minX, minY, areaWidth, areaHeight);
    // Ordenar objetos pelo limite inferior (linha de base no mundo)
    visibleObjects.sort((a, b) => (a.position.worldY + a.height) - (b.position.worldY + b.height));

    // Ordenação Y baseada estritamente na linha física dos pés do jogador (footBaseY)
    const playerBaseY = player.getFootBaseY();
    let playerRendered = false;

    for (const obj of visibleObjects) {
      const objBaseY = obj.position.worldY + obj.height;
      if (!playerRendered && playerBaseY <= objBaseY) {
        this.playerRenderer.render(player, camera, viewport, this.width, this.height);
        playerRendered = true;
      }
      this.renderWorldObject(obj, camera, viewport);
    }

    if (!playerRendered) {
      this.playerRenderer.render(player, camera, viewport, this.width, this.height);
    }

    // 4. Renderizar feedback técnico de interação e debug se disponível
    if (interactionSystem) {
      interactionSystem.renderPrompt(this.ctx, camera, viewport);
      interactionSystem.renderFeedback(this.ctx, viewport);
      interactionSystem.renderDebug(this.ctx, camera, viewport, player);
    }

    // 5. Renderizar feedback e prompt de uso de itens/ferramentas se disponível
    if (itemUseSystem) {
      itemUseSystem.renderPrompt(this.ctx, camera, viewport, player);
      itemUseSystem.renderFeedback(this.ctx, viewport);
    }

    // 6. Renderizar HUD técnico mínimo da Hotbar (barra de slots discretos com destaque de seleção)
    this.renderHotbar(player);

    // 7. Renderizar HUD técnico mínimo de Tempo e Energia
    this.renderHud(world, player);
  }

  /**
   * Renderiza um WorldObject com formas geométricas simples e limpas por tipo.
   */
  private renderWorldObject(obj: WorldObject, camera: Camera, viewport: ViewportSize): void {
    const screenCoord = camera.worldToScreen(obj.position, viewport);

    // Frustum culling
    if (
      screenCoord.screenX + obj.width < 0 ||
      screenCoord.screenX > this.width ||
      screenCoord.screenY + obj.height < 0 ||
      screenCoord.screenY > this.height
    ) {
      return;
    }

    const { screenX, screenY } = screenCoord;
    const { width, height } = obj;

    switch (obj.type) {
      case 'tree': {
        // 1. Tenta renderizar via Spritesheet registrado no AssetManager (extensão limpa para artes futuras)
        const treeSheet = AssetManager.getInstance().getSpriteSheet('tree');
        if (treeSheet && treeSheet.imageSource) {
          const frame = treeSheet.getFrame('intact') ?? treeSheet.getFrame('idle');
          if (frame) {
            this.spriteRenderer.renderSprite(
              camera,
              viewport,
              { worldX: obj.position.worldX, worldY: obj.position.worldY, width, height },
              treeSheet,
              frame,
            );
            break;
          }
        }

        // 2. Fallback técnico vetorial procedural (estável, sem arte externa requerida)
        // Sombra sob a copa
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX + width / 2, screenY + height - 2, width / 2 - 2, 4, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Tronco marrom
        const trunkWidth = 8;
        const trunkHeight = 12;
        const trunkX = screenX + (width - trunkWidth) / 2;
        const trunkY = screenY + height - trunkHeight;
        this.ctx.fillStyle = '#6b4226';
        this.ctx.fillRect(trunkX, trunkY, trunkWidth, trunkHeight);
        this.ctx.strokeStyle = '#4a2c11';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(trunkX + 0.5, trunkY + 0.5, trunkWidth - 1, trunkHeight - 1);

        // Copa geométrica (duas camadas arredondadas)
        const crownRadiusX = width / 2;
        const crownRadiusY = (height - trunkHeight) / 2;
        const crownCenterX = screenX + width / 2;
        const crownCenterY = screenY + crownRadiusY;

        this.ctx.fillStyle = '#2d6a4f';
        this.ctx.beginPath();
        this.ctx.ellipse(crownCenterX, crownCenterY + 2, crownRadiusX, crownRadiusY, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Camada superior da copa (destaque de volume)
        this.ctx.fillStyle = '#40916c';
        this.ctx.beginPath();
        this.ctx.ellipse(crownCenterX, crownCenterY - 2, crownRadiusX - 3, crownRadiusY - 4, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Contorno da copa
        this.ctx.strokeStyle = '#1b4332';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.ellipse(crownCenterX, crownCenterY + 2, crownRadiusX, crownRadiusY, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        break;
      }

      case 'cactus': {
        // Sombra na base
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX + width / 2, screenY + height - 1, width / 2, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Haste principal
        const stemWidth = 6;
        const stemHeight = height - 2;
        const stemX = screenX + (width - stemWidth) / 2;
        const stemY = screenY + 2;

        this.ctx.fillStyle = '#2d6a4f';
        this.ctx.fillRect(stemX, stemY, stemWidth, stemHeight);

        // Braço esquerdo do cacto
        this.ctx.fillRect(screenX, screenY + 8, 4, 4);
        this.ctx.fillRect(screenX, screenY + 4, 4, 5);

        // Braço direito do cacto
        this.ctx.fillRect(screenX + width - 4, screenY + 12, 4, 4);
        this.ctx.fillRect(screenX + width - 4, screenY + 8, 4, 5);

        this.ctx.strokeStyle = '#1b4332';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(stemX + 0.5, stemY + 0.5, stemWidth - 1, stemHeight - 1);
        break;
      }

      case 'rock': {
        // Sombra
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX + width / 2, screenY + height - 1, width / 2, 4, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Corpo da rocha (forma angular multifacetada)
        this.ctx.fillStyle = '#6c757d';
        this.ctx.beginPath();
        this.ctx.moveTo(screenX + 4, screenY + height - 2);
        this.ctx.lineTo(screenX + 1, screenY + 8);
        this.ctx.lineTo(screenX + 7, screenY + 2);
        this.ctx.lineTo(screenX + width - 5, screenY + 1);
        this.ctx.lineTo(screenX + width - 1, screenY + 7);
        this.ctx.lineTo(screenX + width - 3, screenY + height - 2);
        this.ctx.closePath();
        this.ctx.fill();

        // Destaque de luz superior
        this.ctx.fillStyle = '#adb5bd';
        this.ctx.beginPath();
        this.ctx.moveTo(screenX + 7, screenY + 2);
        this.ctx.lineTo(screenX + width - 5, screenY + 1);
        this.ctx.lineTo(screenX + width - 8, screenY + 7);
        this.ctx.lineTo(screenX + 5, screenY + 7);
        this.ctx.closePath();
        this.ctx.fill();

        // Contorno
        this.ctx.strokeStyle = '#495057';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(screenX + 4, screenY + height - 2);
        this.ctx.lineTo(screenX + 1, screenY + 8);
        this.ctx.lineTo(screenX + 7, screenY + 2);
        this.ctx.lineTo(screenX + width - 5, screenY + 1);
        this.ctx.lineTo(screenX + width - 1, screenY + 7);
        this.ctx.lineTo(screenX + width - 3, screenY + height - 2);
        this.ctx.closePath();
        this.ctx.stroke();
        break;
      }

      case 'wildflower': {
        const cx = screenX + width / 2;
        const cy = screenY + height / 2;

        // Caule verde fino
        this.ctx.fillStyle = '#38b000';
        this.ctx.fillRect(cx - 1, cy, 2, height / 2);

        // Pétalas (círculo delicado colorido)
        this.ctx.fillStyle = '#f72585';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Miolo amarelo
        this.ctx.fillStyle = '#ffd166';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      }

      case 'test_toggle': {
        const isActive = (obj.state as { active?: boolean } | undefined)?.active === true;

        // Sombra na base
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX + width / 2, screenY + height - 1, width / 2, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        if (isActive) {
          // Estado ON: Beacon brilhante esmeralda com núcleo luminoso
          this.ctx.fillStyle = '#059669';
          this.ctx.fillRect(screenX, screenY, width, height);

          // Borda verde vívida
          this.ctx.strokeStyle = '#10b981';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, width - 1, height - 1);

          // Núcleo luminoso pulsante/aceso
          this.ctx.fillStyle = '#6ee7b7';
          this.ctx.fillRect(screenX + width / 2 - 4, screenY + height / 2 - 4, 8, 8);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillRect(screenX + width / 2 - 2, screenY + height / 2 - 2, 4, 4);
        } else {
          // Estado OFF: Beacon inativo com cores de ardósia/apagado
          this.ctx.fillStyle = '#334155';
          this.ctx.fillRect(screenX, screenY, width, height);

          // Borda escura discreta
          this.ctx.strokeStyle = '#1e293b';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, width - 1, height - 1);

          // Núcleo apagado
          this.ctx.fillStyle = '#64748b';
          this.ctx.fillRect(screenX + width / 2 - 3, screenY + height / 2 - 3, 6, 6);
        }
        break;
      }

      case 'test_interactable': {
        // Sombra na base
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX + width / 2, screenY + height - 1, width / 2, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Caixa técnica representativa para teste de interação (âmbar/dourado)
        this.ctx.fillStyle = '#d97706';
        this.ctx.fillRect(screenX, screenY, width, height);

        // Borda sutil escura
        this.ctx.strokeStyle = '#78350f';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, width - 1, height - 1);

        // Indicador no centro
        this.ctx.fillStyle = '#fef3c7';
        this.ctx.fillRect(screenX + width / 2 - 3, screenY + height / 2 - 3, 6, 6);
        break;
      }

      case 'item_drop': {
        const itemId = (obj.state as { itemId?: string } | undefined)?.itemId ?? 'wood';
        const quantity = (obj.state as { quantity?: number } | undefined)?.quantity ?? 1;

        // 1. Tenta renderizar via Spritesheet registrado no AssetManager (extensão limpa para artes futuras)
        const customSpriteId = (obj as unknown as { spriteAssetId?: string }).spriteAssetId;
        const itemSheet = AssetManager.getInstance().getSpriteSheet(customSpriteId ?? `item_${itemId}`) ??
                          AssetManager.getInstance().getSpriteSheet(itemId);
        if (itemSheet && itemSheet.imageSource) {
          const frame = itemSheet.getFrame('idle');
          if (frame) {
            this.spriteRenderer.renderSprite(
              camera,
              viewport,
              { worldX: obj.position.worldX, worldY: obj.position.worldY, width, height },
              itemSheet,
              frame,
            );
            if (quantity > 1) {
              this.ctx.fillStyle = '#000000';
              this.ctx.font = 'bold 9px monospace';
              this.ctx.textAlign = 'right';
              this.ctx.textBaseline = 'bottom';
              this.ctx.fillText(`${quantity}`, screenX + width + 1, screenY + height + 1);
              this.ctx.fillStyle = '#ffffff';
              this.ctx.fillText(`${quantity}`, screenX + width, screenY + height);
            }
            break;
          }
        }

        // 2. Fallback técnico vetorial procedural (estável, sem arte externa requerida)
        // Sombra suave sob o item
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.beginPath();
        this.ctx.ellipse(screenX + width / 2, screenY + height - 1, width / 2 - 1, 3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Renderização pixel art técnica do item
        if (itemId === 'wood') {
          // Tronco de madeira
          this.ctx.fillStyle = '#854d0e';
          this.ctx.fillRect(screenX + 2, screenY + 4, width - 4, height - 7);
          this.ctx.fillStyle = '#a16207';
          this.ctx.fillRect(screenX + 3, screenY + 5, width - 6, 2);
          this.ctx.strokeStyle = '#583101';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(screenX + 2.5, screenY + 4.5, width - 5, height - 8);
        } else if (itemId === 'stone') {
          // Fragmento rochoso
          this.ctx.fillStyle = '#64748b';
          this.ctx.fillRect(screenX + 3, screenY + 4, width - 6, height - 7);
          this.ctx.fillStyle = '#94a3b8';
          this.ctx.fillRect(screenX + 4, screenY + 5, width - 8, 2);
          this.ctx.strokeStyle = '#334155';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(screenX + 3.5, screenY + 4.5, width - 7, height - 8);
        } else if (itemId === 'flower') {
          // Flor silvestre
          this.ctx.fillStyle = '#f43f5e';
          this.ctx.fillRect(screenX + 4, screenY + 3, width - 8, height - 7);
          this.ctx.fillStyle = '#fbbf24';
          this.ctx.fillRect(screenX + 6, screenY + 5, 4, 3);
        } else {
          // Fallback genérico para outros itens
          this.ctx.fillStyle = '#d97706';
          this.ctx.fillRect(screenX + 3, screenY + 4, width - 6, height - 7);
          this.ctx.strokeStyle = '#92400e';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(screenX + 3.5, screenY + 4.5, width - 7, height - 8);
        }

        // Indicador de quantidade no canto se for maior que 1
        if (quantity > 1) {
          this.ctx.fillStyle = '#000000';
          this.ctx.font = 'bold 9px monospace';
          this.ctx.textAlign = 'right';
          this.ctx.textBaseline = 'bottom';
          this.ctx.fillText(`${quantity}`, screenX + width + 1, screenY + height + 1);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillText(`${quantity}`, screenX + width, screenY + height);
        }
        break;
      }

      default: {
        // Fallback genérico para qualquer outro tipo de WorldObject
        this.ctx.fillStyle = '#8b5cf6';
        this.ctx.fillRect(screenX, screenY, width, height);
        this.ctx.strokeStyle = '#6d28d9';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, width - 1, height - 1);
        break;
      }
    }
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  /**
   * Renderiza a representação técnica mínima e limpa dos slots da Hotbar na barra inferior.
   * Destaca claramente o slot ativo e exibe a quantidade e o item equipado.
   * Não afeta o núcleo de física, movimentação ou entidades.
   */
  private renderHotbar(player: Player): void {
    const inventory = player.inventory;
    const hotbar = player.hotbar;
    const slotCount = hotbar.getSlotCount();
    const selectedSlot = hotbar.getSelectedSlotIndex();

    const slotSize = 36;
    const gap = 4;
    const totalWidth = slotCount * slotSize + (slotCount - 1) * gap;
    const startX = Math.round((this.width - totalWidth) / 2);
    const startY = this.height - slotSize - 12;

    // Fundo discreto da moldura da Hotbar
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.fillRect(startX - 6, startY - 4, totalWidth + 12, slotSize + 8);
    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(startX - 5.5, startY - 3.5, totalWidth + 11, slotSize + 7);

    for (let i = 0; i < slotCount; i++) {
      const slotX = startX + i * (slotSize + gap);
      const slotY = startY;
      const isSelected = i === selectedSlot;
      const stack = inventory.getSlot(i);

      // Fundo do slot
      if (isSelected) {
        this.ctx.fillStyle = 'rgba(30, 58, 138, 0.95)'; // Azul destacado para seleção ativa
      } else {
        this.ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
      }
      this.ctx.fillRect(slotX, slotY, slotSize, slotSize);

      // Borda do slot (destacada se selecionado)
      if (isSelected) {
        this.ctx.strokeStyle = '#fbbf24'; // Dourado brilhante para o slot equipado
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(slotX + 1, slotY + 1, slotSize - 2, slotSize - 2);

        // Marcador indicador sutil no topo do slot selecionado
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.fillRect(slotX + slotSize / 2 - 2, startY - 3, 4, 2);
      } else {
        this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.8)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(slotX + 0.5, slotY + 0.5, slotSize - 1, slotSize - 1);
      }

      // Indicador numérico do atalho (1 a N) no canto superior esquerdo
      this.ctx.fillStyle = isSelected ? '#fbbf24' : 'rgba(148, 163, 184, 0.8)';
      this.ctx.font = 'bold 8px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      if (typeof this.ctx.fillText === 'function') {
        this.ctx.fillText(`${i + 1}`, slotX + 2, slotY + 2);
      }

      if (stack) {
        // Tenta renderizar o ícone a partir do Spritesheet do item registrado no AssetManager
        const itemSheet = AssetManager.getInstance().getSpriteSheet(`item_${stack.itemId}`) ??
                          AssetManager.getInstance().getSpriteSheet(stack.itemId);
        let renderedIcon = false;
        if (itemSheet && itemSheet.imageSource) {
          const frame = itemSheet.getFrame('idle');
          if (frame && typeof this.ctx.drawImage === 'function') {
            this.ctx.drawImage(
              itemSheet.imageSource,
              frame.sx,
              frame.sy,
              frame.sWidth,
              frame.sHeight,
              slotX + 10,
              slotY + 10,
              16,
              16,
            );
            renderedIcon = true;
          }
        }

        if (!renderedIcon) {
          // Miniatura técnica representativa por itemId (fallback procedural)
          if (stack.itemId === 'wood') {
            this.ctx.fillStyle = '#854d0e';
            this.ctx.fillRect(slotX + 10, slotY + 13, 16, 10);
            this.ctx.fillStyle = '#a16207';
            this.ctx.fillRect(slotX + 12, slotY + 15, 12, 2);
          } else if (stack.itemId === 'stone') {
            this.ctx.fillStyle = '#64748b';
            this.ctx.fillRect(slotX + 11, slotY + 11, 14, 14);
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.fillRect(slotX + 13, slotY + 13, 10, 3);
          } else if (stack.itemId === 'flower') {
            this.ctx.fillStyle = '#f43f5e';
            this.ctx.fillRect(slotX + 12, slotY + 11, 12, 12);
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.fillRect(slotX + 15, slotY + 14, 6, 6);
          } else if (stack.itemId === 'axe') {
            // Machado na barra de atalhos
            this.ctx.fillStyle = '#92400e';
            this.ctx.fillRect(slotX + 16, slotY + 11, 3, 14);
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.fillRect(slotX + 18, slotY + 11, 6, 6);
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.fillRect(slotX + 22, slotY + 11, 2, 6);
          } else {
            this.ctx.fillStyle = '#d97706';
            this.ctx.fillRect(slotX + 11, slotY + 11, 14, 14);
          }
        }

        // Quantidade numérica no canto inferior direito
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'bottom';
        if (typeof this.ctx.fillText === 'function') {
          this.ctx.fillText(`${stack.quantity}`, slotX + slotSize, slotY + slotSize);
          this.ctx.fillStyle = '#f8fafc';
          this.ctx.fillText(`${stack.quantity}`, slotX + slotSize - 1, slotY + slotSize - 1);
        }
      }
    }
  }

  /**
   * Converte uma coordenada de clique/toque na tela para o índice do slot correspondente na Hotbar.
   * Retorna o índice do slot (0 a slotCount - 1) ou null se fora dos limites.
   */
  public getHotbarSlotAt(screenX: number, screenY: number, player: Player): number | null {
    const slotCount = player.hotbar.getSlotCount();
    const slotSize = 36;
    const gap = 4;
    const totalWidth = slotCount * slotSize + (slotCount - 1) * gap;
    const startX = Math.round((this.width - totalWidth) / 2);
    const startY = this.height - slotSize - 12;

    // Tolerância vertical generosa para toque em dispositivos móveis (dedo humano)
    const verticalPadding = 8;
    if (screenY < startY - verticalPadding || screenY > startY + slotSize + verticalPadding) {
      return null;
    }

    // Tolerância horizontal nas pontas
    if (screenX < startX - 6 || screenX > startX + totalWidth + 6) {
      return null;
    }

    // Mapeamento determinístico de cada slot dividindo o vão (gap) central
    for (let i = 0; i < slotCount; i++) {
      const slotX = startX + i * (slotSize + gap);
      const leftBoundary = i === 0 ? slotX - 6 : slotX - gap / 2;
      const rightBoundary = i === slotCount - 1 ? slotX + slotSize + 6 : slotX + slotSize + gap / 2;

      if (screenX >= leftBoundary && screenX <= rightBoundary) {
        return i;
      }
    }

    return null;
  }

  /**
   * Renderiza deterministicamente um cultivo de acordo com seu estágio de crescimento atual.
   *
   * Princípios técnicos:
   * 1. Pixel Art com coordenadas inteiras estritas;
   * 2. Tenta renderizar sprite registrado no AssetManager se disponível;
   * 3. Caso não haja sprite cadastrado, desenha fallback geométrico técnico simples e discreto;
   * 4. Zero interferência em colisão, física ou alcance.
   */
  private renderCrop(crop: CropData, stage: number, screenX: number, screenY: number): void {
    const sx = Math.floor(screenX);
    const sy = Math.floor(screenY);

    const def = CropRegistry.get(crop.cropId);
    const stageSpriteId = def?.stageSpriteAssetIds?.[stage] ?? (stage > 0 ? def?.spriteAssetId : undefined);

    if (stageSpriteId) {
      const assetManager = AssetManager.getInstance();
      const sheet = assetManager.getSpriteSheet(stageSpriteId);
      if (sheet && sheet.imageSource) {
        this.ctx.drawImage(sheet.imageSource, sx, sy, TILE_SIZE, TILE_SIZE);
        return;
      }
    }

    // Fallback geométrico técnico discreto por estágio
    switch (stage) {
      case 0: {
        // Estágio 0: Semente semeada (pequenos pontos discretos no centro do solo)
        this.ctx.fillStyle = '#bfa27a';
        this.ctx.fillRect(sx + 6, sy + 7, 2, 2);
        this.ctx.fillRect(sx + 9, sy + 8, 2, 2);
        break;
      }

      case 1: {
        // Estágio 1: Broto jovem inicial (pequeno caule e folhas verdes nascentes)
        this.ctx.fillStyle = '#558b2f';
        this.ctx.fillRect(sx + 7, sy + 7, 2, 4);
        this.ctx.fillStyle = '#7cb342';
        this.ctx.fillRect(sx + 6, sy + 5, 4, 2);
        break;
      }

      case 2: {
        // Estágio 2: Planta em desenvolvimento (folhagem intermediária mais encorpada)
        this.ctx.fillStyle = '#457a24';
        this.ctx.fillRect(sx + 7, sy + 6, 2, 5);
        this.ctx.fillStyle = '#689f38';
        this.ctx.fillRect(sx + 5, sy + 4, 6, 3);
        this.ctx.fillStyle = '#8bc34a';
        this.ctx.fillRect(sx + 6, sy + 2, 4, 2);
        break;
      }

      default: {
        // Estágio 3+: Maduro (folhagem desenvolvida com topo característico visível)
        this.ctx.fillStyle = '#33691e';
        this.ctx.fillRect(sx + 4, sy + 2, 8, 4);
        this.ctx.fillStyle = '#7cb342';
        this.ctx.fillRect(sx + 5, sy + 1, 6, 2);
        // Fruto/raiz parcialmente visível na terra
        this.ctx.fillStyle = '#e8eaf6';
        this.ctx.fillRect(sx + 6, sy + 6, 4, 4);
        this.ctx.fillStyle = '#8e24aa';
        this.ctx.fillRect(sx + 6, sy + 5, 4, 2);
        break;
      }
    }
  }

  /**
   * Renderiza a HUD mínima persistente de Tempo (Dia/Horário) e Energia (barra compacta).
   *
   * Princípios técnicos:
   * 1. Consulta estritamente os sistemas existentes (TimeSystem e EnergySystem);
   * 2. Zero relógio próprio, zero Date.now() / performance.now();
   * 3. Desenho em Pixel Art com coordenadas inteiras estritas;
   * 4. Posicionado no canto superior direito para não interferir com controles ou gameplay;
   * 5. Extremamente compacto e leve.
   */
  public renderHud(world: World, player: Player): void {
    const hudState = calculateHudState(world, player);
    const hudWidth = 132;
    const hudHeight = 34;

    // Posicionamento: topo direito, com margem de 86px da borda direita para deixar espaço para o botão Fullscreen
    const hudX = Math.max(10, this.width - hudWidth - 86);
    const hudY = 10;

    if (typeof this.ctx.save === 'function') {
      this.ctx.save();
    }

    // Fundo escuro translúcido compatível com pixel art
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    if (typeof this.ctx.fillRect === 'function') {
      this.ctx.fillRect(hudX, hudY, hudWidth, hudHeight);
    }
    this.ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    this.ctx.lineWidth = 1;
    if (typeof this.ctx.strokeRect === 'function') {
      this.ctx.strokeRect(hudX + 0.5, hudY + 0.5, hudWidth - 1, hudHeight - 1);
    }

    // 1. Linha de Tempo: "DIA <day>  •  <HH:MM>"
    const timeText = `DIA ${hudState.day}  •  ${hudState.formattedTime}`;
    this.ctx.font = 'bold 10px monospace';
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'left';

    // Sombra sutil de texto para nitidez pixel art
    this.ctx.fillStyle = '#0f172a';
    if (typeof this.ctx.fillText === 'function') {
      this.ctx.fillText(timeText, hudX + 9, hudY + 5);
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.fillText(timeText, hudX + 8, hudY + 4);
    }

    // 2. Linha de Energia: Rótulo e Valores numéricos
    const energyLabel = 'ENERGIA';
    const energyValue = `${Math.round(hudState.currentEnergy)}/${hudState.maximumEnergy}`;

    this.ctx.font = 'bold 8px monospace';
    this.ctx.textBaseline = 'top';

    if (typeof this.ctx.fillText === 'function') {
      // Rótulo "ENERGIA"
      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.fillText(energyLabel, hudX + 8, hudY + 16);

      // Valor numérico "100/100" à direita
      this.ctx.textAlign = 'right';
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.fillText(energyValue, hudX + hudWidth - 8, hudY + 16);
    }

    // 3. Barra compacta de Energia
    const barX = hudX + 8;
    const barY = hudY + 26;
    const barWidth = hudWidth - 16;
    const barHeight = 4;

    // Fundo da barra
    this.ctx.fillStyle = '#0f172a';
    if (typeof this.ctx.fillRect === 'function') {
      this.ctx.fillRect(barX, barY, barWidth, barHeight);
    }
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1;
    if (typeof this.ctx.strokeRect === 'function') {
      this.ctx.strokeRect(barX - 0.5, barY - 0.5, barWidth + 1, barHeight + 1);
    }

    // Preenchimento proporcional
    const fillWidth = Math.max(0, Math.min(barWidth, Math.round(barWidth * hudState.energyPercentage)));
    if (fillWidth > 0 && typeof this.ctx.fillRect === 'function') {
      if (hudState.energyPercentage > 0.5) {
        this.ctx.fillStyle = '#22c55e'; // Verde para energia alta
      } else if (hudState.energyPercentage > 0.2) {
        this.ctx.fillStyle = '#eab308'; // Âmbar para energia média
      } else {
        this.ctx.fillStyle = '#ef4444'; // Vermelho para energia baixa
      }
      this.ctx.fillRect(barX, barY, fillWidth, barHeight);
    }

    if (typeof this.ctx.restore === 'function') {
      this.ctx.restore();
    }
  }

  /**
   * Retorna os limites do HUD na tela para cálculo de layout e testes.
   */
  public getHudBounds(): { x: number; y: number; width: number; height: number } {
    const hudWidth = 132;
    const hudHeight = 34;
    const hudX = Math.max(10, this.width - hudWidth - 86);
    const hudY = 10;
    return { x: hudX, y: hudY, width: hudWidth, height: hudHeight };
  }
}
