import { AssetManager } from './AssetManager.ts';
import { ItemDefinition } from './ItemDefinition.ts';
import { ItemIconKind } from './ItemIconTypes.ts';

/**
 * Renderizador desacoplado e declarativo de ícones de itens.
 *
 * Princípios arquiteturais:
 * 1. O ItemDefinition declara seu tipo visual (ItemIconKind).
 * 2. O ItemIconRenderer concentra todo o conhecimento de desenho (pixel-art procedural ou sprite do AssetManager).
 * 3. Hotbar, Inventário e qualquer HUD futura chamam unicamente ItemIconRenderer.renderIcon().
 * 4. Zero cadeias acopladas de "if (itemId === ...)": a representação é puramente baseada no ItemIconKind.
 * 5. Se houver um spritesheet carregado no AssetManager, ele tem prioridade sobre o fallback procedural.
 */
export class ItemIconRenderer {
  /**
   * Renderiza o ícone de um item dentro da caixa delimitadora [x, y, size, size].
   *
   * @param ctx Contexto 2D do Canvas
   * @param itemDef Definição declarativa do item (ou null/undefined)
   * @param x Coordenada X do canto superior esquerdo
   * @param y Coordenada Y do canto superior esquerdo
   * @param size Largura e altura da área do ícone (padrão 16px)
   */
  public static renderIcon(
    ctx: CanvasRenderingContext2D,
    itemDef: ItemDefinition | null | undefined,
    x: number,
    y: number,
    size: number = 16,
  ): void {
    if (!itemDef) {
      return;
    }

    // 1. Prioridade máxima: Spritesheet registrado no AssetManager (suporte a sprites externos futuros)
    const assetId = itemDef.spriteAssetId ?? `item_${itemDef.id}`;
    const itemSheet =
      AssetManager.getInstance().getSpriteSheet(assetId) ??
      AssetManager.getInstance().getSpriteSheet(itemDef.id);

    if (itemSheet && itemSheet.imageSource) {
      const frame = itemSheet.getFrame('idle') ?? itemSheet.getFrame('default');
      if (frame && typeof ctx.drawImage === 'function') {
        ctx.drawImage(
          itemSheet.imageSource,
          frame.sx,
          frame.sy,
          frame.sWidth,
          frame.sHeight,
          Math.round(x),
          Math.round(y),
          size,
          size,
        );
        return;
      }
    }

    // 2. Fallback declarativo: Renderização procedural pixel-art baseada estritamente no icon.kind
    const kind: ItemIconKind = itemDef.icon?.kind ?? 'generic';
    this.renderProceduralIcon(ctx, kind, Math.round(x), Math.round(y), size);
  }

