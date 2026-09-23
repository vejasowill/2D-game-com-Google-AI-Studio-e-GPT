# Guia de Extensão de Assets e Spritesheets

Este documento orienta de maneira direta e objetiva como adicionar e substituir artes visuais (pixel art) no jogo sem modificar nenhuma regra de gameplay, física, colisão ou inventário.

---

## 1. Estrutura de Diretórios de Assets

Coloque seus arquivos `.png` nos diretórios correspondentes:

- `src/assets/player/` → Spritesheets do personagem principal (base, caminhada, uso de ferramentas).
- `src/assets/vegetation/` → Vegetação e árvores (árvores intactas, tocos, folhas).
- `src/assets/items/` → Ícones de inventário e drops no mundo (madeira, pedra, flores, machado).
- `src/assets/objects/` → Objetos estáticos ou interativos de cenário (pedras grandes, tochas, baús).
- `src/assets/animals/` → Animais pacíficos futuros.
- `src/assets/creatures/` → Monstros / criaturas futuras.
- `src/assets/effects/` → Efeitos visuais de impacto, partículas e poeira.

---

## 2. Onde e Como Declarar o Spritesheet

A declaração é feita de forma puramente declarativa no método `registerDefaultSpriteSheets()` de `src/game/AssetManager.ts`.

Utilize a função utilitária `createGridSpriteSheet`:

```typescript
import { createGridSpriteSheet } from './SpriteSheet.ts';

// Exemplo: Registrando a árvore
const treeSheet = createGridSpriteSheet({
  id: 'tree', // ID canônico
  imagePath: '/src/assets/vegetation/tree.png', // Caminho da imagem
  frameWidth: 32, // Largura de 1 frame em pixels
  frameHeight: 48, // Altura de 1 frame em pixels
  animationConfigs: {
    intact: {
      rowStart: 0, // Linha de início na grade da imagem
      frameCount: 1, // Quantidade de quadros
      frameDuration: 1.0, // Duração de cada quadro em segundos
      hasDirections: false, // true para 4 direções (down, up, left, right), false para direção única
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
```

---

## 3. Padrão de Grade para Personagens e Criaturas com 4 Direções

Quando `hasDirections: true` é configurado, a função `createGridSpriteSheet` consome automaticamente 4 linhas consecutivas da grade para as direções cardinais:
- Linha `rowStart + 0`: **DOWN** (olhando para baixo / câmera)
- Linha `rowStart + 1`: **UP** (olhando para cima / costas)
- Linha `rowStart + 2`: **LEFT** (olhando para a esquerda)
- Linha `rowStart + 3`: **RIGHT** (olhando para a direita)

Exemplo para o Player:
```typescript
const playerSheet = createGridSpriteSheet({
  id: 'player',
  imagePath: '/src/assets/player/player_base.png',
  frameWidth: 32,
  frameHeight: 64,
  animationConfigs: {
    idle: {
      rowStart: 0, // Linhas 0, 1, 2, 3
      frameCount: 2,
      frameDuration: 0.5,
      hasDirections: true,
      loop: true,
    },
    walk: {
      rowStart: 4, // Linhas 4, 5, 6, 7
      frameCount: 4,
      frameDuration: 0.15,
      hasDirections: true,
      loop: true,
    },
    chop: {
      rowStart: 8, // Linhas 8, 9, 10, 11
      frameCount: 4,
      frameDuration: 0.1,
      hasDirections: true,
      loop: false,
    },
  },
});
```

---

## 4. Como Associar o Asset a uma Entidade ou Item

### A. Para Itens e Ferramentas (Inventário, Hotbar e Drops no chão):
No arquivo `src/game/ItemDefinition.ts` (ou no `ItemRegistry`), declare a propriedade `spriteAssetId`:

```typescript
ItemRegistry.register({
  id: 'axe',
  name: 'Machado',
  description: 'Uma ferramenta afiada para cortar árvores.',
  maxStackSize: 1,
  spriteAssetId: 'item_axe', // ID registrado no AssetManager
  useDefinition: {
    action: 'chop',
    range: 36,
    cooldown: 0.4,
  },
});
```

### B. Para Objetos do Mundo (ex: Árvores, Pedras):
No arquivo do objeto (ex: `src/game/NaturalTreeObject.ts`), o `Renderer` consulta o `AssetManager` pelo ID do tipo de objeto (`'tree'`) ou pelo `spriteAssetId`:
- Se a imagem existir e estiver carregada, o `SpriteRenderer` desenha o frame recortado em inteiros com `imageSmoothingEnabled = false`.
- Se o arquivo de imagem ainda não tiver sido colocado na pasta, o jogo usa automaticamente o **fallback procedural pixel art** existente sem erros ou tela preta.

---

## 5. Carregamento em Tempo de Execução

Para iniciar o carregamento assíncrono de uma imagem real (por exemplo, no bootstrap do jogo):
```typescript
await AssetManager.getInstance().loadImage('/src/assets/player/player_base.png');
```
O `AssetManager` deduplica promessas de forma segura e mantém um cache por URL/caminho.
