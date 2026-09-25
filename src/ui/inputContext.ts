/**
 * Utilitário desacoplado para detecção determinística de ambiente mobile ou toque.
 *
 * Avalia capacidades reais de hardware (ontouchstart, maxTouchPoints)
 * e o tipo primário de ponteiro (pointer: coarse) sem heurísticas frágeis de User-Agent.
 */
export function isTouchOrMobileEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // 1. Verifica se o dispositivo possui suporte a toque ativo ou pontos de toque
  const hasTouchCapability =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && ((navigator.maxTouchPoints ?? 0) > 0));

  // 2. Verifica se o ponteiro primário do sistema é impreciso (dedo em tela sensível ao toque)
  const isCoarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  // 3. Verifica se o dispositivo não suporta hover (característica universal de telas sensíveis ao toque)
  const hasNoHover =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none)').matches;

  // 4. Detecção por User-Agent para ambientes mobile/tablets reais
  const isMobileUserAgent =
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(navigator.userAgent);

  // 5. Verificação de dimensões de tela tipicamente mobile/smartphone
  const isMobileScreen =
    typeof window.innerWidth === 'number' &&
    (window.innerWidth <= 768 || (window.innerHeight <= 500 && window.innerWidth <= 1024));

  return hasTouchCapability || isCoarsePointer || hasNoHover || isMobileUserAgent || isMobileScreen;
}
