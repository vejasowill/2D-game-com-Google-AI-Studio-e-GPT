import { World } from './World.ts';
import { Player } from './Player.ts';
import { PlaceTileSystem } from './PlaceTileSystem.ts';
import { PlaceableTileRegistry, WOODEN_FLOOR_PLACEABLE } from './PlaceableTileRegistry.ts';
import { PlaceableTileDefinition } from './PlaceableTileDefinition.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { InputSource, TileType, Vector2D } from './types.ts';
import { createItemStack } from './ItemStack.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';
import { ChunkManager } from './ChunkManager.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { TileRegistry } from './TileRegistry.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[FALHA NO TESTE] ${message}`);
  }
}

class MockInputSource implements InputSource {
  public activeActions: Set<string> = new Set();
  public justPressedActions: Set<string> = new Set();
  public movement: Vector2D = { x: 0, y: 0 };

  public getMovementDirection(): Vector2D {
    return this.movement;
  }

  public isActionPressed(action: string): boolean {
    return this.activeActions.has(action);
  }

  public isActionJustPressed(action: string): boolean {
    return this.justPressedActions.has(action);
  }

  public triggerJustPressed(action: string): void {
    this.justPressedActions.add(action);
    this.activeActions.add(action);
  }

  public clearFrameState(): void {
    this.justPressedActions.clear();
  }
}

console.log('--- Iniciando Suíte Completa de Testes do PlaceTileSystem (A até T) ---');

// Inicializações prévias
ItemRegistry.ensureInitialized();
PlaceableTileRegistry.ensureInitialized();

// =========================================================================
// TESTE A: Colocar bloco com item válido
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Equipar madeira no slot 0
  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  // Alvo adjacente válido dentro de alcance (ex: tile 3, 3 -> centro 112, 112)
  const targetTile = { tileX: 3, tileY: 3 };
  const initialEffective = world.getEffectiveTile(targetTile.tileX, targetTile.tileY);

  const result = placeTileSystem.executePlace(player, world, targetTile);

  assert(result.success === true, 'A: Colocação com item válido deve suceder');
  assert(result.resultingTileType === TileType.WOOD_FLOOR, 'A: Tipo resultante deve ser WOOD_FLOOR');
  assert(
    world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR,
    'A: getEffectiveTile deve refletir WOOD_FLOOR',
  );
  console.log('✓ Requisito A passou: Colocar bloco com item válido');
}

// =========================================================================
// TESTE B: Consumir exatamente 1 item
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  const targetTile = { tileX: 3, tileY: 3 };
  const result = placeTileSystem.executePlace(player, world, targetTile);

  assert(result.success === true, 'B: Colocação deve suceder');
  assert(result.consumedAmount === 1, 'B: Quantidade consumida deve ser exatamente 1');
  const slot = player.getInventory().getSlot(0);
  assert(slot !== null && slot.quantity === 4, 'B: Slot deve conter exatamente 4 itens restantes');
  console.log('✓ Requisito B passou: Consumir exatamente 1 item');
}

// =========================================================================
// TESTE C: Limpar slot quando quantidade chega a zero
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 1));
  player.getHotbar().setSelectedSlot(0);

  const targetTile = { tileX: 3, tileY: 3 };
  const result = placeTileSystem.executePlace(player, world, targetTile);

  assert(result.success === true, 'C: Colocação de último item deve suceder');
  const slot = player.getInventory().getSlot(0);
  assert(slot === null, 'C: Slot do inventário deve ser limpo para null quando zerar');
  assert(player.getEquippedStack() === null, 'C: Item equipado na hotbar deve ser null');
  console.log('✓ Requisito C passou: Limpar slot quando quantidade chega a zero');
}

// =========================================================================
// TESTE D: Preservar stack quando quantidade > 1
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 10));
  player.getHotbar().setSelectedSlot(0);

  placeTileSystem.executePlace(player, world, { tileX: 3, tileY: 3 });
  assert(player.getInventory().getSlot(0)?.quantity === 9, 'D: Quantidade deve ser 9');

  placeTileSystem.executePlace(player, world, { tileX: 4, tileY: 3 });
  assert(player.getInventory().getSlot(0)?.quantity === 8, 'D: Quantidade deve ser 8');
  console.log('✓ Requisito D passou: Preservar stack quando quantidade > 1');
}

// =========================================================================
// TESTE E: Rejeitar sem item
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Sem itens no inventário
  player.getHotbar().setSelectedSlot(0);

  const targetTile = { tileX: 3, tileY: 3 };
  const before = world.getEffectiveTile(targetTile.tileX, targetTile.tileY);
  const result = placeTileSystem.executePlace(player, world, targetTile);

  assert(result.success === false, 'E: Deve falhar sem item equipado');
  assert(result.failureReason === 'NO_ITEM_EQUIPPED', 'E: Razão deve ser NO_ITEM_EQUIPPED');
  assert(
    world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === before?.type,
    'E: Mundo não deve ser modificado',
  );
  console.log('✓ Requisito E passou: Rejeitar sem item');
}

// =========================================================================
// TESTE F: Rejeitar item sem definição colocável
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Equipar ferramenta 'axe' (que não possui definição colocável no PlaceableTileRegistry)
  player.getInventory().setSlot(0, createItemStack('axe', 1));
  player.getHotbar().setSelectedSlot(0);

  const targetTile = { tileX: 3, tileY: 3 };
  const before = world.getEffectiveTile(targetTile.tileX, targetTile.tileY);
  const result = placeTileSystem.executePlace(player, world, targetTile);

  assert(result.success === false, 'F: Deve falhar para item não colocável');
  assert(result.failureReason === 'NOT_PLACEABLE', 'F: Razão deve ser NOT_PLACEABLE');
  assert(player.getInventory().getSlot(0)?.quantity === 1, 'F: Machado não deve ser consumido');
  assert(
    world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === before?.type,
    'F: Terreno não deve ser alterado',
  );
  console.log('✓ Requisito F passou: Rejeitar item sem definição colocável');
}

// =========================================================================
// TESTE G: Rejeitar tile fora do alcance
// =========================================================================
{
  const world = new World(12345);
  // Player em (100, 100)
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64); // max range 64 px

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  // Tile distante (10, 10) -> centro (336, 336), distância > 300px
  const farTile = { tileX: 10, tileY: 10 };
  const before = world.getEffectiveTile(farTile.tileX, farTile.tileY);
  const result = placeTileSystem.executePlace(player, world, farTile);

  assert(result.success === false, 'G: Deve rejeitar colocação fora de alcance');
  assert(result.failureReason === 'OUT_OF_RANGE', 'G: Razão deve ser OUT_OF_RANGE');
  assert(player.getInventory().getSlot(0)?.quantity === 5, 'G: Item não deve ser consumido');
  assert(
    world.getEffectiveTile(farTile.tileX, farTile.tileY)?.type === before?.type,
    'G: Mundo permanece inalterado',
  );
  console.log('✓ Requisito G passou: Rejeitar tile fora do alcance');
}

// =========================================================================
// TESTE H: Rejeitar tile inválido
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  // Coordenadas não inteiras / NaN
  const invalidTile = { tileX: NaN, tileY: 1.5 };
  const result = placeTileSystem.executePlace(player, world, invalidTile);

  assert(result.success === false, 'H: Deve rejeitar coordenadas inválidas');
  assert(result.failureReason === 'INVALID_COORDINATES', 'H: Razão deve ser INVALID_COORDINATES');
  assert(player.getInventory().getSlot(0)?.quantity === 5, 'H: Item não deve ser consumido');
  console.log('✓ Requisito H passou: Rejeitar tile inválido');
}

// =========================================================================
// TESTE I: Rejeitar colocação sobre tile já modificado quando regra proibir
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  const targetTile = { tileX: 3, tileY: 3 };

  // 1ª colocação tem sucesso
  const first = placeTileSystem.executePlace(player, world, targetTile);
  assert(first.success === true, 'I: 1ª colocação deve suceder');
  assert(player.getInventory().getSlot(0)?.quantity === 4, 'I: Quantidade deve ser 4');

  // Registrar um segundo bloco colocável que produz outro tile mas tem canReplaceModified: false
  const testStoneBlock: PlaceableTileDefinition = {
    id: 'test_stone_block',
    resultingTileType: TileType.EMPTY,
    requiredItemId: 'test_stone',
    walkable: true,
    canReplaceModified: false,
  };
  PlaceableTileRegistry.register(testStoneBlock);

  // Equipar 'test_stone'
  player.getInventory().setSlot(1, createItemStack('test_stone', 3));
  player.getHotbar().setSelectedSlot(1);

  // Tentar colocar sobre o mesmo tile já modificado
  const second = placeTileSystem.executePlace(player, world, targetTile);
  assert(second.success === false, 'I: Deve rejeitar sobreposição de tile modificado');
  assert(second.failureReason === 'TILE_ALREADY_MODIFIED', 'I: Razão TILE_ALREADY_MODIFIED');
  assert(player.getInventory().getSlot(1)?.quantity === 3, 'I: Item não consumido');
  console.log('✓ Requisito I passou: Rejeitar colocação sobre tile modificado quando regra impedir');
}

// =========================================================================
// TESTE J: Impedir colocação que gere colisão inválida com o jogador
// =========================================================================
{
  const world = new World(12345);
  // Player em (96, 96), tamanho 24x24 (cobre de x:96..120, y:96..120)
  // O tile em (3, 3) cobre de x:96..128, y:96..128 -> intercepta a hitbox do player!
  const player = new Player({ worldX: 96, worldY: 96 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Registrar um bloco sólido não-caminhável (ex: parede de madeira)
  const solidWallBlock: PlaceableTileDefinition = {
    id: 'test_wooden_wall',
    resultingTileType: TileType.EMPTY, // EMPTY não é caminhável
    requiredItemId: 'wall_item',
    walkable: false, // BLOCO SÓLIDO
  };
  PlaceableTileRegistry.register(solidWallBlock);

  player.getInventory().setSlot(0, createItemStack('wall_item', 5));
  player.getHotbar().setSelectedSlot(0);

  // Tentar colocar o bloco sólido exatamente sobre a posição do jogador
  const targetTileUnderPlayer = { tileX: 3, tileY: 3 };
  const result = placeTileSystem.executePlace(player, world, targetTileUnderPlayer);

  assert(result.success === false, 'J: Deve rejeitar colocar bloco sólido sob o jogador');
  assert(
    result.failureReason === 'WOULD_COLLIDE_WITH_PLAYER',
    'J: Razão deve ser WOULD_COLLIDE_WITH_PLAYER',
  );
  assert(player.getInventory().getSlot(0)?.quantity === 5, 'J: Não deve consumir item');

  // Agora testar que piso caminhável (walkable: true) É permitido mesmo sob o jogador
  player.getInventory().setSlot(1, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(1);

  const floorResult = placeTileSystem.executePlace(player, world, targetTileUnderPlayer);
  assert(floorResult.success === true, 'J: Bloco caminhável (piso) pode ser colocado sob o jogador');
  assert(player.getInventory().getSlot(1)?.quantity === 4, 'J: Item consumido');
  console.log('✓ Requisito J passou: Impedir colisão inválida de bloco sólido com o jogador');
}

// =========================================================================
// TESTE K: Permitir colocação em coordenadas negativas
// =========================================================================
{
  const world = new World(12345);
  // Posicionar jogador em coordenadas negativas (ex: -100, -100)
  const player = new Player({ worldX: -100, worldY: -100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 3));
  player.getHotbar().setSelectedSlot(0);

  // Tile vizinho em coordenadas negativas: (-4, -4) -> mundo (-128..-96, -128..-96)
  const negativeTile = { tileX: -4, tileY: -4 };
  const before = world.getEffectiveTile(negativeTile.tileX, negativeTile.tileY);

  const result = placeTileSystem.executePlace(player, world, negativeTile);

  assert(result.success === true, 'K: Colocação em coordenadas negativas deve suceder');
  assert(
    world.getEffectiveTile(negativeTile.tileX, negativeTile.tileY)?.type === TileType.WOOD_FLOOR,
    'K: getEffectiveTile deve refletir WOOD_FLOOR em coordenadas negativas',
  );
  assert(player.getInventory().getSlot(0)?.quantity === 2, 'K: Item consumido corretamente');
  console.log('✓ Requisito K passou: Permitir colocação em coordenadas negativas');
}

// =========================================================================
// TESTE L: Permitir colocação atravessando fronteiras de chunks
// =========================================================================
{
  const world = new World(12345);
  // Fronteira entre chunk 0 e chunk 1 ocorre no tile 15 e 16 (CHUNK_SIZE = 16)
  // Tile 15 está no chunk 0; Tile 16 está no chunk 1.
  // Colocar jogador próximo à borda (no tile 15 -> worldX = 15 * 32 = 480)
  const player = new Player({ worldX: 490, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  // Alvo no chunk adjacente (tileX = 16)
  const borderTile = { tileX: 16, tileY: 3 };
  const { chunkCoord: borderChunkCoord } = ChunkManager.globalTileToChunkCoord(borderTile.tileX, borderTile.tileY);
  assert(borderChunkCoord.chunkX === 1, 'L: Tile alvo deve estar no chunk 1');

  const result = placeTileSystem.executePlace(player, world, borderTile);

  assert(result.success === true, 'L: Colocação através de fronteira de chunk deve suceder');
  assert(
    world.getEffectiveTile(borderTile.tileX, borderTile.tileY)?.type === TileType.WOOD_FLOOR,
    'L: getEffectiveTile no chunk vizinho deve ser WOOD_FLOOR',
  );
  console.log('✓ Requisito L passou: Permitir colocação atravessando fronteiras de chunks');
}

// =========================================================================
// TESTE M: Persistir após unload/reload de chunk
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  const targetTile = { tileX: 2, tileY: 2 };
  const placeResult = placeTileSystem.executePlace(player, world, targetTile);
  assert(placeResult.success === true, 'M: Colocação inicial deve suceder');

  const { chunkCoord } = ChunkManager.globalTileToChunkCoord(targetTile.tileX, targetTile.tileY);
  const chunkManager = world.getChunkManager();

  // Forçar descarregamento do chunk
  chunkManager.unloadChunk(chunkCoord.chunkX, chunkCoord.chunkY);
  assert(
    chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY) === null,
    'M: Chunk deve estar descarregado',
  );

  // Recarregar o chunk no mundo
  const reloadedChunk = chunkManager.getChunk(chunkCoord.chunkX, chunkCoord.chunkY);
  assert(reloadedChunk !== null, 'M: Chunk deve ser recarregado com sucesso');

  // O tile colocado deve persistir perfeitamente!
  const effectiveAfterReload = world.getEffectiveTile(targetTile.tileX, targetTile.tileY);
  assert(
    effectiveAfterReload?.type === TileType.WOOD_FLOOR,
    'M: Bloco colocado deve persistir após recarregar chunk',
  );
  console.log('✓ Requisito M passou: Persistir após unload/reload de chunk');
}

// =========================================================================
// TESTE N: Não materializar chunks desnecessariamente
// =========================================================================
{
  const world = new World(12345);
  const chunkManager = world.getChunkManager();

  // Escolher chunk distante que não está carregado (ex: chunk 50, 50 -> tile 800, 800)
  const farTileX = 800;
  const farTileY = 800;
  const { chunkCoord } = ChunkManager.globalTileToChunkCoord(farTileX, farTileY);

  assert(
    chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY) === null,
    'N: Chunk distante não deve estar carregado inicialmente',
  );

  // Consultar modificação ou validar canPlace longe
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  const evalResult = placeTileSystem.canPlace(player, world, { tileX: farTileX, tileY: farTileY });
  assert(evalResult.canPlace === false, 'N: Fora de alcance deve ser rejeitado');

  // Verificar que o chunk distante NÃO foi instanciado
  assert(
    chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY) === null,
    'N: Validação não deve materializar chunk na memória',
  );
  console.log('✓ Requisito N passou: Não materializar chunks desnecessariamente');
}

// =========================================================================
// TESTE O: Não consumir item quando a operação falha
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  player.getInventory().setSlot(0, createItemStack('wood', 7));
  player.getHotbar().setSelectedSlot(0);

  // Tentativa com alvo nulo
  const res1 = placeTileSystem.executePlace(player, world, null);
  assert(res1.success === false, 'O: Deve falhar para alvo nulo');
  assert(player.getInventory().getSlot(0)?.quantity === 7, 'O: Item não consumido');

  // Tentativa fora de alcance
  const res2 = placeTileSystem.executePlace(player, world, { tileX: 50, tileY: 50 });
  assert(res2.success === false, 'O: Deve falhar fora de alcance');
  assert(player.getInventory().getSlot(0)?.quantity === 7, 'O: Item não consumido');
  console.log('✓ Requisito O passou: Não consumir item quando a operação falha');
}

// =========================================================================
// TESTE P: Funcionamento independente do sprite
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Bloco sem spriteAssetId definido
  const noSpriteBlock: PlaceableTileDefinition = {
    id: 'test_no_sprite_block',
    resultingTileType: TileType.WOOD_FLOOR,
    requiredItemId: 'wood_no_sprite',
    walkable: true,
  };
  PlaceableTileRegistry.register(noSpriteBlock);

  player.getInventory().setSlot(0, createItemStack('wood_no_sprite', 2));
  player.getHotbar().setSelectedSlot(0);

  const result = placeTileSystem.executePlace(player, world, { tileX: 3, tileY: 3 });
  assert(result.success === true, 'P: Deve funcionar sem nenhum sprite carregado');
  assert(world.getEffectiveTile(3, 3)?.type === TileType.WOOD_FLOOR, 'P: Terreno alterado');
  console.log('✓ Requisito P passou: Funcionamento independente de sprites');
}

// =========================================================================
// TESTE Q: Funcionamento independente do Renderer / Canvas
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Sem nenhum Canvas ou contexto gráfico instanciado
  player.getInventory().setSlot(0, createItemStack('wood', 3));
  player.getHotbar().setSelectedSlot(0);

  const result = placeTileSystem.executePlace(player, world, { tileX: 3, tileY: 3 });
  assert(result.success === true, 'Q: Colocação não depende de Renderer ou DOM Canvas');
  console.log('✓ Requisito Q passou: Funcionamento independente do Renderer');
}

// =========================================================================
// TESTE R: Determinismo estrito da operação
// =========================================================================
{
  const worldA = new World(777);
  const worldB = new World(777);

  const playerA = new Player({ worldX: 100, worldY: 100 });
  const playerB = new Player({ worldX: 100, worldY: 100 });

  playerA.getInventory().setSlot(0, createItemStack('wood', 5));
  playerA.getHotbar().setSelectedSlot(0);

  playerB.getInventory().setSlot(0, createItemStack('wood', 5));
  playerB.getHotbar().setSelectedSlot(0);

  const sysA = new PlaceTileSystem(64);
  const sysB = new PlaceTileSystem(64);

  const resA = sysA.executePlace(playerA, worldA, { tileX: 3, tileY: 3 });
  const resB = sysB.executePlace(playerB, worldB, { tileX: 3, tileY: 3 });

  assert(resA.success === resB.success, 'R: Sucesso idêntico');
  assert(resA.resultingTileType === resB.resultingTileType, 'R: Tipo idêntico');
  assert(
    worldA.getEffectiveTile(3, 3)?.type === worldB.getEffectiveTile(3, 3)?.type,
    'R: Estado do mundo idêntico',
  );
  console.log('✓ Requisito R passou: Determinismo estrito da operação');
}

// =========================================================================
// TESTE S: Integração com Hotbar/Inventory
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);

  // Slot 0 tem machado, slot 1 tem madeira
  player.getInventory().setSlot(0, createItemStack('axe', 1));
  player.getInventory().setSlot(1, createItemStack('wood', 2));

  // Selecionar slot 0 (machado)
  player.getHotbar().setSelectedSlot(0);
  const targetTile = { tileX: 3, tileY: 3 };

  const tryWithAxe = placeTileSystem.executePlace(player, world, targetTile);
  assert(tryWithAxe.success === false, 'S: Machado na hotbar não pode colocar bloco');

  // Alternar hotbar para slot 1 (madeira)
  player.getHotbar().setSelectedSlot(1);
  const tryWithWood = placeTileSystem.executePlace(player, world, targetTile);
  assert(tryWithWood.success === true, 'S: Madeira na hotbar permite colocar bloco com sucesso');
  assert(player.getInventory().getSlot(1)?.quantity === 1, 'S: Consumiu do slot correto da hotbar');
  console.log('✓ Requisito S passou: Integração perfeita com Hotbar e Inventory');
}

// =========================================================================
// TESTE T: Separação estrita entre PLACE, INTERACT e USE_ITEM
// =========================================================================
{
  const world = new World(12345);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);
  const tileSelectionSystem = new TileSelectionSystem();
  const input = new MockInputSource();

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  // Selecionar tile via TileSelectionSystem
  tileSelectionSystem.setSelectedTile({ tileX: 3, tileY: 3 });

  // 1. Acionar ação 'interact': PlaceTileSystem NÃO deve reagir
  input.triggerJustPressed('interact');
  placeTileSystem.update(player, world, input, tileSelectionSystem, 0.016);
  assert(
    world.getEffectiveTile(3, 3)?.type !== TileType.WOOD_FLOOR,
    'T: Ação interact não deve disparar colocação',
  );
  assert(player.getInventory().getSlot(0)?.quantity === 5, 'T: Item preservado');
  input.clearFrameState();

  // 2. Acionar ação 'use_item': PlaceTileSystem NÃO deve reagir
  input.triggerJustPressed('use_item');
  placeTileSystem.update(player, world, input, tileSelectionSystem, 0.016);
  assert(
    world.getEffectiveTile(3, 3)?.type !== TileType.WOOD_FLOOR,
    'T: Ação use_item não deve disparar colocação',
  );
  assert(player.getInventory().getSlot(0)?.quantity === 5, 'T: Item preservado');
  input.clearFrameState();

  // 3. Acionar ação 'place': PlaceTileSystem deve executar a colocação!
  input.triggerJustPressed('place');
  placeTileSystem.update(player, world, input, tileSelectionSystem, 0.016);
  assert(
    world.getEffectiveTile(3, 3)?.type === TileType.WOOD_FLOOR,
    'T: Ação place deve executar colocação',
  );
  assert(player.getInventory().getSlot(0)?.quantity === 4, 'T: Item consumido');
  console.log('✓ Requisito T passou: Separação estrita entre PLACE, INTERACT e USE_ITEM');
}

// =========================================================================
// CENÁRIO COMPLETO DE INTEGRAÇÃO END-TO-END:
// Selecionar tile -> Teclar PLACE -> Bloco colocado -> Item consumido -> Unload/Reload -> Bloco permanece
// =========================================================================
{
  const world = new World(99999);
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem(64);
  const tileSelectionSystem = new TileSelectionSystem();
  const input = new MockInputSource();

  // 1. Adicionar madeira ao inventário e equipar na hotbar
  player.getInventory().setSlot(0, createItemStack('wood', 3));
  player.getHotbar().setSelectedSlot(0);

  // 2. Jogador seleciona tile espacialmente
  const selectedTile = { tileX: 3, tileY: 4 };
  tileSelectionSystem.setSelectedTile(selectedTile);

  // 3. Jogador aciona o comando PLACE (tecla Q ou botão touch Colocar)
  input.triggerJustPressed('place');
  placeTileSystem.update(player, world, input, tileSelectionSystem, 0.016);

  // 4. Validação do estado no mundo e no inventário
  assert(
    world.getEffectiveTile(selectedTile.tileX, selectedTile.tileY)?.type === TileType.WOOD_FLOOR,
    'Integração: Bloco de piso de madeira deve estar no mundo',
  );
  assert(player.getInventory().getSlot(0)?.quantity === 2, 'Integração: 1 madeira consumida');

  // 5. Ciclo de descarregamento e recarregamento do chunk
  const { chunkCoord } = ChunkManager.globalTileToChunkCoord(selectedTile.tileX, selectedTile.tileY);
  world.getChunkManager().unloadChunk(chunkCoord.chunkX, chunkCoord.chunkY);
  world.getChunkManager().getChunk(chunkCoord.chunkX, chunkCoord.chunkY);

  // 6. Bloco persiste após o recarregamento
  assert(
    world.getEffectiveTile(selectedTile.tileX, selectedTile.tileY)?.type === TileType.WOOD_FLOOR,
    'Integração: Terreno modificado persiste após unload/reload',
  );
  console.log('✓ Cenário Completo de Integração passou com 100% de sucesso!');
}

console.log('===================================================================');
console.log('TODOS OS 20 TESTES (A até T) E CENÁRIO DE INTEGRAÇÃO PASSARAM COM SUCESSO!');
console.log('===================================================================');
