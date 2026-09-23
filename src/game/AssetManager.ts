import {
  SpriteSheet,
  SpriteSheetDefinition,
  createGridSpriteSheet,
} from './SpriteSheet.ts';

/**
 * Gerenciador centralizado de assets gráficos e spritesheets do jogo.
 *
 * Responsabilidades:
 * 1. Manter o registro declarativo de todos os Spritesheets disponíveis (Player, Inimigos, Animais, Vegetação, etc.).
 * 2. Gerenciar o cache e carregamento de imagens para evitar requisições e alocações duplicadas.
 * 3. Permitir que múltiplas entidades compartilhem o mesmo asset visual sem duplicação de memória.
 * 4. Garantir que a ausência de um asset em disco acione com segurança o fallback técnico sem quebrar a execução.
 */
export class AssetManager {
  private static instance: AssetManager | null = null;

  private readonly spriteSheets: Map<string, SpriteSheetDefinition> = new Map();
  private readonly imageCache: Map<string, CanvasImageSource> = new Map();
  private readonly loadingPromises: Map<string, Promise<CanvasImageSource>> = new Map();

  constructor() {
    this.registerDefaultSpriteSheets();
  }

  /**
   * Obtém a instância única (Singleton) do AssetManager.
   */
  public static getInstance(): AssetManager {
    if (!this.instance) {
      this.instance = new AssetManager();
    }
    return this.instance;
  }

  /**
   * Reinicia a instância do singleton (útil para testes isolados).
   */
  public static resetInstance(): void {
    this.instance = null;
  }

  /**
   * Registra uma definição de spritesheet.
   */
  public registerSpriteSheet(definition: SpriteSheetDefinition): void {
    this.spriteSheets.set(definition.id, definition);

    // Se a imagem já estiver em cache sob a URL/caminho, associa imediatamente
    if (definition.imagePath && this.imageCache.has(definition.imagePath)) {
      definition.imageSource = this.imageCache.get(definition.imagePath)!;
    }
  }

  /**
   * Obtém um spritesheet registrado pelo seu identificador único.
   */
  public getSpriteSheet(id: string): SpriteSheetDefinition | undefined {
    return this.spriteSheets.get(id);
  }

  /**
   * Verifica se determinado spritesheet está registrado.
   */
  public hasSpriteSheet(id: string): boolean {
    return this.spriteSheets.has(id);
  }

  /**
   * Retorna os IDs de todos os spritesheets registrados.
   */
  public getAllSpriteSheetIds(): string[] {
    return Array.from(this.spriteSheets.keys());
  }

  /**
   * Associa manualmente uma fonte de imagem (HTMLImageElement, ImageBitmap, OffscreenCanvas)
   * a um spritesheet registrado.
   */
  public setImageSource(spriteSheetId: string, imageSource: CanvasImageSource): void {
    const sheet = this.spriteSheets.get(spriteSheetId);
    if (sheet) {
      sheet.imageSource = imageSource;
      if (sheet.imagePath) {
        this.imageCache.set(sheet.imagePath, imageSource);
      }
    }
  }

  /**
   * Carrega uma imagem de forma assíncrona com deduplicação de promessas e cache automático.
   * Se a mesma URL for requisitada várias vezes simultaneamente, retorna a exata mesma promessa em andamento.
   */
  public loadImage(path: string): Promise<CanvasImageSource> {
    const cached = this.imageCache.get(path);
    if (cached) {
      return Promise.resolve(cached);
    }

    const existingPromise = this.loadingPromises.get(path);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = new Promise<CanvasImageSource>((resolve, reject) => {
      // Suporte seguro a ambientes sem DOM / SSR / CLI tests
      if (typeof Image === 'undefined') {
        queueMicrotask(() => {
          const mockCanvas = {
            width: 32,
            height: 64,
          } as unknown as CanvasImageSource;
          this.imageCache.set(path, mockCanvas);
          this.loadingPromises.delete(path);
          resolve(mockCanvas);
        });
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.imageCache.set(path, img);
        this.loadingPromises.delete(path);

        // Atualiza todos os spritesheets que utilizam este imagePath
        for (const sheet of this.spriteSheets.values()) {
          if (sheet.imagePath === path) {
            sheet.imageSource = img;
          }
        }

        resolve(img);
      };
      img.onerror = (err) => {
        this.loadingPromises.delete(path);
        reject(new Error(`Falha ao carregar asset de imagem no caminho: ${path} (${String(err)})`));
      };
      img.src = path;
    });

    this.loadingPromises.set(path, promise);
    return promise;
  }

