import assert from 'node:assert';
import {
  HealthState,
  createHealthState,
  damageHealth,
  getHealthPercentage,
  getMissingHealth,
  getRemainingHealth,
  hasEnoughHealth,
  isAlive,
  isDead,
  restoreHealth,
  setHealth,
  setMaximumHealth,
} from './HealthState.ts';
import {
  HealthDamageResult,
  HealthEvent,
  HealthSystem,
} from './HealthSystem.ts';
import {
  DamageDefinition,
  DamageRegistry,
  DamageType,
  createDamageDefinition,
} from './DamageDefinition.ts';
import {
  DamageResult,
  DamageResultCode,
  DamageableTarget,
  createDamageResult,
} from './DamageableTarget.ts';
import { DamageSystem } from './DamageSystem.ts';
import { Player } from './Player.ts';
import { DEFAULT_PLAYER_MAX_HEALTH } from './constants.ts';

console.log('--- Iniciando Suíte Completa de Testes de Vida, Dano e Morte (HealthSystem) ---');

// =========================================================================
// A. Criação de HealthState padrão
// =========================================================================
{
  const defaultState = createHealthState();
  assert.strictEqual(defaultState.maximum, 100, 'A.1: maximum padrão deve ser 100');
  assert.strictEqual(defaultState.current, 100, 'A.2: current padrão deve ser igual ao maximum (100)');
  assert.strictEqual(isAlive(defaultState), true, 'A.3: isAlive deve ser true no estado padrão');
  assert.strictEqual(isDead(defaultState), false, 'A.4: isDead deve ser false no estado padrão');
  assert.strictEqual(getHealthPercentage(defaultState), 1.0, 'A.5: getHealthPercentage deve ser 1.0');
  assert.strictEqual(getRemainingHealth(defaultState), 100, 'A.6: getRemainingHealth deve ser 100');
  assert.strictEqual(getMissingHealth(defaultState), 0, 'A.7: getMissingHealth deve ser 0');

  const defaultSystem = new HealthSystem();
  assert.strictEqual(defaultSystem.getMaximum(), 100, 'A.8: HealthSystem maximum padrão é 100');
  assert.strictEqual(defaultSystem.getCurrent(), 100, 'A.9: HealthSystem current padrão é 100');
  assert.strictEqual(defaultSystem.isAlive(), true, 'A.10: HealthSystem isAlive é true');
  assert.strictEqual(defaultSystem.isDead(), false, 'A.11: HealthSystem isDead é false');

  console.log('✓ Requisito A passou: Criação de HealthState padrão');
}

// =========================================================================
// B. Criação customizada
// =========================================================================
{
  const customState = createHealthState(75, 150);
  assert.strictEqual(customState.maximum, 150, 'B.1: maximum customizado deve ser 150');
  assert.strictEqual(customState.current, 75, 'B.2: current customizado deve ser 75');
  assert.strictEqual(getHealthPercentage(customState), 0.5, 'B.3: getHealthPercentage deve ser 0.5');
  assert.strictEqual(getMissingHealth(customState), 75, 'B.4: getMissingHealth deve ser 75');

  const customSystem = new HealthSystem(200, 50);
  assert.strictEqual(customSystem.getMaximum(), 200, 'B.5: maximum customizado no sistema deve ser 200');
  assert.strictEqual(customSystem.getCurrent(), 50, 'B.6: current customizado no sistema deve ser 50');
  assert.strictEqual(customSystem.getPercentage(), 0.25, 'B.7: percentual customizado no sistema deve ser 0.25');

  console.log('✓ Requisito B passou: Criação customizada');
}

// =========================================================================
// C. Rejeição de maximum <= 0
// =========================================================================
{
  assert.throws(() => createHealthState(50, 0), /positivo/, 'C.1: Deve rejeitar maximum = 0');
  assert.throws(() => createHealthState(50, -10), /positivo/, 'C.2: Deve rejeitar maximum negativo');
  assert.throws(() => createHealthState(50, NaN), /positivo/, 'C.3: Deve rejeitar maximum NaN');
  assert.throws(() => new HealthSystem(0), /positivo/, 'C.4: HealthSystem deve rejeitar maximum = 0');
  assert.throws(() => new HealthSystem(-50), /positivo/, 'C.5: HealthSystem deve rejeitar maximum negativo');

  console.log('✓ Requisito C passou: Rejeição de maximum <= 0');
}

