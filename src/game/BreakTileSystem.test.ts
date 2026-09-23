import assert from 'node:assert';
import { BreakTileSystem } from './BreakTileSystem.ts';
import { PlaceTileSystem } from './PlaceTileSystem.ts';
import { PlaceableTileRegistry, WOODEN_FLOOR_PLACEABLE } from './PlaceableTileRegistry.ts';
import { PlaceableTileDefinition } from './PlaceableTileDefinition.ts';
import { Player } from './Player.ts';
import { World } from './World.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { TileType, InputSource, Vector2D, TileCoord } from './types.ts';
import { createItemStack } from './ItemStack.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { TileRegistry } from './TileRegistry.ts';
import { ChunkManager } from './ChunkManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';

/**
 * Mock determinístico de InputSource para testes unitários de ações isoladas.
 */
class MockInputSource implements InputSource {
  public movement: Vector2D = { x: 0, y: 0 };
  private justPressedActions: Set<string> = new Set();
  private pressedActions: Set<string> = new Set();

  public getMovementDirection(): Vector2D {
    return this.movement;
  }

  public isActionJustPressed(action: string): boolean {
    return this.justPressedActions.has(action);
  }

  public isActionPressed(action: string): boolean {
    return this.pressedActions.has(action);
  }

  public triggerJustPressed(action: string): void {
    this.justPressedActions.add(action);
    this.pressedActions.add(action);
  }

  public clearFrameState(): void {
    this.justPressedActions.clear();
  }
}

function setupTestEnvironment() {
  ItemRegistry.ensureInitialized();
  PlaceableTileRegistry.ensureInitialized();
  const world = new World();
  const player = new Player({ worldX: 100, worldY: 100 });
  const placeTileSystem = new PlaceTileSystem();
  const breakTileSystem = new BreakTileSystem();
  const tileSelectionSystem = new TileSelectionSystem();
  return { world, player, placeTileSystem, breakTileSystem, tileSelectionSystem };
}

console.log('--- Iniciando Suíte Completa de Testes do BreakTileSystem (A até X) ---');

// =========================================================================
// TESTE A: Quebrar um bloco colocado
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  // Setup: Coloca um bloco de madeira
  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);
  const placeResult = placeTileSystem.executePlace(player, world, targetTile);
  assert(placeResult.success === true, 'A: Setup deve colocar bloco com sucesso');
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR, 'A: Terreno deve ser WOOD_FLOOR');

  // Executa o BREAK
  const breakResult = breakTileSystem.executeBreak(player, world, targetTile);
  assert(breakResult.success === true, 'A: Quebra de bloco colocado deve suceder');
  assert(breakResult.tileX === 3 && breakResult.tileY === 3, 'A: Coordenadas retornadas corretas');
  console.log('✓ Requisito A passou: Quebrar um bloco colocado');
}

// =========================================================================
// TESTE B: Restaurar o tile anterior
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };
  const originalType = world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type;

  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR, 'B: Bloco colocado');

  breakTileSystem.executeBreak(player, world, targetTile);
  const restoredTile = world.getEffectiveTile(targetTile.tileX, targetTile.tileY);
  assert(restoredTile?.type === originalType, 'B: Terreno deve ser restaurado para o tipo original exato');
  console.log('✓ Requisito B passou: Restaurar o tile anterior');
}

// =========================================================================
// TESTE C: Devolver o item correto
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  player.getInventory().setSlot(0, createItemStack('wood', 1));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);
  assert(player.getInventory().getItemCount('wood') === 0, 'C: Madeira consumida ao colocar');

  const result = breakTileSystem.executeBreak(player, world, targetTile);
  assert(result.success === true, 'C: Quebra deve suceder');
  assert(result.droppedItemId === 'wood', 'C: Item devolvido deve ser wood');
  assert(player.getInventory().getItemCount('wood') === 1, 'C: Inventário deve ter recuperado 1 madeira');
  console.log('✓ Requisito C passou: Devolver o item correto');
}

