import { WorldCoord } from './types.ts';

/**
 * Interface base conceitual para qualquer objeto ou entidade posicionado no mundo do jogo.
 *
 * Separação conceitual:
 * - TERRENO (Tiles): grade contínua de blocos (GRASS, WATER) controlada pelo ChunkManager.
 * - OBJETOS DO MUNDO (WorldObjects): entidades discretas com posição contínua (pixels),
 *   identificador estável, dimensões espaciais e propriedades próprias, posicionadas sobre o terreno
 *   sem alterar o tipo ou identidade do tile subjacente.
 *
 * Exemplos futuros: árvores, pedras, flores, construções, baús, NPCs, itens jogados no chão.
 */
export interface WorldObject {
  /** Identificador único e estável da instância do objeto no mundo */
  readonly id: string;

  /** Tipo ou classificação do objeto (ex: 'tree', 'rock', 'chest', etc.) */
  readonly type: string;

  /** Posição contínua no espaço do mundo (em pixels) */
  readonly position: WorldCoord;

  /** Largura espacial da entidade (em pixels), para futuro culling, render e colisão */
  readonly width: number;

  /** Altura espacial da entidade (em pixels), para futuro culling, render e colisão */
  readonly height: number;
}
