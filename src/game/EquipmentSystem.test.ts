import { strict as assert } from 'node:assert';
import { CollisionSystem } from './CollisionSystem.ts';
import { DEFAULT_HOTBAR_SLOT_COUNT } from './constants.ts';
import { Equipment } from './Equipment.ts';
import { Hotbar } from './Hotbar.ts';
import { Inventory } from './Inventory.ts';
import { ItemRegistry } from './ItemRegistry.ts';
import { createItemStack } from './ItemStack.ts';
import { Player } from './Player.ts';
import { InputSource, Vector2D } from './types.ts';
import { World } from './World.ts';

class MockInput implements InputSource {
  private justPressed: Set<string> = new Set();
  public movement: Vector2D = { x: 0, y: 0 };

  public getMovementDirection(): Vector2D {
    return this.movement;
  }

  public isActionJustPressed(action: string): boolean {
    return this.justPressed.has(action);
  }

  public press(action: string): void {
    this.justPressed.add(action);
  }

  public clearFrameState(): void {
    this.justPressed.clear();
  }
}

function runTestSuite(): void {
  console.log('--- Iniciando Testes do Sistema de Equipamento e Hotbar (EquipmentSystem) ---');

  ItemRegistry.ensureInitialized();

  // =========================================================================
  // Teste A: Seleção inicial determinística
  // =========================================================================
  {
    const player1 = new Player({ worldX: 0, worldY: 0 });
    const player2 = new Player({ worldX: 100, worldY: 100 });

    assert.equal(player1.hotbar.getSelectedSlotIndex(), 0, 'Seleção inicial da hotbar deve ser estritamente 0');
    assert.equal(player2.hotbar.getSelectedSlotIndex(), 0, 'Seleção inicial deve ser determinística em qualquer instância');
    assert.equal(player1.equipment.getSelectedSlotIndex(), 0, 'Equipment deve iniciar apontando para o slot 0');
    assert.equal(player1.getEquippedItem(), null, 'Slot inicial vazio deve produzir getEquippedItem() === null');
    console.log('✓ Teste A passou: Seleção inicial determinística');
  }

  // =========================================================================
  // Teste B: Selecionar slot válido
  // =========================================================================
  {
    const hotbar = new Hotbar(DEFAULT_HOTBAR_SLOT_COUNT);
    const success = hotbar.setSelectedSlot(3);
    assert.equal(success, true, 'setSelectedSlot(3) deve retornar true para slot válido');
    assert.equal(hotbar.getSelectedSlotIndex(), 3, 'Slot selecionado deve ser 3');

    const lastSlot = hotbar.getSlotCount() - 1;
    assert.equal(hotbar.setSelectedSlot(lastSlot), true, 'Deve permitir selecionar o último slot válido');
    assert.equal(hotbar.getSelectedSlotIndex(), lastSlot, `Slot selecionado deve ser ${lastSlot}`);

    // Tentativa inválida não altera a seleção anterior
    assert.equal(hotbar.setSelectedSlot(-1), false, 'Slot negativo deve ser rejeitado');
    assert.equal(hotbar.setSelectedSlot(hotbar.getSlotCount()), false, 'Slot acima do limite deve ser rejeitado');
    assert.equal(hotbar.getSelectedSlotIndex(), lastSlot, 'Seleção deve permanecer intacta após tentativa inválida');
    console.log('✓ Teste B passou: Selecionar slot válido');
  }

  // =========================================================================
  // Teste C: Selecionar slot vazio
  // =========================================================================
  {
    const player = new Player({ worldX: 50, worldY: 50 });
    // Preenche apenas o slot 0
    player.inventory.setSlot(0, createItemStack('wood', 5));

    // Seleciona slot 4 que está vazio
    player.hotbar.setSelectedSlot(4);
    assert.equal(player.hotbar.getSelectedSlotIndex(), 4, 'Hotbar deve selecionar o slot 4');
    assert.equal(player.inventory.getSlot(4), null, 'Slot 4 do inventário deve estar vazio');
    assert.equal(player.getEquippedItem(), null, 'Equipped item deve ser null ao selecionar slot vazio');
    assert.equal(player.getEquippedStack(), null, 'Equipped stack deve ser null ao selecionar slot vazio');
    assert.equal(player.equipment.hasEquippedItem(), false, 'hasEquippedItem deve retornar false');
    console.log('✓ Teste C passou: Selecionar slot vazio');
  }

  // =========================================================================
  // Teste D: Próximo slot
  // =========================================================================
  {
    const hotbar = new Hotbar(4);
    assert.equal(hotbar.getSelectedSlotIndex(), 0);
    assert.equal(hotbar.nextSlot(), 1, 'nextSlot() de 0 deve ir para 1');
    assert.equal(hotbar.nextSlot(), 2, 'nextSlot() de 1 deve ir para 2');
    assert.equal(hotbar.nextSlot(), 3, 'nextSlot() de 2 deve ir para 3');
    console.log('✓ Teste D passou: Próximo slot sequencial');
  }

  // =========================================================================
  // Teste E: Slot anterior
  // =========================================================================
  {
    const hotbar = new Hotbar(4);
    hotbar.setSelectedSlot(3);
    assert.equal(hotbar.previousSlot(), 2, 'previousSlot() de 3 deve ir para 2');
    assert.equal(hotbar.previousSlot(), 1, 'previousSlot() de 2 deve ir para 1');
    assert.equal(hotbar.previousSlot(), 0, 'previousSlot() de 1 deve ir para 0');
    console.log('✓ Teste E passou: Slot anterior sequencial');
  }

  // =========================================================================
  // Teste F: Wrap-around da hotbar
  // =========================================================================
  {
    const hotbar = new Hotbar(4);
    assert.equal(hotbar.getSelectedSlotIndex(), 0);

    // Recuo a partir do início faz wrap para o final
    assert.equal(hotbar.previousSlot(), 3, 'previousSlot() a partir do slot 0 deve fazer wrap para o último slot (3)');

    // Avanço a partir do final faz wrap para o início
    assert.equal(hotbar.nextSlot(), 0, 'nextSlot() a partir do último slot (3) deve fazer wrap para o primeiro slot (0)');
    console.log('✓ Teste F passou: Wrap-around cíclico da hotbar');
  }

  // =========================================================================
  // Teste G: Item equipado corresponde exatamente ao slot selecionado
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(1, createItemStack('wood', 7));
    player.inventory.setSlot(2, createItemStack('stone', 3));

    player.hotbar.setSelectedSlot(1);
    const equipped1 = player.getEquippedItem();
    assert.notEqual(equipped1, null);
    assert.equal(equipped1?.slotIndex, 1);
    assert.equal(equipped1?.itemId, 'wood');
    assert.equal(equipped1?.quantity, 7);

    player.hotbar.setSelectedSlot(2);
    const equipped2 = player.getEquippedItem();
    assert.notEqual(equipped2, null);
    assert.equal(equipped2?.slotIndex, 2);
    assert.equal(equipped2?.itemId, 'stone');
    assert.equal(equipped2?.quantity, 3);
    console.log('✓ Teste G passou: Item equipado corresponde exatamente ao slot selecionado');
  }

  // =========================================================================
  // Teste H: Alteração do conteúdo do slot atualiza o item equipado
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(0, createItemStack('wood', 5));
    assert.equal(player.getEquippedItem()?.quantity, 5);

    // Modifica o conteúdo diretamente no inventário
    player.inventory.setSlot(0, createItemStack('wood', 12));
    assert.equal(player.getEquippedItem()?.quantity, 12, 'Equipped item deve refletir imediatamente a nova quantidade');

    // Substitui por outro item no mesmo slot
    player.inventory.setSlot(0, createItemStack('stone', 1));
    assert.equal(player.getEquippedItem()?.itemId, 'stone', 'Equipped item deve refletir imediatamente o novo itemId');
    console.log('✓ Teste H passou: Alteração do conteúdo do slot atualiza o item equipado');
  }

  // =========================================================================
  // Teste I: Remoção do item equipado limpa o equipamento
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(0, createItemStack('flower', 2));
    assert.equal(player.equipment.hasEquippedItem(), true);

    // Esvazia o slot via clearSlot
    const removed = player.inventory.clearSlot(0);
    assert.notEqual(removed, null);
    assert.equal(player.getEquippedItem(), null, 'getEquippedItem deve ser null após clearSlot');
    assert.equal(player.getEquippedStack(), null, 'getEquippedStack deve ser null após clearSlot');
    assert.equal(player.equipment.hasEquippedItem(), false, 'hasEquippedItem deve ser false');
    console.log('✓ Teste I passou: Remoção do item equipado limpa o equipamento');
  }

  // =========================================================================
  // Teste J: Trocar item não altera posição do Player
  // =========================================================================
  {
    const player = new Player({ worldX: 123.45, worldY: 678.9 });
    player.inventory.setSlot(0, createItemStack('wood', 10));
    player.inventory.setSlot(1, createItemStack('stone', 5));

    const initialPos = { ...player.position };

    player.hotbar.nextSlot();
    assert.deepEqual(player.position, initialPos, 'Posição deve permanecer inalterada após nextSlot');

    player.hotbar.setSelectedSlot(5);
    assert.deepEqual(player.position, initialPos, 'Posição deve permanecer inalterada após setSelectedSlot');
    console.log('✓ Teste J passou: Trocar item não altera posição do Player');
  }

  // =========================================================================
  // Teste K: Trocar item não altera hitbox
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    const initialSize = player.size;
    const initialVisualBounds = player.getVisualBounds();

    player.inventory.setSlot(0, createItemStack('wood', 1));
    player.hotbar.setSelectedSlot(0);
    player.hotbar.setSelectedSlot(1);

    assert.equal(player.size, initialSize, 'Hitbox física size não deve ser modificada');
    assert.deepEqual(player.getVisualBounds(), initialVisualBounds, 'VisualBounds não devem ser alterados');
    console.log('✓ Teste K passou: Trocar item não altera hitbox');
  }

  // =========================================================================
  // Teste L: Trocar item não altera velocidade
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    const initialSpeed = player.speed;

    player.hotbar.nextSlot();
    assert.equal(player.speed, initialSpeed, 'Velocidade não deve ser alterada por troca de slot');
    console.log('✓ Teste L passou: Trocar item não altera velocidade');
  }

  // =========================================================================
  // Teste M: Trocar item não altera colisão
  // =========================================================================
  {
    const world = new World(42);
    const collisionSystem = new CollisionSystem(world);
    const player = new Player({ worldX: 100, worldY: 100 });
    const input = new MockInput();
    input.movement = { x: 1, y: 0 };

    // Move sem item
    player.update(0.1, input, collisionSystem);
    const posX1 = player.position.worldX;

    // Reseta posição, equipa item e move exatamente igual
    player.position = { worldX: 100, worldY: 100 };
    player.inventory.setSlot(0, createItemStack('wood', 10));
    player.hotbar.setSelectedSlot(0);

    player.update(0.1, input, collisionSystem);
    const posX2 = player.position.worldX;

    assert.equal(posX1, posX2, 'Resolução de movimento e colisão deve ser idêntica com ou sem item equipado');
    console.log('✓ Teste M passou: Trocar item não altera colisão');
  }

  // =========================================================================
  // Teste N: Trocar item não materializa chunks
  // =========================================================================
  {
    const world = new World(999);
    const initialChunkCount = world.getLoadedChunkCount();

    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(0, createItemStack('wood', 1));
    player.hotbar.nextSlot();
    player.hotbar.setSelectedSlot(3);

    const chunkCountAfter = world.getLoadedChunkCount();
    assert.equal(chunkCountAfter, initialChunkCount, 'Troca de itens não deve carregar nem descarregar chunks');
    console.log('✓ Teste N passou: Trocar item não materializa chunks');
  }

  // =========================================================================
  // Teste O: Coordenadas negativas permanecem funcionando
  // =========================================================================
  {
    const player = new Player({ worldX: -1500, worldY: -2500 });
    player.inventory.setSlot(0, createItemStack('stone', 20));

    player.hotbar.setSelectedSlot(0);
    assert.equal(player.getEquippedItem()?.itemId, 'stone');
    assert.equal(player.position.worldX, -1500);
    assert.equal(player.position.worldY, -2500);
    console.log('✓ Teste O passou: Coordenadas negativas permanecem plenamente funcionais');
  }

  // =========================================================================
  // Teste P: Inventory continua sendo a única fonte de verdade
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(0, createItemStack('wood', 5));

    // Consome parcialmente o item do inventário
    player.inventory.removeItem('wood', 3);

    // O equipamento reflete a diminuição sem intervenção manual
    const equipped = player.getEquippedItem();
    assert.equal(equipped?.quantity, 2, 'Equipamento deve consultar o inventário como única fonte da verdade');
    console.log('✓ Teste P passou: Inventory continua sendo a única fonte de verdade');
  }

  // =========================================================================
  // Teste Q: Nenhum ItemStack duplicado é criado para representar o equipamento
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    const woodStack = createItemStack('wood', 15);
    player.inventory.setSlot(0, woodStack);

    const equippedStack = player.getEquippedStack();
    assert.equal(equippedStack, woodStack, 'getEquippedStack deve retornar a exata referência de objeto contida no inventário');
    console.log('✓ Teste Q passou: Nenhum ItemStack duplicado é criado');
  }

  // =========================================================================
  // Teste R: Slot vazio resulta em equippedItem null
  // =========================================================================
  {
    const inventory = new Inventory(10);
    const hotbar = new Hotbar(8);
    const equipment = new Equipment(inventory, hotbar);

    hotbar.setSelectedSlot(5);
    assert.equal(equipment.getEquippedItem(), null);
    assert.equal(equipment.getEquippedStack(), null);
    assert.equal(equipment.hasEquippedItem(), false);
    console.log('✓ Teste R passou: Slot vazio resulta em equippedItem null');
  }

  // =========================================================================
  // Teste S: Seleção não depende de Renderer
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.hotbar.setSelectedSlot(2);
    assert.equal(player.hotbar.getSelectedSlotIndex(), 2, 'Hotbar funciona perfeitamente sem Renderer');
    console.log('✓ Teste S passou: Seleção não depende de Renderer');
  }

  // =========================================================================
  // Teste T: Seleção não depende de sprites
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(0, createItemStack('unknown_item_without_sprite', 1));
    player.hotbar.setSelectedSlot(0);
    assert.equal(player.getEquippedItem()?.itemId, 'unknown_item_without_sprite');
    console.log('✓ Teste T passou: Seleção não depende de sprites');
  }

  // =========================================================================
  // Teste U: Seleção não depende de Canvas
  // =========================================================================
  {
    // Executado em ambiente Node.js puro sem Canvas ou DOM
    const hotbar = new Hotbar(8);
    hotbar.nextSlot();
    assert.equal(hotbar.getSelectedSlotIndex(), 1);
    console.log('✓ Teste U passou: Seleção não depende de Canvas');
  }

  // =========================================================================
  // Teste V: Seleção permanece correta após operações de Inventory
  // =========================================================================
  {
    const player = new Player({ worldX: 0, worldY: 0 });
    player.inventory.setSlot(0, createItemStack('wood', 10));
    player.inventory.setSlot(1, createItemStack('stone', 20));

    player.hotbar.setSelectedSlot(0);
    assert.equal(player.getEquippedItem()?.itemId, 'wood');

    // Troca de slots (swap)
    player.inventory.swapSlots(0, 1);
    // Slot 0 agora possui stone
    assert.equal(player.getEquippedItem()?.itemId, 'stone', 'Equipamento deve refletir o conteúdo pós-swap');

    // Divisão de stack (split)
    player.inventory.splitSlot(0, 5, 2);
    assert.equal(player.getEquippedItem()?.quantity, 15, 'Equipamento deve refletir a redução do stack pelo split');
    console.log('✓ Teste V passou: Seleção permanece correta após operações de Inventory');
  }

  // =========================================================================
  // Teste W: Comportamento determinístico em múltiplas trocas de slot
  // =========================================================================
  {
    const simulateRun = () => {
      const p = new Player({ worldX: 0, worldY: 0 });
      p.inventory.setSlot(0, createItemStack('wood', 10));
      p.inventory.setSlot(3, createItemStack('stone', 5));
      p.inventory.setSlot(7, createItemStack('flower', 1));

      const input = new MockInput();

      // Sequência de ações
      input.press('next_slot');
      p.updateHotbar(input);
      input.clearFrameState();

      input.press('slot_4'); // slot índice 3
      p.updateHotbar(input);
      input.clearFrameState();

      const stateAt3 = p.getEquippedItem()?.itemId;

      input.press('prev_slot');
      p.updateHotbar(input);
      input.clearFrameState();

      input.press('slot_8'); // slot índice 7
      p.updateHotbar(input);
      input.clearFrameState();

      const stateAt7 = p.getEquippedItem()?.itemId;

      return {
        finalIndex: p.hotbar.getSelectedSlotIndex(),
        stateAt3,
        stateAt7,
      };
    };

    const run1 = simulateRun();
    const run2 = simulateRun();

    assert.deepEqual(run1, run2, 'Execuções idênticas devem produzir estados rigorosamente determinísticos');
    assert.equal(run1.finalIndex, 7);
    assert.equal(run1.stateAt3, 'stone');
    assert.equal(run1.stateAt7, 'flower');
    console.log('✓ Teste W passou: Comportamento determinístico em múltiplas trocas de slot');
  }

  console.log('\n--- TODOS OS 23 TESTES (A até W) DO SISTEMA DE EQUIPAMENTO PASSARAM COM SUCESSO! ---');
}

runTestSuite();