// =========================================================================
// TESTE D: Rejeitar BREAK em tile procedural não modificado
// =========================================================================
{
  const { world, player, breakTileSystem } = setupTestEnvironment();
  const proceduralTile: TileCoord = { tileX: 3, tileY: 3 };

  assert(world.getTileModificationRegistry().hasModification(3, 3) === false, 'D: Tile é puramente procedural');
  const result = breakTileSystem.executeBreak(player, world, proceduralTile);
  assert(result.success === false, 'D: BREAK em terreno procedural deve ser rejeitado');
  assert(result.failureReason === 'TILE_NOT_MODIFIED', 'D: Razão deve ser TILE_NOT_MODIFIED');
  console.log('✓ Requisito D passou: Rejeitar BREAK em tile procedural não modificado');
}

// =========================================================================
// TESTE E: Rejeitar tile fora do alcance
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const closeTile: TileCoord = { tileX: 3, tileY: 3 }; // Próximo de (100, 100)
  const farTile: TileCoord = { tileX: 20, tileY: 20 }; // Muito longe de (100, 100)

  // Coloca no tile próximo
  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, closeTile);

  // Força modificação no tile distante para teste
  world.applyTileModification(farTile.tileX, farTile.tileY, TileType.WOOD_FLOOR);

  const result = breakTileSystem.executeBreak(player, world, farTile);
  assert(result.success === false, 'E: Tile fora do alcance deve ser rejeitado');
  assert(result.failureReason === 'OUT_OF_RANGE', 'E: Razão deve ser OUT_OF_RANGE');
  assert(world.getEffectiveTile(farTile.tileX, farTile.tileY)?.type === TileType.WOOD_FLOOR, 'E: Bloco distante permanece intacto');
  console.log('✓ Requisito E passou: Rejeitar tile fora do alcance');
}

// =========================================================================
// TESTE F: Rejeitar coordenada inválida
// =========================================================================
{
  const { world, player, breakTileSystem } = setupTestEnvironment();
  const invalidTile: TileCoord = { tileX: 2.5, tileY: NaN };

  const result = breakTileSystem.executeBreak(player, world, invalidTile);
  assert(result.success === false, 'F: Coordenadas inválidas devem ser rejeitadas');
  assert(result.failureReason === 'INVALID_COORDINATES', 'F: Razão deve ser INVALID_COORDINATES');
  console.log('✓ Requisito F passou: Rejeitar coordenada inválida');
}

// =========================================================================
// TESTE G: Inventário cheio não permite perda do bloco/recurso
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  // Coloca o bloco
  player.getInventory().setSlot(0, createItemStack('wood', 1));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  // Enche completamente todos os 20 slots do inventário com outro item (axe, que tem maxStackSize = 1)
  for (let i = 0; i < player.getInventory().getSlotCount(); i++) {
    player.getInventory().setSlot(i, createItemStack('axe', 1));
  }
  assert(player.getInventory().canAddItem('wood', 1) === false, 'G: Inventário está 100% cheio sem capacidade para wood');

  // Tentativa de quebra
  const result = breakTileSystem.executeBreak(player, world, targetTile);
  assert(result.success === false, 'G: Quebra com inventário cheio deve ser rejeitada');
  assert(result.failureReason === 'INVENTORY_FULL', 'G: Razão de falha deve ser INVENTORY_FULL');
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR, 'G: Bloco permanece intacto no mundo');
  assert(player.getInventory().getItemCount('wood') === 0, 'G: Nenhum item fantasma gerado');
  console.log('✓ Requisito G passou: Inventário cheio não permite perda do bloco/recurso');
}

