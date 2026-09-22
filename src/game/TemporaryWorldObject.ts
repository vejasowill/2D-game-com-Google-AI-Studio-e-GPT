import { WorldObject } from './WorldObject.ts';

/**
 * Metadados imutáveis que descrevem o ciclo de vida e tempo de expiração de um WorldObject.
 */
export interface ObjectLifecycle {
  /** Timestamp de criação do objeto em tempo de simulação do mundo (em segundos) */
  readonly createdAt: number;
  /** Tempo de vida útil em segundos (TTL). Se <= 0 ou Infinity, o objeto é permanente */
  readonly ttl: number;
  /** Timestamp absoluto de expiração em tempo de simulação do mundo (createdAt + ttl) */
  readonly expiresAt: number;
}

/**
 * Contrato genérico para WorldObjects temporários que participam do sistema de expiração e lifecycle.
 * Desacoplado do tipo específico do objeto (item_drop, projétil, efeito, etc.).
 */
export interface TemporaryWorldObject extends WorldObject {
  /** Metadados de ciclo de vida associados ao objeto */
  readonly lifecycle: ObjectLifecycle;
}

/**
 * Cria uma estrutura de ObjectLifecycle imutável e validada.
 */
export function createObjectLifecycle(createdAt: number, ttl: number): ObjectLifecycle {
  const safeCreatedAt = Number.isFinite(createdAt) && createdAt >= 0 ? createdAt : 0;
  const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : Infinity;
  const expiresAt = Number.isFinite(safeTtl) ? safeCreatedAt + safeTtl : Infinity;

  return Object.freeze({
    createdAt: safeCreatedAt,
    ttl: safeTtl,
    expiresAt,
  });
}

/**
 * Type-guard para verificar se um WorldObject é temporário e possui expiração finita.
 */
export function isTemporaryWorldObject(object: WorldObject | null | undefined): object is TemporaryWorldObject {
  if (!object) {
    return false;
  }
  const candidate = object as Partial<TemporaryWorldObject>;
  return (
    candidate.lifecycle !== undefined &&
    candidate.lifecycle !== null &&
    typeof candidate.lifecycle === 'object' &&
    typeof candidate.lifecycle.createdAt === 'number' &&
    typeof candidate.lifecycle.expiresAt === 'number' &&
    Number.isFinite(candidate.lifecycle.expiresAt)
  );
}

/**
 * Verifica se um WorldObject é permanente (não expira).
 */
export function isPermanentWorldObject(object: WorldObject | null | undefined): boolean {
  return !isTemporaryWorldObject(object);
}