// =========================================================================
// D. Clamp / rejeição de current inválido
// =========================================================================
{
  assert.throws(() => createHealthState(NaN, 100), /válido/, 'D.1: Deve rejeitar current NaN');
  assert.throws(() => createHealthState('100' as unknown as number, 100), /válido/, 'D.2: Deve rejeitar current string');

  // Clamp determinístico
  const underflow = createHealthState(-20, 100);
  assert.strictEqual(underflow.current, 0, 'D.3: current negativo sofre clamp para 0');
  assert.strictEqual(isDead(underflow), true, 'D.4: current 0 é considerado morto');

  const overflow = createHealthState(150, 100);
  assert.strictEqual(overflow.current, 100, 'D.5: current acima do máximo sofre clamp para 100');

  console.log('✓ Requisito D passou: Clamp e validação de current');
}

// =========================================================================
// E. Dano válido
// =========================================================================
{
  const system = new HealthSystem(100, 100);
  const result: HealthDamageResult = system.damage(25);

  assert.strictEqual(result.appliedDamage, 25, 'E.1: appliedDamage deve ser 25');
  assert.strictEqual(result.previousHealth, 100, 'E.2: previousHealth deve ser 100');
  assert.strictEqual(result.currentHealth, 75, 'E.3: currentHealth deve ser 75');
  assert.strictEqual(result.killed, false, 'E.4: killed deve ser false');
  assert.strictEqual(result.isAlive, true, 'E.5: isAlive deve ser true');
  assert.strictEqual(system.getCurrent(), 75, 'E.6: system.getCurrent() deve ser 75');

  console.log('✓ Requisito E passou: Dano válido');
}

// =========================================================================
// F. Dano parcial
// =========================================================================
{
  const system = new HealthSystem(100, 80);
  const res1 = system.damage(30);
  assert.strictEqual(res1.appliedDamage, 30, 'F.1: Dano parcial 30 aplicado');
  assert.strictEqual(system.getCurrent(), 50, 'F.2: Vida restante 50');

  const res2 = system.damage(20);
  assert.strictEqual(res2.appliedDamage, 20, 'F.3: Dano parcial 20 aplicado');
  assert.strictEqual(system.getCurrent(), 30, 'F.4: Vida restante 30');

  console.log('✓ Requisito F passou: Dano parcial');
}

// =========================================================================
// G. Dano que leva exatamente a 0
// =========================================================================
{
  const system = new HealthSystem(100, 40);
  const result = system.damage(40);

  assert.strictEqual(result.appliedDamage, 40, 'G.1: dano aplicado deve ser 40');
  assert.strictEqual(result.currentHealth, 0, 'G.2: vida resultante deve ser 0');
  assert.strictEqual(result.killed, true, 'G.3: killed deve ser true ao atingir 0');
  assert.strictEqual(result.wasAlive, true, 'G.4: wasAlive deve ser true');
  assert.strictEqual(result.isAlive, false, 'G.5: isAlive deve ser false');
  assert.strictEqual(system.isDead(), true, 'G.6: system.isDead() deve ser true');
  assert.strictEqual(system.isAlive(), false, 'G.7: system.isAlive() deve ser false');

  console.log('✓ Requisito G passou: Dano que leva exatamente a 0');
}

// =========================================================================
// H. Dano maior que a vida restante
// =========================================================================
{
  const system = new HealthSystem(100, 30);
  const result = system.damage(80);

  assert.strictEqual(result.appliedDamage, 30, 'H.1: dano efetivo deve ser limitado à vida restante (30)');
  assert.strictEqual(result.currentHealth, 0, 'H.2: vida restante deve ser 0');
  assert.strictEqual(result.killed, true, 'H.3: killed deve ser true');
  assert.strictEqual(system.getCurrent(), 0, 'H.4: sistema deve registrar 0 de vida');

  console.log('✓ Requisito H passou: Dano maior que a vida restante');
}

// =========================================================================
// I. Vida nunca fica negativa
// =========================================================================
{
  const state = createHealthState(10, 100);
  const damaged = damageHealth(state, 9999);
  assert.strictEqual(damaged.current, 0, 'I.1: damageHealth nunca produz valor negativo');

  const system = new HealthSystem(100, 5);
  system.damage(1000);
  assert.strictEqual(system.getCurrent(), 0, 'I.2: HealthSystem.damage nunca produz valor negativo');

  console.log('✓ Requisito I passou: Vida nunca fica negativa');
}

