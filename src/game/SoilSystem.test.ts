import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { World } from './World.ts';
import { ChunkManager } from './ChunkManager.ts';
import { Player, PlayerActionState, PlayerDirection } from './Player.ts';
import { ItemUseSystem } from './ItemUseSystem.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { SoilRegistry } from './SoilState.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { TileRegistry } from './TileRegistry.ts';
import { TileToolTarget } from './TileToolTarget.ts';
import { ToolTarget } from './ToolTarget.ts';
import { TileSelectionSystem } from './TileSelectionSystem.ts';
import { createItemStack } from './ItemStack.ts';
import { TileType } from './types.ts';
import { TILE_SIZE, CHUNK_SIZE } from './constants.ts';
import { Input } from './Input.ts';

describe('SoilSystem & Hoe Integration Suite', () => {
  beforeEach(() => {
    ToolRegistry.reset();
    SoilRegistry.reset();
    ItemRegistry.clear();
    ItemRegistry.ensureInitialized();
  });

  // A. GRASS pode ser preparado.
  it('A. Deve permitir que o terreno do tipo GRASS seja preparado com enxada', () => {
    const world = new World(42);
    const tileCoord = { tileX: 5, tileY: 5 };
    const originalTile = world.getEffectiveTile(tileCoord.tileX, tileCoord.tileY);
    assert.equal(originalTile?.type, TileType.GRASS, 'O tile procedural inicial deve ser GRASS');

    const hoeDef = ToolRegistry.getByItemId('hoe')!;
    assert.ok(hoeDef, 'ToolDefinition da enxada deve existir no ToolRegistry');

    const target = new TileToolTarget(tileCoord.tileX, tileCoord.tileY);
    const player = new Player({ worldX: tileCoord.tileX * TILE_SIZE, worldY: tileCoord.tileY * TILE_SIZE });
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const canTill = target.canReceiveToolAction(hoeDef, {
      player,
      world,
      tool: hoeDef,
      equippedItem: player.getEquippedItem()!,
      target,
    });

    assert.equal(canTill, true, 'GRASS deve aceitar a ação till da enxada');
  });

  // B. Tile preparado torna-se TILLED_SOIL.
  it('B. Tile preparado deve se tornar TILLED_SOIL após execução da enxada', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);

    assert.equal(result.success, true, 'O uso da enxada deve ter sucesso');
    assert.equal(result.code, 'soil_tilled', 'Código do resultado deve ser soil_tilled');

    const updatedTile = world.getEffectiveTile(tileX, tileY);
    assert.equal(updatedTile?.type, TileType.TILLED_SOIL, 'O terreno deve ter se tornado TILLED_SOIL');
  });

  // C. TILLED_SOIL é caminhável.
  it('C. TILLED_SOIL deve ser caminhável e ter propriedades de colisão válidas', () => {
    const tileDef = TileRegistry.get(TileType.TILLED_SOIL);
    assert.equal(tileDef.walkable, true, 'TILLED_SOIL deve ser walkable');
    assert.equal(tileDef.movementCost, 1.0, 'TILLED_SOIL deve ter movementCost regular de 1.0');
  });

  // D. Tile preparado persiste após unload/reload.
  it('D. Tile preparado deve persistir intacto após unload e reload do chunk', () => {
    const world = new World(100);
    const tileX = 3;
    const tileY = 4;
    const player = new Player({ worldX: tileX * TILE_SIZE - 8, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.useEquippedItem(player, world);
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);

    // Unload do chunk
    const { chunkCoord } = ChunkManager.globalTileToChunkCoord(tileX, tileY);
    world.getChunkManager().unloadChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    assert.equal(world.getChunkManager().hasChunk(chunkCoord.chunkX, chunkCoord.chunkY), false, 'Chunk deve estar descarregado');

    // Reload do chunk
    const reloadedChunk = world.getChunkManager().getChunk(chunkCoord.chunkX, chunkCoord.chunkY);
    assert.ok(reloadedChunk, 'Chunk deve ser recarregado com sucesso');

    const reloadedTile = world.getEffectiveTile(tileX, tileY);
    assert.equal(reloadedTile?.type, TileType.TILLED_SOIL, 'Tile modificado para TILLED_SOIL deve persistir após recarregar');
  });

  // E. Coordenadas negativas funcionam.
  it('E. Preparo de solo deve funcionar normalmente em coordenadas negativas', () => {
    const world = new World(42);
    const tileX = -8;
    const tileY = -12;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const tileSelectionSystem = new TileSelectionSystem();
    tileSelectionSystem.selectTile(tileX, tileY);

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.setTileSelectionSystem(tileSelectionSystem);

    const result = itemUseSystem.useEquippedItem(player, world);
    assert.equal(result.success, true);
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);
  });

  // F. Fronteiras de chunk funcionam.
  it('F. Preparo de solo deve funcionar perfeitamente em fronteiras de chunk', () => {
    const world = new World(42);
    // Fronteira entre chunk 0 e chunk 1 (CHUNK_SIZE = 16)
    const tileX = CHUNK_SIZE - 1; // 15
    const tileY = 5;
    const adjacentBorderTileX = CHUNK_SIZE; // 16

    const player = new Player({ worldX: tileX * TILE_SIZE, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const tileSelectionSystem = new TileSelectionSystem();
    tileSelectionSystem.selectTile(adjacentBorderTileX, tileY);

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.setTileSelectionSystem(tileSelectionSystem);

    const result = itemUseSystem.useEquippedItem(player, world);
    assert.equal(result.success, true);
    assert.equal(world.getEffectiveTile(adjacentBorderTileX, tileY)?.type, TileType.TILLED_SOIL);
  });

  // G. Consultas não materializam chunks indevidamente.
  it('G. Consultas de solo não devem materializar chunks indevidamente na memória', () => {
    const world = new World(42);
    const distantTileX = 500;
    const distantTileY = 500;
    const { chunkCoord } = ChunkManager.globalTileToChunkCoord(distantTileX, distantTileY);

    assert.equal(world.getChunkManager().hasChunk(chunkCoord.chunkX, chunkCoord.chunkY), false);

    // Consulta de tile carregado puro
    const loadedTile = world.getLoadedTile(distantTileX, distantTileY);
    assert.equal(loadedTile, null);

    // Não deve ter criado/carregado o chunk na memória
    assert.equal(
      world.getChunkManager().hasChunk(chunkCoord.chunkX, chunkCoord.chunkY),
      false,
      'A consulta getLoadedTile pura não deve materializar o chunk',
    );
  });

  // H. TILLED_SOIL não pode ser preparado novamente.
  it('H. TILLED_SOIL não pode ser preparado novamente (já preparado)', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    // Primeiro uso: prepara solo
    const res1 = itemUseSystem.useEquippedItem(player, world);
    assert.equal(res1.success, true);

    // Zera cooldown para tentar novamente no mesmo tile
    itemUseSystem.resetCooldown();

    // Segundo uso no mesmo tile já arado: deve falhar
    const res2 = itemUseSystem.useEquippedItem(player, world);
    assert.equal(res2.success, false, 'Não deve permitir preparar solo que já é TILLED_SOIL');
  });

  // I. Água não pode ser preparada.
  it('I. Terreno de água (WATER) não pode ser preparado', () => {
    const world = new World(42);
    const tileX = 10;
    const tileY = 10;
    // Força o tile a ser água via modificação
    world.applyTileModification(tileX, tileY, TileType.WATER);

    const player = new Player({ worldX: tileX * TILE_SIZE - 8, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);

    assert.equal(result.success, false, 'Água não pode ser preparada');
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.WATER, 'Terreno deve permanecer WATER');
  });

  // J. Pedra/outro terreno não preparável não pode ser preparado.
  it('J. Terrenos diferentes de GRASS (ex: piso, pedra/vazio) não podem ser preparados', () => {
    const world = new World(42);
    const tileX = 6;
    const tileY = 6;
    world.applyTileModification(tileX, tileY, TileType.WOOD_FLOOR);

    const player = new Player({ worldX: tileX * TILE_SIZE - 8, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);

    assert.equal(result.success, false, 'Piso/madeira não pode ser preparado');
  });

  // K. Alcance da enxada é respeitado.
  it('K. O alcance físico da enxada deve ser respeitado e rejeitar tiles distantes', () => {
    const world = new World(42);
    const player = new Player({ worldX: 100, worldY: 100 });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const tileSelectionSystem = new TileSelectionSystem();
    // Seleciona um tile a 150px de distância (alcance da enxada é 48px)
    tileSelectionSystem.selectTile(20, 6);

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.setTileSelectionSystem(tileSelectionSystem);

    const result = itemUseSystem.useEquippedItem(player, world);
    assert.equal(result.success, false, 'Deve rejeitar tile fora do alcance');
    assert.equal(result.code, 'no_target');
  });

  // L. Direção frontal é respeitada.
  it('L. A direção frontal do jogador deve ser respeitada na mira automática', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE, worldY: (tileY + 1) * TILE_SIZE });
    player.direction = PlayerDirection.UP;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    const target = itemUseSystem.findBestTarget(player, world, 'till', 48, ToolRegistry.getByItemId('hoe')!);

    assert.ok(target, 'Deve encontrar um alvo à frente');
    // Para direção UP, o alvo deve ter Y menor que o jogador
    assert.ok('getTargetBounds' in target, 'Alvo deve ser um ToolTarget com getTargetBounds');
    const bounds = (target as ToolTarget).getTargetBounds();
    assert.ok(bounds.minY < player.position.worldY, 'O tile alvo deve estar acima do jogador');
  });

  // M. Tile atrás do jogador é rejeitado.
  it('M. Tile situado atrás do jogador deve ser categoricamente rejeitado', () => {
    const world = new World(42);
    const player = new Player({ worldX: 100, worldY: 100 });
    player.direction = PlayerDirection.RIGHT; // Olhando para a direita
    player.inventory.addItemStack(createItemStack('hoe', 1));

    // Seleciona explicitamente um tile à esquerda (atrás do jogador)
    const tileSelectionSystem = new TileSelectionSystem();
    tileSelectionSystem.selectTile(4, 6); // À esquerda de worldX=100 (tile 6)

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.setTileSelectionSystem(tileSelectionSystem);

    const result = itemUseSystem.useEquippedItem(player, world);
    assert.equal(result.success, false, 'Deve rejeitar tile localizado atrás do jogador');
  });

  // N. Enxada não consome item.
  it('N. A enxada é uma ferramenta reutilizável e não deve ser consumida ao usar', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);

    assert.equal(result.success, true);
    const equipped = player.getEquippedItem();
    assert.ok(equipped, 'O item deve continuar equipado');
    assert.equal(equipped.itemId, 'hoe');
    assert.equal(equipped.quantity, 1, 'A quantidade deve continuar sendo 1');
  });

  // O. Cooldown é respeitado.
  it('O. O cooldown deve ser aplicado e impedir reuso imediato antes do tempo', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    const res1 = itemUseSystem.useEquippedItem(player, world);
    assert.equal(res1.success, true);

    assert.ok(itemUseSystem.getRemainingCooldown() > 0, 'Cooldown deve estar ativo');

    // Tentativa imediata deve ser rejeitada por cooldown
    const res2 = itemUseSystem.useEquippedItem(player, world);
    assert.equal(res2.success, false);
    assert.equal(res2.code, 'cooldown_active');

    // Avança o tempo além do cooldown
    itemUseSystem.update(player, world, new Input(), 0.4);
    assert.equal(itemUseSystem.getRemainingCooldown(), 0, 'Cooldown deve ter expirado');
  });

  // P. PlayerActionState funciona durante o uso.
  it('P. PlayerActionState.USE_ITEM deve ficar ativo durante a ação', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.useEquippedItem(player, world);

    assert.equal(player.getActionState(), PlayerActionState.USE_ITEM);
    assert.equal(player.isActionActive(), true);

    // Conclui a ação
    player.cancelAction();
    assert.equal(player.getActionState(), PlayerActionState.IDLE);
    assert.equal(player.isActionActive(), false);
  });

  // Q. ItemUseSystem permanece independente de 'hoe'.
  it('Q. ItemUseSystem deve operar sem bifurcações hardcoded para hoe', () => {
    const hoeTool = ToolRegistry.getByItemId('hoe');
    assert.ok(hoeTool);
    assert.equal(hoeTool.category, 'hoe');
    assert.equal(hoeTool.action, 'till');
    assert.equal(hoeTool.targetDomain, 'tile');

    // Registra item e ferramenta hipotética
    ItemRegistry.register({
      id: 'super_rake',
      name: 'Super Rake',
      description: 'Rake para solo',
      category: 'tool',
      maxStackSize: 1,
    });

    ToolRegistry.register({
      id: 'custom_tiller',
      itemId: 'super_rake',
      category: 'rake',
      action: 'till',
      targetDomain: 'tile',
      range: 40,
      cooldown: 0.2,
      actionDuration: 0.1,
    });

    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('super_rake', 1));

    const itemUseSystem = new ItemUseSystem();
    const result = itemUseSystem.useEquippedItem(player, world);
    assert.equal(result.success, true, 'ItemUseSystem deve funcionar com qualquer ferramenta declarativa');
  });

  // R. ToolRegistry encontra a enxada pelo itemId.
  it('R. ToolRegistry deve encontrar a enxada pelo itemId "hoe"', () => {
    const tool = ToolRegistry.getByItemId('hoe');
    assert.ok(tool, 'ToolRegistry deve retornar uma ferramenta para hoe');
    assert.equal(tool.id, 'basic_hoe');
    assert.equal(tool.action, 'till');
  });

  // S. Restauração remove a modificação quando volta ao estado procedural.
  it('S. Restauração de solo deve restaurar para GRASS e remover modificação do registro', () => {
    const world = new World(42);
    const tileX = 4;
    const tileY = 4;
    const modRegistry = world.getTileModificationRegistry();

    // Estado inicial: sem modificação
    assert.equal(modRegistry.hasModification(tileX, tileY), false);

    // Prepara solo
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();
    itemUseSystem.useEquippedItem(player, world);

    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);
    assert.equal(modRegistry.hasModification(tileX, tileY), true, 'Deve conter modificação registrada');

    // Restauração via SoilRegistry
    const restored = SoilRegistry.restoreSoil(world, tileX, tileY);
    assert.equal(restored, true, 'Restauração deve retornar sucesso');
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.GRASS, 'Deve voltar a ser GRASS');
    assert.equal(modRegistry.hasModification(tileX, tileY), false, 'Não deve deixar entrada fantasma no registro');
  });

  // T. GRASS → TILLED_SOIL → GRASS é determinístico.
  it('T. Ciclo GRASS → TILLED_SOIL → GRASS deve ser completamente determinístico', () => {
    const world = new World(999);
    const tileX = 7;
    const tileY = 8;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const itemUseSystem = new ItemUseSystem();

    for (let cycle = 0; cycle < 3; cycle++) {
      // 1. Preparar solo
      itemUseSystem.resetCooldown();
      const res = itemUseSystem.useEquippedItem(player, world);
      assert.equal(res.success, true);
      assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);

      // 2. Restaurar solo
      const restored = SoilRegistry.restoreSoil(world, tileX, tileY);
      assert.equal(restored, true);
      assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.GRASS);
    }
  });

  // U. Sprite visual não influencia a seleção.
  it('U. Seleção e alcance devem ser baseados no AABB físico e não em sprites', () => {
    const target = new TileToolTarget(5, 5);
    const bounds = target.getTargetBounds();

    assert.equal(bounds.minX, 5 * TILE_SIZE);
    assert.equal(bounds.minY, 5 * TILE_SIZE);
    assert.equal(bounds.width, TILE_SIZE);
    assert.equal(bounds.height, TILE_SIZE);
  });

  // V. Hotbar/Equipment continuam sendo a fonte do item equipado.
  it('V. A hotbar e equipamento do Player devem continuar sendo a fonte do item ativo', () => {
    const player = new Player({ worldX: 100, worldY: 100 });
    player.inventory.addItemStack(createItemStack('axe', 1));
    player.inventory.addItemStack(createItemStack('hoe', 1));

    // Slot 0 ativo: machado
    player.hotbar.setSelectedSlot(0);
    assert.equal(player.getEquippedItem()?.itemId, 'axe');

    // Slot 1 ativo: enxada
    player.hotbar.setSelectedSlot(1);
    assert.equal(player.getEquippedItem()?.itemId, 'hoe');
  });

  // W. Mobile USE_ITEM utiliza a mesma pipeline da enxada.
  it('W. Mobile aciona use_item e executa a mesma pipeline da enxada', () => {
    const world = new World(42);
    const tileX = 2;
    const tileY = 2;
    const player = new Player({ worldX: tileX * TILE_SIZE - 10, worldY: tileY * TILE_SIZE });
    player.direction = PlayerDirection.RIGHT;
    player.inventory.addItemStack(createItemStack('hoe', 1));

    const input = new Input();
    const itemUseSystem = new ItemUseSystem();

    // Dispara a ação use_item via Input (mesma ação usada pelo MobileControls)
    input.triggerActionDown('use_item');

    const result = itemUseSystem.update(player, world, input, 0.016);
    assert.ok(result, 'ItemUseSystem deve processar a ação use_item');
    assert.equal(result.success, true);
    assert.equal(world.getEffectiveTile(tileX, tileY)?.type, TileType.TILLED_SOIL);
  });
});