// =========================================================================
// TESTE H: Quantidade devolvida correta
// =========================================================================
{
  const { world, player, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  ItemRegistry.register({
    id: 'test_triple_resource',
    name: 'Recurso Triplo Teste',
    maxStackSize: 99,
  });

  // Registra bloco personalizado com quantidade de drop = 3
  const tripleDropBlock: PlaceableTileDefinition = {
    id: 'test_triple_drop_block',
    resultingTileType: 888 as unknown as TileType,
    requiredItemId: 'test_triple_resource',
    requiredQuantity: 3,
    walkable: true,
    dropItemIdOnBreak: 'test_triple_resource',
    dropQuantityOnBreak: 3,
    maxPlacementRange: 64,
  };
  PlaceableTileRegistry.register(tripleDropBlock);

  world.applyTileModification(targetTile.tileX, targetTile.tileY, 888 as unknown as TileType, TileType.GRASS);
  player.getInventory().clear();

  const result = breakTileSystem.executeBreak(player, world, targetTile);
  assert(result.success === true, 'H: Quebra deve suceder');
  assert(result.droppedQuantity === 3, 'H: Devolveu exatamente 3 unidades');
  assert(player.getInventory().getItemCount('test_triple_resource') === 3, 'H: Inventário recebeu 3 recursos');
  console.log('✓ Requisito H passou: Quantidade devolvida correta');
}

// =========================================================================
// TESTE I: Coordenadas negativas
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const negTile: TileCoord = { tileX: -10, tileY: -15 };
  player.position = { worldX: -10 * 32, worldY: -15 * 32 };

  const originalType = world.getEffectiveTile(negTile.tileX, negTile.tileY)?.type;
  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);

  const placeResult = placeTileSystem.executePlace(player, world, negTile);
  assert(placeResult.success === true, 'I: Colocação em coordenadas negativas bem sucedida');

  const breakResult = breakTileSystem.executeBreak(player, world, negTile);
  assert(breakResult.success === true, 'I: Quebra em coordenadas negativas bem sucedida');
  assert(world.getEffectiveTile(negTile.tileX, negTile.tileY)?.type === originalType, 'I: Terreno negativo restaurado');
  assert(player.getInventory().getItemCount('wood') === 2, 'I: Recurso restaurado');
  console.log('✓ Requisito I passou: Coordenadas negativas');
}

// =========================================================================
// TESTE J: Fronteira entre chunks
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  // Tile 15 está no chunk 0; tile 16 está no chunk 1
  const borderTile: TileCoord = { tileX: 16, tileY: 0 };
  player.position = { worldX: 15 * 32, worldY: 0 };

  const originalType = world.getEffectiveTile(borderTile.tileX, borderTile.tileY)?.type;
  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);

  placeTileSystem.executePlace(player, world, borderTile);
  assert(world.getEffectiveTile(borderTile.tileX, borderTile.tileY)?.type === TileType.WOOD_FLOOR, 'J: Colocado na borda');

  const breakResult = breakTileSystem.executeBreak(player, world, borderTile);
  assert(breakResult.success === true, 'J: Quebrado na fronteira de chunk');
  assert(world.getEffectiveTile(borderTile.tileX, borderTile.tileY)?.type === originalType, 'J: Restaurado na fronteira');
  console.log('✓ Requisito J passou: Fronteira entre chunks');
}

// =========================================================================
// TESTE K: Unload/reload preserva o resultado
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };
  const originalType = world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type;

  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);

  placeTileSystem.executePlace(player, world, targetTile);
  breakTileSystem.executeBreak(player, world, targetTile);

  const { chunkCoord } = ChunkManager.globalTileToChunkCoord(targetTile.tileX, targetTile.tileY);
  const chunkManager = world.getChunkManager();

  // Descarrega o chunk específico da memória
  chunkManager.unloadChunk(chunkCoord.chunkX, chunkCoord.chunkY);
  assert(chunkManager.getLoadedChunk(chunkCoord.chunkX, chunkCoord.chunkY) === null, 'K: Chunk descarregado');

  // Ao consultar novamente, o chunk é recarregado e reflete o terreno original restaurado
  const effective = world.getEffectiveTile(targetTile.tileX, targetTile.tileY);
  assert(effective?.type === originalType, 'K: Terreno permanece restaurado após unload/reload');
  console.log('✓ Requisito K passou: Unload/reload preserva o resultado');
}