// =========================================================================
// J. Alvo morto permanece morto
// =========================================================================
{
  const system = new HealthSystem(100, 0);
  assert.strictEqual(system.isDead(), true, 'J.1: Alvo com 0 de vida inicia morto');
  assert.strictEqual(system.isAlive(), false, 'J.2: isAlive é false');

  // Tentativa de danificar alvo morto
  const damageRes = system.damage(50);
  assert.strictEqual(damageRes.appliedDamage, 0, 'J.3: Nenhum dano aplicado a alvo já morto');
  assert.strictEqual(damageRes.killed, false, 'J.4: killed é false (já estava morto, não houve transição)');
  assert.strictEqual(system.getCurrent(), 0, 'J.5: Vida permanece 0');
  assert.strictEqual(system.isDead(), true, 'J.6: Permanece morto');

  console.log('✓ Requisito J passou: Alvo morto permanece morto');
}

// =========================================================================
// K. Dano em alvo morto é rejeitado
// =========================================================================
{
  const system = new HealthSystem(100, 20);
  system.damage(20); // leva a 0
  assert.strictEqual(system.isDead(), true, 'K.1: Alvo foi morto');

  const postMortemResult = system.damage(10);
  assert.strictEqual(postMortemResult.appliedDamage, 0, 'K.2: Dano pós-morte é rejeitado');
  assert.strictEqual(postMortemResult.isAlive, false, 'K.3: Permanece sem vida');
  assert.strictEqual(system.getCurrent(), 0, 'K.4: Vida permanece 0');

  console.log('✓ Requisito K passou: Dano em alvo morto é rejeitado');
}

// =========================================================================
// L. Cura válida
// =========================================================================
{
  const system = new HealthSystem(100, 40);
  const restored = system.heal(30);

  assert.strictEqual(restored, 30, 'L.1: Deve restaurar exatamente 30');
  assert.strictEqual(system.getCurrent(), 70, 'L.2: Vida atual deve ser 70');
  assert.strictEqual(system.getMissing(), 30, 'L.3: Faltam 30 para o máximo');

  // Rejeição de cura inválida ou zero
  assert.strictEqual(system.heal(0), 0, 'L.4: heal(0) restaura 0');
  assert.strictEqual(system.heal(-10), 0, 'L.5: heal(-10) restaura 0');
  assert.strictEqual(system.heal(NaN), 0, 'L.6: heal(NaN) restaura 0');

  console.log('✓ Requisito L passou: Cura válida');
}

// =========================================================================
// M. Cura nunca ultrapassa maximum
// =========================================================================
{
  const system = new HealthSystem(100, 80);
  const restored = system.heal(50);

  assert.strictEqual(restored, 20, 'M.1: Deve restaurar apenas 20 (até o teto 100)');
  assert.strictEqual(system.getCurrent(), 100, 'M.2: Vida deve ser exatamente o máximo (100)');
  assert.strictEqual(system.getMissing(), 0, 'M.3: Nenhuma vida faltante');

  const overHeal = system.heal(10);
  assert.strictEqual(overHeal, 0, 'M.4: Cura adicional em vida cheia restaura 0');
  assert.strictEqual(system.getCurrent(), 100, 'M.5: Vida permanece 100');

  console.log('✓ Requisito M passou: Cura nunca ultrapassa maximum');
}

// =========================================================================
// N. restoreFull()
// =========================================================================
{
  const system = new HealthSystem(100, 25);
  const totalRestored = system.restoreFull();

  assert.strictEqual(totalRestored, 75, 'N.1: restoreFull deve retornar 75 restaurados');
  assert.strictEqual(system.getCurrent(), 100, 'N.2: Vida atual deve ser 100');
  assert.strictEqual(system.getPercentage(), 1.0, 'N.3: Percentual deve ser 1.0');

  console.log('✓ Requisito N passou: restoreFull()');
}

