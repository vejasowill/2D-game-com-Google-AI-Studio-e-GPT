/**
 * Categoria ou tipo funcional genérico da ferramenta no jogo.
 * Suporta ferramentas canônicas (machado, picareta, pá, enxada, regador) e tipos extensíveis.
 */
export type ToolCategory =
  | 'axe'
  | 'pickaxe'
  | 'shovel'
  | 'hoe'
  | 'watering_can'
  | 'weapon'
  | 'fishing_rod'
  | 'custom'
  | string;

/**
 * Domínio declarativo do alvo principal da ferramenta.
 * - 'object': Opera sobre WorldObjects espaciais (ex: árvores com machado, rochas com picareta);
 * - 'tile': Opera sobre células discretas do terreno (ex: solo com enxada, poça com balde);
 * - 'any': Avalia objetos ou terreno polimorficamente sem discriminação.
 */
export type ToolTargetDomain = 'object' | 'tile' | 'any';

/**
 * Requisitos opcionais declarativos para o uso de uma ferramenta.
 * Preparado para futuros sistemas de nível, stamina ou condições ambientais.
 */
export interface ToolRequirements {
  readonly requiredLevel?: number;
  readonly staminaCost?: number;
  readonly energyCost?: number;
  readonly customRequirements?: Readonly<Record<string, unknown>>;
}

/**
 * Configuração declarativa de animação visual opcional da ferramenta.
 * Conecta-se à infraestrutura de SpriteAnimation/AssetManager existente sem acoplamento direto.
 */
export interface ToolAnimationConfig {
  readonly animationName?: string;
  readonly frameDuration?: number;
  readonly totalFrames?: number;
}

/**
 * Definição imutável, declarativa e central de uma ferramenta no jogo.
 *
 * Princípios arquiteturais:
 * 1. A ferramenta é uma definição de comportamento associada a um item (itemId), NÃO um tipo especial de item hardcoded.
 * 2. Totalmente imutável (Object.freeze) e independente de Renderer, Canvas ou sprites carregados.
 * 3. Permite adicionar machado, picareta, pá, enxada, regador e novas ferramentas sem alterar o ItemUseSystem.
 * 4. Desacoplada de branches como `if (itemId === 'axe')`.
 */
export interface ToolDefinition {
  /** Identificador estável e único da ferramenta (ex: 'basic_axe', 'iron_pickaxe') */
  readonly id: string;

  /** Identificador do item correspondente no inventário (ItemDefinition.id, ex: 'axe') */
  readonly itemId: string;

  /** Categoria da ferramenta (ex: 'axe', 'pickaxe', 'shovel', 'hoe', 'watering_can') */
  readonly category: ToolCategory;

  /** Identificador da ação abstrata executada (ex: 'chop', 'mine', 'dig', 'till', 'water') */
  readonly action: string;

  /** Alcance físico máximo da ação em pixels (ex: 36) */
  readonly range: number;

  /** Tempo de recarga entre usos sucessivos em segundos (ex: 0.4) */
  readonly cooldown: number;

  /** Duração em segundos da ação e do bloqueio transitório de movimento do jogador (ex: 0.2) */
  readonly actionDuration: number;

  /** Prioridade opcional para desempate entre ferramentas associadas */
  readonly priority?: number;

  /** Indica se a ação exige obrigatoriamente um alvo válido ao alcance (padrão true para ferramentas de impacto) */
  readonly requiresTarget?: boolean;

  /** Domínio preferencial de alvo da ferramenta: 'object' (padrão), 'tile' (terreno) ou 'any' */
  readonly targetDomain?: ToolTargetDomain;

  /** Custo declarativo opcional de energia/stamina para executar a ação desta ferramenta */
  readonly energyCost?: number;

  /** Requisitos declarativos opcionais para validação antes do uso */
  readonly requirements?: ToolRequirements;

  /** Identificador simbólico de asset visual opcional para renderização pixel art */
  readonly spriteAssetId?: string;

  /** Configuração declarativa de animação opcional */
  readonly animationConfig?: ToolAnimationConfig;

  /** Parâmetros declarativos customizados imutáveis específicos da ação */
  readonly customParams?: Readonly<Record<string, unknown>>;
}