// =========================================================================
// TESTE L: Não materialização indevida de chunks
// =========================================================================
{
  const { world, player, breakTileSystem } = setupTestEnvironment();
  const farTile: TileCoord = { tileX: 5000, tileY: 5000 };
  const { chunkCoord: farChunk } = ChunkManager.globalTileToChunkCoord(farTile.tileX, farTile.tileY);

  assert(world.getChunkManager().getLoadedChunk(farChunk.chunkX, farChunk.chunkY) === null, 'L: Chunk distante não deve estar carregado');
  const evaluation = breakTileSystem.canBreak(player, world, farTile);
  assert(evaluation.canBreak === false, 'L: canBreak deve falhar para tile não modificado');
  assert(world.getChunkManager().getLoadedChunk(farChunk.chunkX, farChunk.chunkY) === null, 'L: Consulta O(1) não materializa chunks');
  console.log('✓ Requisito L passou: Não materialização indevida de chunks');
}

// =========================================================================
// TESTE M: Colisão atualizada após quebra
// =========================================================================
{
  const { world, player, breakTileSystem } = setupTestEnvironment();
  const collisionSystem = new CollisionSystem(world);
  const wallTile: TileCoord = { tileX: 3, tileY: 3 };
  player.position = { worldX: 100, worldY: 100 };

  ItemRegistry.register({
    id: 'test_wall_stone',
    name: 'Pedra de Parede Teste',
    maxStackSize: 99,
  });

  // Registra bloco sólido (parede)
  const solidWall: PlaceableTileDefinition = {
    id: 'test_solid_wall',
    resultingTileType: 777 as unknown as TileType,
    requiredItemId: 'test_wall_stone',
    walkable: false,
    maxPlacementRange: 64,
    dropItemIdOnBreak: 'test_wall_stone',
    dropQuantityOnBreak: 1,
  };
  PlaceableTileRegistry.register(solidWall);

  TileRegistry.register({
    type: 777 as unknown as TileType,
    color: '#333333',
    walkable: false,
    movementCost: 1.0,
  });

  // Assegura chunk (0,0) carregado para o CollisionSystem
  world.getChunkManager().getChunk(0, 0);

  // Aplica parede sólida no mundo
  world.applyTileModification(wallTile.tileX, wallTile.tileY, 777 as unknown as TileType, TileType.GRASS);
  assert(
    collisionSystem.canOccupyArea(wallTile.tileX * 32, wallTile.tileY * 32, 32, 32) === false,
    'M: Parede colocada não é caminhável',
  );

  // Quebra a parede
  const breakResult = breakTileSystem.executeBreak(player, world, wallTile);
  assert(breakResult.success === true, 'M: Quebra com sucesso');
  assert(
    collisionSystem.canOccupyArea(wallTile.tileX * 32, wallTile.tileY * 32, 32, 32) === true,
    'M: Terreno restaurado volta a ser caminhável',
  );
  console.log('✓ Requisito M passou: Colisão atualizada após quebra');
}

// =========================================================================
// TESTE N: Independência do Renderer
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  const result = breakTileSystem.executeBreak(player, world, targetTile);
  assert(result.success === true, 'N: Executado sem dependência de Renderer');
  console.log('✓ Requisito N passou: Independência do Renderer');
}

// =========================================================================
// TESTE O: Independência de sprite
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  const result = breakTileSystem.executeBreak(player, world, targetTile);
  assert(result.success === true, 'O: Executado sem nenhum sprite carregado');
  console.log('✓ Requisito O passou: Independência de sprite');
}

// =========================================================================
// TESTE P: BREAK separado de PLACE
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem, tileSelectionSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };
  tileSelectionSystem.setSelectedTile(targetTile);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  const input = new MockInputSource();
  input.triggerJustPressed('place');

  // breakTileSystem não deve reagir a 'place'
  const breakResult = breakTileSystem.update(player, world, input, tileSelectionSystem, 0.016);
  assert(breakResult === null, 'P: BreakTileSystem ignora ação place');
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR, 'P: Bloco permanece');
  console.log('✓ Requisito P passou: BREAK separado de PLACE');
}