// =========================================================================
// O. Alteração de maximum
// =========================================================================
{
  const system = new HealthSystem(100, 100);
  system.setMaximum(150);
  assert.strictEqual(system.getMaximum(), 150, 'O.1: Novo máximo é 150');
  assert.strictEqual(system.getCurrent(), 100, 'O.2: Vida atual permanece 100');
  assert.strictEqual(system.getMissing(), 50, 'O.3: Faltam 50 para o novo máximo');

  // Redução do máximo abaixo do current ajusta a vida atual
  system.setMaximum(80);
  assert.strictEqual(system.getMaximum(), 80, 'O.4: Novo máximo é 80');
  assert.strictEqual(system.getCurrent(), 80, 'O.5: Vida sofreu clamp para o novo teto 80');

  assert.throws(() => system.setMaximum(0), /positivo/, 'O.6: setMaximum(0) deve lançar erro');

  console.log('✓ Requisito O passou: Alteração de maximum');
}

// =========================================================================
// P. Valores fracionários
// =========================================================================
{
  const state = createHealthState(12.5, 100.5);
  assert.strictEqual(state.current, 12.5, 'P.1: current fracionário suportado');
  assert.strictEqual(state.maximum, 100.5, 'P.2: maximum fracionário suportado');

  const damaged = damageHealth(state, 2.25);
  assert.strictEqual(damaged.current, 10.25, 'P.3: dano fracionário deduz com precisão');

  const restored = restoreHealth(damaged, 5.5);
  assert.strictEqual(restored.current, 15.75, 'P.4: restauração fracionária com precisão');

  console.log('✓ Requisito P passou: Valores fracionários');
}

// =========================================================================
// Q. Operações determinísticas
// =========================================================================
{
  const runSimulation = () => {
    const sys = new HealthSystem(100, 100);
    sys.damage(15);
    sys.damage(25);
    sys.heal(10);
    sys.damage(70);
    return {
      current: sys.getCurrent(),
      isDead: sys.isDead(),
    };
  };

  const simA = runSimulation();
  const simB = runSimulation();
  assert.deepStrictEqual(simA, simB, 'Q.1: Múltiplas execuções idênticas geram resultados idênticos');
  assert.strictEqual(simA.current, 0, 'Q.2: Simulação resulta deterministicamente em 0');
  assert.strictEqual(simA.isDead, true, 'Q.3: Alvo resulta morto');

  console.log('✓ Requisito Q passou: Operações determinísticas');
}

// =========================================================================
// R. Ausência de Math.random()
// =========================================================================
{
  const originalRandom = Math.random;
  let randomCalled = false;
  Math.random = () => {
    randomCalled = true;
    return 0.5;
  };

  try {
    const sys = new HealthSystem(100, 100);
    sys.damage(20);
    sys.heal(10);
    sys.restoreFull();
    sys.setCurrent(50);
    sys.setMaximum(120);
    sys.reset();
  } finally {
    Math.random = originalRandom;
  }

  assert.strictEqual(randomCalled, false, 'R.1: HealthSystem NUNCA invoca Math.random()');
  console.log('✓ Requisito R passou: Ausência de Math.random()');
}

// =========================================================================
// S. Ausência de relógio real
// =========================================================================
{
  const originalDateNow = Date.now;
  let dateCalled = false;
  Date.now = () => {
    dateCalled = true;
    return 123456789;
  };

  try {
    const sys = new HealthSystem(100, 100);
    sys.damage(30);
    sys.heal(15);
    sys.damage(90);
  } finally {
    Date.now = originalDateNow;
  }

  assert.strictEqual(dateCalled, false, 'S.1: HealthSystem NUNCA consulta Date.now()');
  console.log('✓ Requisito S passou: Ausência de relógio real');
}

// =========================================================================
// T. Ausência de dependência de Renderer/Canvas
// =========================================================================
{
  const sys = new HealthSystem(100, 100);
  assert(sys instanceof HealthSystem, 'T.1: HealthSystem instancia puramente em ambiente Node/headless');
  assert.strictEqual(typeof sys.damage, 'function', 'T.2: Métodos funcionam sem canvas ou DOM');

  console.log('✓ Requisito T passou: Ausência de dependência de Renderer/Canvas');
}