  /**
   * Retorna se a imagem de um determinado spritesheet já está carregada e pronta para renderizar no Canvas.
   */
  public isReady(spriteSheetId: string): boolean {
    const sheet = this.spriteSheets.get(spriteSheetId);
    return Boolean(sheet && sheet.imageSource);
  }

  /**
   * Registra os spritesheets canônicos do jogo com metadados estruturados.
   * Por padrão, a imagem permanece `null`, garantindo que o fallback técnico do Renderer seja utilizado
   * com precisão até que um asset real seja adicionado.
   */
  private registerDefaultSpriteSheets(): void {
    // 1. Definição do Spritesheet do Player (32×64 px)
    // Grade top-down clássica de 4 direções:
    // Linhas 0..3: Idle (Down, Up, Left, Right) com 2 frames
    // Linhas 4..7: Walk (Down, Up, Left, Right) com 4 frames
    // Linhas 8..11: Chop (Down, Up, Left, Right) com 4 frames (ação de machado)
    // Linhas 12..15: Use Tool/Item genérico (Down, Up, Left, Right) com 4 frames
    const playerSheet = createGridSpriteSheet({
      id: 'player',
      imagePath: '/src/assets/player/player_base.png',
      frameWidth: 32,
      frameHeight: 64,
      animationConfigs: {
        idle: {
          rowStart: 0,
          frameCount: 2,
          frameDuration: 0.5,
          hasDirections: true,
          loop: true,
        },
        walk: {
          rowStart: 4,
          frameCount: 4,
          frameDuration: 0.15,
          hasDirections: true,
          loop: true,
        },
        chop: {
          rowStart: 8,
          frameCount: 4,
          frameDuration: 0.1,
          hasDirections: true,
          loop: false,
        },
        use_item: {
          rowStart: 12,
          frameCount: 4,
          frameDuration: 0.1,
          hasDirections: true,
          loop: false,
        },
      },
    });
    this.registerSpriteSheet(playerSheet);

    // 2. Definição do Spritesheet de Árvore (Vegetação: 32×48 px)
    // Linha 0: Árvore intacta
    // Linha 1: Toco remanescente (árvore cortada)
    const treeSheet = createGridSpriteSheet({
      id: 'tree',
      imagePath: '/src/assets/vegetation/tree.png',
      frameWidth: 32,
      frameHeight: 48,
      animationConfigs: {
        intact: {
          rowStart: 0,
          frameCount: 1,
          frameDuration: 1.0,
          hasDirections: false,
          loop: true,
        },
        stump: {
          rowStart: 1,
          frameCount: 1,
          frameDuration: 1.0,
          hasDirections: false,
          loop: true,
        },
      },
    });
    this.registerSpriteSheet(treeSheet);

    // 3. Definição dos Itens e Ferramentas (16×16 px)
    const itemIds = ['wood', 'axe', 'stone', 'flower'] as const;
    for (const itemId of itemIds) {
      const itemSheet = createGridSpriteSheet({
        id: `item_${itemId}`,
        imagePath: `/src/assets/items/${itemId}.png`,
        frameWidth: 16,
        frameHeight: 16,
        animationConfigs: {
          idle: {
            rowStart: 0,
            frameCount: 1,
            frameDuration: 1.0,
            hasDirections: false,
            loop: true,
          },
        },
      });
      this.registerSpriteSheet(itemSheet);

      // Alias para busca direta pelo itemId
      const itemDirectSheet = createGridSpriteSheet({
        id: itemId,
        imagePath: `/src/assets/items/${itemId}.png`,
        frameWidth: 16,
        frameHeight: 16,
        animationConfigs: {
          idle: {
            rowStart: 0,
            frameCount: 1,
            frameDuration: 1.0,
            hasDirections: false,
            loop: true,
          },
        },
      });
      this.registerSpriteSheet(itemDirectSheet);
    }
  }
}