// =========================================================================
// TESTE Q: BREAK separado de INTERACT
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem, tileSelectionSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };
  tileSelectionSystem.setSelectedTile(targetTile);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  const input = new MockInputSource();
  input.triggerJustPressed('interact');

  const breakResult = breakTileSystem.update(player, world, input, tileSelectionSystem, 0.016);
  assert(breakResult === null, 'Q: BreakTileSystem ignora ação interact');
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR, 'Q: Bloco permanece');
  console.log('✓ Requisito Q passou: BREAK separado de INTERACT');
}

// =========================================================================
// TESTE R: BREAK separado de USE_ITEM
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem, tileSelectionSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };
  tileSelectionSystem.setSelectedTile(targetTile);

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  const input = new MockInputSource();
  input.triggerJustPressed('use_item');

  const breakResult = breakTileSystem.update(player, world, input, tileSelectionSystem, 0.016);
  assert(breakResult === null, 'R: BreakTileSystem ignora ação use_item');
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WOOD_FLOOR, 'R: Bloco permanece');
  console.log('✓ Requisito R passou: BREAK separado de USE_ITEM');
}

// =========================================================================
// TESTE S: Operação determinística
// =========================================================================
{
  const envA = setupTestEnvironment();
  const envB = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  envA.player.getInventory().setSlot(0, createItemStack('wood', 3));
  envB.player.getInventory().setSlot(0, createItemStack('wood', 3));
  envA.player.getHotbar().setSelectedSlot(0);
  envB.player.getHotbar().setSelectedSlot(0);

  envA.placeTileSystem.executePlace(envA.player, envA.world, targetTile);
  envB.placeTileSystem.executePlace(envB.player, envB.world, targetTile);

  const resA = envA.breakTileSystem.executeBreak(envA.player, envA.world, targetTile);
  const resB = envB.breakTileSystem.executeBreak(envB.player, envB.world, targetTile);

  assert(resA.success === resB.success, 'S: Sucesso idêntico');
  assert(resA.restoredTileType === resB.restoredTileType, 'S: Tile restaurado idêntico');
  assert(
    envA.world.getEffectiveTile(3, 3)?.type === envB.world.getEffectiveTile(3, 3)?.type,
    'S: Estado do mundo idêntico',
  );
  assert(
    envA.player.getInventory().getItemCount('wood') === envB.player.getInventory().getItemCount('wood'),
    'S: Inventário idêntico',
  );
  console.log('✓ Requisito S passou: Operação determinística');
}

// =========================================================================
// TESTE T: Restauração usa o estado anterior real
// =========================================================================
{
  const { world, player, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  // Terreno anterior real é WATER (diferente de GRASS)
  world.applyTileModification(targetTile.tileX, targetTile.tileY, TileType.WOOD_FLOOR, TileType.WATER);
  player.getInventory().clear();

  const breakResult = breakTileSystem.executeBreak(player, world, targetTile);
  assert(breakResult.success === true, 'T: Quebra bem sucedida');
  assert(breakResult.restoredTileType === TileType.WATER, 'T: Tipo restaurado deve ser WATER');
  assert(world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type === TileType.WATER, 'T: Mundo deve conter WATER');
  console.log('✓ Requisito T passou: Restauração usa o estado anterior real');
}

// =========================================================================
// TESTE U: Não deixar modificações fantasmas no TileModificationRegistry
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  const initialModCount = world.getTileModificationRegistry().getModificationCount();
  player.getInventory().setSlot(0, createItemStack('wood', 2));
  player.getHotbar().setSelectedSlot(0);

  placeTileSystem.executePlace(player, world, targetTile);
  assert(world.getTileModificationRegistry().hasModification(3, 3) === true, 'U: Modificação registrada');
  assert(world.getTileModificationRegistry().getModificationCount() === initialModCount + 1, 'U: Count incrementou');

  breakTileSystem.executeBreak(player, world, targetTile);
  assert(world.getTileModificationRegistry().hasModification(3, 3) === false, 'U: Modificação removida completamente');
  assert(world.getTileModificationRegistry().getModificationCount() === initialModCount, 'U: Count voltou ao original');
  console.log('✓ Requisito U passou: Não deixar modificações fantasmas no TileModificationRegistry');
}