// =========================================================================
// U. Ausência de dependência de Player dentro do HealthSystem
// =========================================================================
{
  // HealthSystem é puramente autônomo e não importa Player
  const standalone = new HealthSystem(50, 50);
  standalone.damage(25);
  assert.strictEqual(standalone.getCurrent(), 25, 'U.1: Funciona perfeitamente desacoplado de Player');

  console.log('✓ Requisito U passou: Ausência de dependência de Player');
}

// =========================================================================
// V. DamageDefinition declarativa e DamageRegistry
// =========================================================================
{
  const def = createDamageDefinition({
    id: 'hazard_spikes',
    amount: 15,
    type: DamageType.ENVIRONMENTAL,
    source: 'spike_trap',
    metadata: { element: 'stone' },
  });

  assert.strictEqual(def.id, 'hazard_spikes', 'V.1: ID correto');
  assert.strictEqual(def.amount, 15, 'V.2: amount correto');
  assert.strictEqual(def.type, DamageType.ENVIRONMENTAL, 'V.3: tipo correto');
  assert.strictEqual(def.source, 'spike_trap', 'V.4: source correto');

  assert.throws(() => createDamageDefinition({ id: '', amount: 10 }), /id/, 'V.5: Rejeita ID vazio');
  assert.throws(() => createDamageDefinition({ id: 'test', amount: -5 }), /não-negativo/, 'V.6: Rejeita amount negativo');

  // DamageRegistry
  DamageRegistry.clear();
  DamageRegistry.ensureInitialized();
  assert.strictEqual(DamageRegistry.has('default_physical'), true, 'V.7: Registro canônico default_physical');
  assert.strictEqual(DamageRegistry.has('environmental_hazard'), true, 'V.8: Registro canônico environmental_hazard');

  console.log('✓ Requisito V passou: DamageDefinition declarativa e DamageRegistry');
}

// =========================================================================
// W. DamageableTarget contrato genérico (alvo mock de teste)
// =========================================================================
{
  class MockDestructibleTarget implements DamageableTarget {
    public readonly id = 'mock_destructible';
    public readonly health: HealthSystem;

    constructor(maxHp: number = 50) {
      this.health = new HealthSystem(maxHp);
    }

    public isAlive(): boolean {
      return this.health.isAlive();
    }

    public canReceiveDamage(damage: DamageDefinition): boolean {
      return this.health.isAlive() && damage.amount >= 0;
    }

    public receiveDamage(damage: DamageDefinition): DamageResult {
      if (!this.canReceiveDamage(damage)) {
        return createDamageResult(false, 0, this.health.getCurrent(), false, DamageResultCode.TARGET_REJECTED, damage, this.id);
      }
      const res = this.health.damage(damage.amount);
      const code = res.killed ? DamageResultCode.TARGET_KILLED : DamageResultCode.DAMAGE_APPLIED;
      return createDamageResult(true, res.appliedDamage, res.currentHealth, res.killed, code, damage, this.id);
    }

    public getHealth(): HealthState {
      return this.health.getState();
    }
  }

  const target = new MockDestructibleTarget(50);
  assert.strictEqual(target.isAlive(), true, 'W.1: Alvo mock está vivo');

  const damageSystem = new DamageSystem();
  const damage = createDamageDefinition({ id: 'chop', amount: 20, type: DamageType.PHYSICAL });
  const result = damageSystem.applyDamage(target, damage);

  assert.strictEqual(result.success, true, 'W.2: Dano aplicado via DamageSystem sem conhecer a classe concreta');
  assert.strictEqual(result.damageApplied, 20, 'W.3: Dano aplicado de 20');
  assert.strictEqual(result.remainingHealth, 30, 'W.4: Vida restante 30');
  assert.strictEqual(result.code, DamageResultCode.DAMAGE_APPLIED, 'W.5: Código DAMAGE_APPLIED');

  console.log('✓ Requisito W passou: DamageableTarget contrato genérico');
}