  /**
   * Desenha proceduralmente o ícone correspondente ao kind solicitado com proporções pixel-art.
   */
  public static renderProceduralIcon(
    ctx: CanvasRenderingContext2D,
    kind: ItemIconKind,
    x: number,
    y: number,
    size: number = 16,
  ): void {
    // Normalização para grade de 16x16 pixels centralizada
    const s = size / 16;
    const px = (relX: number) => Math.round(x + relX * s);
    const py = (relY: number) => Math.round(y + relY * s);
    const pw = (w: number) => Math.max(1, Math.round(w * s));
    const ph = (h: number) => Math.max(1, Math.round(h * s));

    const fillRect = (rx: number, ry: number, rw: number, rh: number, color: string) => {
      ctx.fillStyle = color;
      if (typeof ctx.fillRect === 'function') {
        ctx.fillRect(px(rx), py(ry), pw(rw), ph(rh));
      }
    };

    switch (kind) {
      case 'wood': {
        // Tronco de madeira: casca marrom, corte transversal com anéis de crescimento e veio
        fillRect(1, 4, 14, 8, '#78350f'); // Casca externa escura
        fillRect(2, 5, 12, 6, '#92400e'); // Madeira principal
        fillRect(11, 4, 3, 8, '#b45309'); // Face do corte transversal
        fillRect(12, 5, 2, 6, '#d97706'); // Anel interno
        fillRect(12, 7, 1, 2, '#451a03'); // Miolo/medula central
        fillRect(3, 7, 7, 2, '#b45309'); // Linha de veio da madeira
        fillRect(2, 10, 12, 2, '#451a03'); // Sombra inferior da tora
        break;
      }

      case 'stone': {
        // Fragmento de pedra: silhueta facetada, faces iluminadas e sombras
        fillRect(3, 5, 10, 8, '#334155'); // Sombra de base
        fillRect(2, 4, 11, 8, '#475569'); // Corpo principal da rocha
        fillRect(3, 3, 8, 4, '#64748b'); // Faceta superior
        fillRect(4, 2, 5, 2, '#94a3b8'); // Aresta clara superior
        fillRect(3, 4, 4, 2, '#cbd5e1'); // Brilho de quina iluminada
        fillRect(8, 7, 4, 3, '#1e293b'); // Fratura/fenda rochosa
        fillRect(4, 10, 8, 2, '#0f172a'); // Sombra de contato
        break;
      }

      case 'flower': {
        // Flor silvestre: haste verde, folhas, pétalas magenta/vermelhas e miolo dourado
        fillRect(7, 8, 2, 7, '#15803d'); // Haste vertical
        fillRect(5, 11, 2, 2, '#22c55e'); // Folha esquerda
        fillRect(9, 10, 2, 2, '#22c55e'); // Folha direita
        // Pétalas em cruz (4 pétalas cardeais)
        fillRect(6, 2, 4, 3, '#f43f5e'); // Pétala superior
        fillRect(6, 7, 4, 3, '#e11d48'); // Pétala inferior
        fillRect(3, 4, 3, 4, '#fb7185'); // Pétala esquerda
        fillRect(10, 4, 3, 4, '#e11d48'); // Pétala direita
        // Miolo floral central
        fillRect(6, 4, 4, 4, '#fef08a'); // Miolo claro
        fillRect(7, 5, 2, 2, '#f59e0b'); // Centro dourado brilhante
        break;
      }

      case 'axe': {
        // Machado: cabo de madeira inclinado, amarração, lâmina de ferro e gume afiado
        // Cabo de madeira (diagonal 45 graus)
        fillRect(4, 12, 3, 3, '#78350f');
        fillRect(6, 10, 3, 3, '#92400e');
        fillRect(8, 8, 3, 3, '#92400e');
        fillRect(10, 6, 3, 3, '#b45309');
        fillRect(12, 4, 3, 3, '#d97706');
        // Olho e bloco da cabeça de ferro
        fillRect(9, 3, 5, 5, '#475569');
        // Lâmina curva do machado
        fillRect(5, 2, 5, 6, '#64748b');
        fillRect(4, 2, 2, 6, '#94a3b8');
        // Gume brilhante e afiado
        fillRect(3, 2, 1, 6, '#f8fafc');
        fillRect(4, 1, 2, 1, '#f8fafc');
        fillRect(4, 8, 2, 1, '#f8fafc');
        break;
      }

      case 'hoe': {
        // Enxada: cabo de madeira longo, suporte metálico e lâmina horizontal com gume
        // Cabo longo de madeira
        fillRect(3, 12, 3, 3, '#78350f');
        fillRect(5, 10, 3, 3, '#92400e');
        fillRect(7, 8, 3, 3, '#92400e');
        fillRect(9, 6, 3, 3, '#b45309');
        fillRect(11, 4, 3, 3, '#b45309');
        // Curvatura metálica da enxada
        fillRect(11, 2, 3, 3, '#475569');
        fillRect(7, 2, 5, 2, '#64748b');
        // Lâmina larga perpendicular para sachar o solo
        fillRect(5, 3, 4, 5, '#94a3b8');
        fillRect(4, 4, 2, 4, '#cbd5e1');
        // Borda afiada inferior
        fillRect(4, 7, 5, 1, '#f8fafc');
        break;
      }

      case 'watering_can': {
        // Regador: corpo cilíndrico azul, alça curva arqueada, bico longo com aspersor
        // Corpo cilíndrico
        fillRect(3, 6, 8, 8, '#0284c7'); // Azul base
        fillRect(4, 7, 6, 6, '#0ea5e9'); // Reflexo no bojo
        fillRect(4, 6, 6, 1, '#38bdf8'); // Borda superior do tanque
        // Alça superior arredondada
        fillRect(3, 3, 2, 4, '#0369a1');
        fillRect(4, 2, 5, 2, '#38bdf8');
        fillRect(8, 3, 2, 4, '#0369a1');
        // Bico diagonal projetado para frente
        fillRect(10, 8, 2, 2, '#0369a1');
        fillRect(11, 7, 2, 2, '#0ea5e9');
        fillRect(12, 6, 2, 2, '#38bdf8');
        // Aspersor/cabeça furada com gotas de água sutis
        fillRect(13, 5, 2, 4, '#7dd3fc');
        fillRect(14, 9, 1, 2, '#bae6fd'); // Gota/orvalho saindo
        break;
      }

      case 'seed': {
        // Semente / Saquinho de sementes: saco rústico amarrado com cordinha e broto
        fillRect(4, 6, 8, 8, '#b45309'); // Saco de estopa base
        fillRect(5, 7, 6, 6, '#d97706'); // Corpo do saco iluminado
        fillRect(5, 5, 6, 2, '#78350f'); // Franzido do topo amarrado
        fillRect(6, 4, 4, 2, '#f59e0b'); // Borda aberta do saquinho
        fillRect(6, 5, 4, 1, '#451a03'); // Fita de amarração marrom
        // Pequena semente verde saindo ou brotinho indicativo
        fillRect(7, 2, 2, 2, '#22c55e'); // Folhinha
        fillRect(8, 1, 2, 2, '#4ade80'); // Broto viçoso
        break;
      }

      case 'turnip': {
        // Nabo: folhas verdes no topo, coroa roxa/violeta, bulbo branco e raiz inferior
        // Folhas verdes eretas e ramificadas
        fillRect(7, 1, 2, 4, '#15803d'); // Caule central das folhas
        fillRect(5, 2, 2, 3, '#22c55e'); // Folha esquerda
        fillRect(9, 2, 2, 3, '#22c55e'); // Folha direita
        fillRect(6, 1, 4, 2, '#4ade80'); // Pontas frescas
        // Coroa roxa característica de nabo
        fillRect(5, 5, 6, 3, '#9333ea');
        fillRect(6, 5, 4, 2, '#c084fc');
        // Corpo do bulbo arredondado branco/marfim
        fillRect(4, 7, 8, 5, '#f8fafc');
        fillRect(5, 8, 6, 4, '#ffffff');
        fillRect(7, 12, 2, 2, '#e2e8f0'); // Ponta cônica
        fillRect(7, 14, 1, 2, '#cbd5e1'); // Raizzinha filamentosa
        break;
      }

      case 'generic':
      default: {
        // Ícone genérico seguro: caixa/pacote discreto com contorno contrastante
        fillRect(3, 3, 10, 10, '#334155');
        fillRect(4, 4, 8, 8, '#64748b');
        fillRect(5, 5, 6, 6, '#94a3b8');
        fillRect(7, 7, 2, 2, '#f8fafc');
        break;
      }
    }
  }
}
