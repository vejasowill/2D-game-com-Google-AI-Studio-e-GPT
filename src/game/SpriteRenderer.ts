import { Camera } from './Camera.ts';
import { SpriteFrame } from './SpriteAnimation.ts';
import { SpriteSheetDefinition } from './SpriteSheet.ts';
import { ViewportSize } from './types.ts';
import { VisualBounds } from './VisualAnchor.ts';

/**
 * Renderizador centralizado de Pixel Art.
 *
 * Princípios de Pixel Art aplicados:
 * 1. imageSmoothingEnabled = false garantido em todas as chamadas.
 * 2. Amostragem Nearest-Neighbor estrita (nenhuma interpolação bilinear ou anti-aliasing em sprites).
 * 3. Alinhamento de coordenadas inteiras no Canvas para evitar sub-pixel blur.
 * 4. Recorte exato dos frames (sx, sy, sWidth, sHeight).
 * 5. Frustum culling baseado na caixa delimitadora visual da entidade.
 * 6. Fallback gracioso quando a arte definitiva ainda não foi fornecida pelo usuário.
 */
export class SpriteRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.enforcePixelArtSmoothing();
  }

  /**
   * Assegura que o contexto do Canvas desative qualquer algoritmo de suavização de imagem.
   */
  public enforcePixelArtSmoothing(): void {
    this.ctx.imageSmoothingEnabled = false;
    // Suporte a prefixos legados de navegadores caso existam no contexto
    const ctxAny = this.ctx as unknown as Record<string, unknown>;
    if ('webkitImageSmoothingEnabled' in ctxAny) {
      ctxAny.webkitImageSmoothingEnabled = false;
    }
    if ('mozImageSmoothingEnabled' in ctxAny) {
      ctxAny.mozImageSmoothingEnabled = false;
    }
    if ('msImageSmoothingEnabled' in ctxAny) {
      ctxAny.msImageSmoothingEnabled = false;
    }
  }

  /**
   * Renderiza um sprite na tela utilizando a Camera e os limites visuais da entidade.
   *
   * @param camera Instância da Camera para conversão mundo -> tela.
   * @param viewport Dimensões da tela/viewport.
   * @param visualBounds Caixa delimitadora calculada da entidade no mundo.
   * @param spriteSheet Definição do spritesheet com a imagem fonte carregada.
   * @param spriteFrame Coordenadas de recorte do frame atual.
   * @param renderFallback Callback de fallback técnico executado quando o asset de imagem não estiver presente.
   * @returns boolean Indicando se o sprite foi desenhado (true) ou se sofreu frustum culling (false).
   */
  public renderSprite(
    camera: Camera,
    viewport: ViewportSize,
    visualBounds: VisualBounds,
    spriteSheet?: SpriteSheetDefinition | null,
    spriteFrame?: SpriteFrame | null,
    renderFallback?: (screenBounds: {
      screenX: number;
      screenY: number;
      width: number;
      height: number;
      screenFootX: number;
      screenFootY: number;
    }) => void,
  ): boolean {
    // 1. Converter coordenadas mundiais do topo-esquerdo do visual para coordenadas de tela
    const screenPos = camera.worldToScreen(
      { worldX: visualBounds.worldX, worldY: visualBounds.worldY },
      viewport,
    );

    const destWidth = visualBounds.width;
    const destHeight = visualBounds.height;

    // 2. Frustum Culling com margem de segurança
    const margin = 16;
    if (
      screenPos.screenX + destWidth + margin < 0 ||
      screenPos.screenX - margin > viewport.width ||
      screenPos.screenY + destHeight + margin < 0 ||
      screenPos.screenY - margin > viewport.height
    ) {
      return false;
    }

    // 3. Força configuração de Pixel Art
    this.enforcePixelArtSmoothing();

    // 4. Se a imagem do spritesheet estiver carregada e o frame for válido, desenha a Pixel Art
    if (spriteSheet && spriteSheet.imageSource && spriteFrame) {
      // Coordenadas inteiras na tela evitam sub-pixel blur em telas não inteiras
      const drawX = Math.round(screenPos.screenX);
      const drawY = Math.round(screenPos.screenY);

      this.ctx.drawImage(
        spriteSheet.imageSource,
        spriteFrame.sx,
        spriteFrame.sy,
        spriteFrame.sWidth,
        spriteFrame.sHeight,
        drawX,
        drawY,
        destWidth,
        destHeight,
      );
      return true;
    }

    // 5. Fallback técnico: aciona a rotina temporária quando o asset não estiver presente
    if (renderFallback) {
      const screenFootX = screenPos.screenX + destWidth / 2;
      const screenFootY = screenPos.screenY + destHeight;
      renderFallback({
        screenX: screenPos.screenX,
        screenY: screenPos.screenY,
        width: destWidth,
        height: destHeight,
        screenFootX,
        screenFootY,
      });
      return true;
    }

    return false;
  }
}
