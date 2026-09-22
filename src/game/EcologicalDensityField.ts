import { deterministicHash2D, normalizeHash } from './WorldGenerator.ts';

/**
 * Campo determinístico de densidade ecológica espacial.
 *
 * Responsável por modular a probabilidade dos objetos naturais no espaço
 * com baixa frequência e transições suaves, gerando áreas mais densas,
 * áreas moderadas e clareiras naturais dentro de cada bioma.
 *
 * Princípios arquiteturais:
 * - 100% determinístico e função pura de (seed, globalTileX, globalTileY);
 * - Independente dos campos climáticos (temperatura, umidade, elevação);
 * - Sem dependência de estado global ou mutável;
 * - Sem uso de Math.random() ou Date.now();
 * - Suporta nativamente coordenadas negativas, positivas e distantes;
 * - Nunca instancia ou aloca chunks no ChunkManager;
 * - Combina Macroescala (36 tiles ~ 2.25 chunks) e Mesoescala (14 tiles ~ 0.875 chunks)
 *   com interpolação cúbica Hermite (smoothstep) para evitar artefatos em grade
 *   ou círculos geométricos artificiais ("bolhas").
 */
export class EcologicalDensityField {
  public readonly seed: number;

  // Sementes derivadas ortogonalmente para as duas frequências do campo de densidade
  private readonly seedDensityMacro: number;
  private readonly seedDensityMeso: number;

  // Escalas espaciais:
  // Macroescala de 36 tiles (1152 pixels): estabelece macroáreas ecológicas contínuas
  // Mesoescala de 14 tiles (448 pixels): introduz meandros orgânicos suaves nas bordas de clareiras
  public static readonly DENSITY_MACRO_GRID_SIZE = 36;
  public static readonly DENSITY_MESO_GRID_SIZE = 14;

  constructor(worldSeed: number) {
    this.seed = worldSeed | 0;

    // Derivação determinística de sementes com constantes hexadecimais ortogonais
    this.seedDensityMacro = (this.seed ^ 0x6a09e667) | 0; // Constante fracionária sqrt(2)
    this.seedDensityMeso = (this.seed ^ 0xbb67ae85) | 0;  // Constante fracionária sqrt(3)
  }

  /**
   * Amostra o valor de densidade ecológica na coordenada global de tile.
   * Retorna um número estritamente normalizado no intervalo contínuo [0, 1).
   *
   * Valores próximos a 0 representam clareiras e áreas abertas.
   * Valores médios (~0.5) representam densidade moderada.
   * Valores altos (>0.7) representam núcleos densos e bosques densos.
   */
  public getDensityAt(globalTileX: number, globalTileY: number): number {
    const macro = this.sampleHermiteGrid(
      this.seedDensityMacro,
      globalTileX,
      globalTileY,
      EcologicalDensityField.DENSITY_MACRO_GRID_SIZE,
    );

    const meso = this.sampleHermiteGrid(
      this.seedDensityMeso,
      globalTileX,
      globalTileY,
      EcologicalDensityField.DENSITY_MESO_GRID_SIZE,
    );

    // Composição ponderada: 75% macroestrutura contínua + 25% meandros orgânicos
    const combined = macro * 0.75 + meso * 0.25;

    if (combined <= 0) return 0;
    if (combined >= 1) return 0.999999;
    return combined;
  }

  /**
   * Interpolação Hermite suave (Smoothstep) em grade 2D.
   * Totalmente compatível com coordenadas negativas via Math.floor.
   */
  private sampleHermiteGrid(
    fieldSeed: number,
    globalTileX: number,
    globalTileY: number,
    gridSize: number,
  ): number {
    const gx = Math.floor(globalTileX / gridSize);
    const gy = Math.floor(globalTileY / gridSize);

    const fx = (globalTileX - gx * gridSize) / gridSize;
    const fy = (globalTileY - gy * gridSize) / gridSize;

    // Curva S Hermite cúbica suave: 3*t^2 - 2*t^3
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    // Amostragem determinística nos 4 vértices da célula de grade
    const h00 = normalizeHash(deterministicHash2D(fieldSeed, gx, gy));
    const h10 = normalizeHash(deterministicHash2D(fieldSeed, gx + 1, gy));
    const h01 = normalizeHash(deterministicHash2D(fieldSeed, gx, gy + 1));
    const h11 = normalizeHash(deterministicHash2D(fieldSeed, gx + 1, gy + 1));

    // Interpolação bilinear com suavização Hermite
    const top = (1 - sx) * h00 + sx * h10;
    const bottom = (1 - sx) * h01 + sx * h11;

    const val = (1 - sy) * top + sy * bottom;

    if (val <= 0) return 0;
    if (val >= 1) return 0.999999;
    return val;
  }
}
