import { ItemUseDefinition } from './ItemUseTypes.ts';
import { ItemIconDefinition } from './ItemIconTypes.ts';

/**
 * Categoria genérica opcional de um item.
 * Utilizada para agrupamento lógico sem acoplamento a regras de gameplay.
 */
export type ItemCategory = 'material' | 'flora' | 'consumable' | 'tool' | 'seed' | 'watering_can' | 'misc';

/**
 * Definição imutável e declarativa de um item.
 *
 * Princípios arquiteturais:
 * 1. Descreve as propriedades intrínsecas e estáveis do item, NÃO sua quantidade ou posição no mundo.
 * 2. NÃO herda de WorldObject nem possui coordenadas físicas.
 * 3. NÃO contém lógica de inventário, combate, ferramentas ou crafting acoplada.
 * 4. spriteAssetId é uma referência simbólica que pode ou não ter um asset carregado no AssetManager.
 * 5. useDefinition declara o comportamento de uso do item de forma genérica e extensível.
 * 6. icon declara a representação visual procedimental/identificável do ícone do item.
 */
export interface ItemDefinition {
  /** Identificador único, estável e canônico do item (ex: 'wood', 'stone', 'flower', 'axe') */
  readonly id: string;

  /** Nome amigável de exibição (ex: 'Madeira', 'Pedra', 'Machado') */
  readonly name: string;

  /** Quantidade máxima permitida em um único ItemStack (inteiro positivo > 0) */
  readonly maxStackSize: number;

  /** Categoria genérica opcional do item */
  readonly category?: ItemCategory | string;

  /** Identificador opcional do asset no AssetManager para renderização visual pixel art */
  readonly spriteAssetId?: string;

  /** Descrição textual opcional */
  readonly description?: string;

  /** Definição declarativa opcional do comportamento de uso deste item */
  readonly useDefinition?: ItemUseDefinition;

  /** Metadados visuais declarativos para ícone de Hotbar e Inventário */
  readonly icon?: ItemIconDefinition;
}

/**
 * Tamanho padrão de empilhamento para itens gerais.
 */
export const DEFAULT_MAX_STACK_SIZE = 99;
