/**
 * Tipos de ícones declarativos suportados pelo sistema de renderização de itens.
 *
 * Princípios arquiteturais:
 * 1. O ItemDefinition declara o kind do seu ícone (ex: 'axe', 'hoe', 'wood', etc.).
 * 2. O ItemIconRenderer sabe desenhar proceduralmente cada kind de forma pixel-art e determinística.
 * 3. Se um spritesheet do AssetManager estiver presente, o sprite real tem prioridade sobre o fallback procedural.
 * 4. Extensível: adicionar um novo item requer apenas declarar seu iconKind.
 */
export type ItemIconKind =
  | 'wood'
  | 'stone'
  | 'flower'
  | 'axe'
  | 'hoe'
  | 'watering_can'
  | 'seed'
  | 'turnip'
  | 'generic';

/**
 * Informações visuais declarativas de ícone associadas ao ItemDefinition.
 */
export interface ItemIconDefinition {
  /** Categoria visual primária do ícone */
  readonly kind: ItemIconKind;

  /** Cor principal opcional para customização sem alterar a silhueta */
  readonly primaryColor?: string;

  /** Cor secundária opcional para detalhes */
  readonly secondaryColor?: string;
}