// =========================================================================
// TESTE V: Colocar → Quebrar → Colocar novamente funciona corretamente
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };
  const originalType = world.getEffectiveTile(targetTile.tileX, targetTile.tileY)?.type;

  player.getInventory().setSlot(0, createItemStack('wood', 5));
  player.getHotbar().setSelectedSlot(0);

  // 1. Colocar
  const place1 = placeTileSystem.executePlace(player, world, targetTile);
  assert(place1.success === true, 'V: Primeiro place bem sucedido');
  assert(world.getEffectiveTile(3, 3)?.type === TileType.WOOD_FLOOR, 'V: Primeiro piso colocado');
  assert(player.getInventory().getItemCount('wood') === 4, 'V: 1 madeira consumida');

  // 2. Quebrar
  const break1 = breakTileSystem.executeBreak(player, world, targetTile);
  assert(break1.success === true, 'V: Quebra bem sucedida');
  assert(world.getEffectiveTile(3, 3)?.type === originalType, 'V: Terreno original restaurado');
  assert(player.getInventory().getItemCount('wood') === 5, 'V: 1 madeira recuperada');

  // 3. Colocar novamente
  const place2 = placeTileSystem.executePlace(player, world, targetTile);
  assert(place2.success === true, 'V: Segundo place bem sucedido');
  assert(world.getEffectiveTile(3, 3)?.type === TileType.WOOD_FLOOR, 'V: Segundo piso colocado');
  assert(player.getInventory().getItemCount('wood') === 4, 'V: 1 madeira consumida');
  console.log('✓ Requisito V passou: Colocar → Quebrar → Colocar novamente funciona corretamente');
}

// =========================================================================
// TESTE W: Tentativa de quebrar em condição adversa não deixa estado parcial
// =========================================================================
{
  const { world, player, placeTileSystem, breakTileSystem } = setupTestEnvironment();
  const targetTile: TileCoord = { tileX: 3, tileY: 3 };

  player.getInventory().setSlot(0, createItemStack('wood', 1));
  player.getHotbar().setSelectedSlot(0);
  placeTileSystem.executePlace(player, world, targetTile);

  // Preenche todo o inventário com outros itens
  for (let i = 0; i < player.getInventory().getSlotCount(); i++) {
    player.getInventory().setSlot(i, createItemStack('axe', 1));
  }

  const result = breakTileSystem.executeBreak(player, world, targetTile);
  assert(result.success === false, 'W: Falha controlada');
  assert(world.getEffectiveTile(3, 3)?.type === TileType.WOOD_FLOOR, 'W: Mundo preservado intacto');
  assert(world.getTileModificationRegistry().hasModification(3, 3) === true, 'W: Registro de modificação preservado');
  console.log('✓ Requisito W passou: Tentativa de quebrar em condição adversa não deixa estado parcial');
}

// =========================================================================
// TESTE X: Registros duplicados no PlaceableTileRegistry são rejeitados
// =========================================================================
{
  let threw = false;
  try {
    PlaceableTileRegistry.register(WOODEN_FLOOR_PLACEABLE);
  } catch (err: unknown) {
    threw = true;
    assert((err as Error).message.includes('já foi registrada'), 'X: Mensagem de erro correta');
  }
  assert(threw === true, 'X: Registro duplicado deve lançar erro determinístico');
  console.log('✓ Requisito X passou: Registros duplicados no PlaceableTileRegistry são rejeitados');
}

console.log('===================================================================');
console.log('TODOS OS 24 TESTES (A até X) DO BREAK TILE SYSTEM PASSARAM COM SUCESSO!');
console.log('===================================================================');