// =========================================================================
// X. DamageResult e códigos determinísticos
// =========================================================================
{
  const damageSystem = new DamageSystem();
  const target = new Player({ worldX: 0, worldY: 0 });

  // 1. Dano inválido
  const invalidResult = damageSystem.applyDamage(target, { id: '', amount: -10, type: DamageType.PHYSICAL });
  assert.strictEqual(invalidResult.success, false, 'X.1: Falha em dano inválido');
  assert.strictEqual(invalidResult.code, DamageResultCode.INVALID_DAMAGE, 'X.2: Código INVALID_DAMAGE');

  // 2. Dano 0
  const zeroDamage = createDamageDefinition({ id: 'tickle', amount: 0, type: DamageType.PHYSICAL });
  const zeroResult = damageSystem.applyDamage(target, zeroDamage);
  assert.strictEqual(zeroResult.success, true, 'X.3: Dano 0 tem sucesso');
  assert.strictEqual(zeroResult.damageApplied, 0, 'X.4: 0 dano aplicado');
  assert.strictEqual(zeroResult.code, DamageResultCode.NO_DAMAGE, 'X.5: Código NO_DAMAGE');

  // 3. Dano normal
  const normalDamage = createDamageDefinition({ id: 'hit', amount: 30, type: DamageType.PHYSICAL });
  const normalResult = damageSystem.applyDamage(target, normalDamage);
  assert.strictEqual(normalResult.code, DamageResultCode.DAMAGE_APPLIED, 'X.6: Código DAMAGE_APPLIED');
  assert.strictEqual(normalResult.damageApplied, 30, 'X.7: 30 aplicado');

  // 4. Dano letal
  const lethalDamage = createDamageDefinition({ id: 'lethal', amount: 200, type: DamageType.PHYSICAL });
  const lethalResult = damageSystem.applyDamage(target, lethalDamage);
  assert.strictEqual(lethalResult.killed, true, 'X.8: killed é true');
  assert.strictEqual(lethalResult.code, DamageResultCode.TARGET_KILLED, 'X.9: Código TARGET_KILLED');

  // 5. Dano em alvo já morto
  const deadDamage = damageSystem.applyDamage(target, normalDamage);
  assert.strictEqual(deadDamage.success, false, 'X.10: Dano em morto não tem sucesso');
  assert.strictEqual(deadDamage.code, DamageResultCode.TARGET_DEAD, 'X.11: Código TARGET_DEAD');

  console.log('✓ Requisito X passou: DamageResult e códigos determinísticos');
}

// =========================================================================
// Y. Atomicidade do DamageSystem
// =========================================================================
{
  const damageSystem = new DamageSystem();
  let eventDispatched = false;
  damageSystem.subscribe(() => {
    eventDispatched = true;
  });

  const player = new Player({ worldX: 10, worldY: 10 });
  const initialHealth = player.getHealth().current;

  // Dano inválido não altera vida nem dispara evento
  damageSystem.applyDamage(player, { id: 'invalid', amount: -50, type: DamageType.PHYSICAL });
  assert.strictEqual(player.getHealth().current, initialHealth, 'Y.1: Vida inalterada após dano inválido');
  assert.strictEqual(eventDispatched, false, 'Y.2: Nenhum evento disparado em validação com falha');

  // Dano em alvo morto não altera vida nem dispara evento
  player.health.damage(100); // morre
  assert.strictEqual(player.isAlive(), false, 'Y.3: Player morto');
  eventDispatched = false;

  const res = damageSystem.applyDamage(player, createDamageDefinition({ id: 'strike', amount: 50 }));
  assert.strictEqual(res.success, false, 'Y.4: Dano rejeitado em alvo morto');
  assert.strictEqual(player.getHealth().current, 0, 'Y.5: Vida permanece 0');
  assert.strictEqual(eventDispatched, false, 'Y.6: Nenhum evento disparado pós-morte');

  console.log('✓ Requisito Y passou: Atomicidade do DamageSystem');
}

// =========================================================================
// Z. Integração com Player (Player como DamageableTarget)
// =========================================================================
{
  const player = new Player({ worldX: 100, worldY: 200 });

  // 1. Acesso à vida e constantes declarativas
  assert.strictEqual(DEFAULT_PLAYER_MAX_HEALTH, 100, 'Z.1: DEFAULT_PLAYER_MAX_HEALTH padrão é 100');
  assert.strictEqual(player.health.getMaximum(), 100, 'Z.2: player.health tem 100 de vida máxima');
  assert.strictEqual(player.getHealth().current, 100, 'Z.3: player.getHealth().current é 100');
  assert.strictEqual(player.getHealthSystem(), player.health, 'Z.4: player.getHealthSystem() retorna health');
  assert.strictEqual(player.isAlive(), true, 'Z.5: player.isAlive() é true');

  // 2. Não afeta física, velocidade, posição ou tamanho
  assert.strictEqual(player.position.worldX, 100, 'Z.6: worldX inalterado');
  assert.strictEqual(player.position.worldY, 200, 'Z.7: worldY inalterado');
  assert.strictEqual(player.size, 24, 'Z.8: size inalterado');
  assert.strictEqual(player.speed, 160, 'Z.9: speed inalterado');
  assert.strictEqual(player.getFootBaseY(), 224, 'Z.10: FootBaseY (Y-sorting) inalterado');

  // 3. Aplicação de dano diretamente ou via DamageSystem
  const damage = createDamageDefinition({ id: 'fall_damage', amount: 20, type: DamageType.FALL });
  const result = player.receiveDamage(damage);

  assert.strictEqual(result.success, true, 'Z.11: Player recebe dano via contrato DamageableTarget');
  assert.strictEqual(result.damageApplied, 20, 'Z.12: 20 dano aplicado');
  assert.strictEqual(player.getHealth().current, 80, 'Z.13: Vida do Player atualizada para 80');

  console.log('✓ Requisito Z passou: Integração com Player');
}

// =========================================================================
// AA. Independência completa entre HealthSystem e EnergySystem
// =========================================================================
{
  const player = new Player({ worldX: 0, worldY: 0 });

  // Dano na vida NÃO altera energia
  player.receiveDamage(createDamageDefinition({ id: 'sting', amount: 30 }));
  assert.strictEqual(player.getHealth().current, 70, 'AA.1: Vida reduziu para 70');
  assert.strictEqual(player.getEnergy().getCurrent(), 100, 'AA.2: Energia permanece intacta em 100');

  // Consumo de energia NÃO altera vida
  player.getEnergy().consume(40);
  assert.strictEqual(player.getEnergy().getCurrent(), 60, 'AA.3: Energia reduziu para 60');
  assert.strictEqual(player.getHealth().current, 70, 'AA.4: Vida permanece intacta em 70');

  // Cura de vida NÃO altera energia
  player.getHealthSystem().heal(15);
  assert.strictEqual(player.getHealth().current, 85, 'AA.5: Vida aumentou para 85');
  assert.strictEqual(player.getEnergy().getCurrent(), 60, 'AA.6: Energia inalterada');

  console.log('✓ Requisito AA passou: Independência completa entre HealthSystem e EnergySystem');
}

// =========================================================================
// AB. Listeners e eventos desacoplados
// =========================================================================
{
  const system = new HealthSystem(100, 100);
  const events: HealthEvent[] = [];

  const unDamage = system.on('damage_received', (e) => events.push(e));
  const unDeath = system.on('death', (e) => events.push(e));
  const unHeal = system.on('healed', (e) => events.push(e));

  let changeNotified = false;
  const unSub = system.subscribe(() => {
    changeNotified = true;
  });

  // 1. Dano normal
  system.damage(30);
  assert.strictEqual(events.length, 1, 'AB.1: 1 evento recebido');
  assert.strictEqual(events[0].type, 'damage_received', 'AB.2: Tipo damage_received');
  assert.strictEqual(events[0].amount, 30, 'AB.3: amount 30');
  assert.strictEqual(changeNotified, true, 'AB.4: Subscriber de mudança acionado');

  // 2. Cura
  changeNotified = false;
  system.heal(10);
  assert.strictEqual(events.length, 2, 'AB.5: 2 eventos recebidos');
  assert.strictEqual(events[1].type, 'healed', 'AB.6: Tipo healed');
  assert.strictEqual(events[1].amount, 10, 'AB.7: amount 10');

  // 3. Morte
  system.damage(100);
  const deathEvent = events.find((e) => e.type === 'death');
  assert(deathEvent !== undefined, 'AB.8: Evento death emitido ao transicionar para 0');

  // 4. Cancelamento de inscrição
  unDamage();
  unDeath();
  unHeal();
  unSub();

  const prevLen = events.length;
  system.reset();
  assert.strictEqual(events.length, prevLen, 'AB.9: Nenhum evento emitido após unsubscribe');

  console.log('✓ Requisito AB passou: Listeners e eventos desacoplados');
}

console.log('======================================================');
console.log('Todos os testes da fundação HealthSystem passaram com sucesso!');
console.log('======================================================');
