const round2 = (value: number) => Math.round(value * 100) / 100;

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Pearson correlation. Small, local, and intentionally not imported from
 * app/lib/investing/portfolioRisk/correlationRisk.ts: that file is already-merged PR-D code and
 * this PR avoids reaching back into it to add a cross-PR dependency for a ~10-line function.
 * Noted here rather than hidden: this is the second copy of this exact formula in the codebase.
 */
export function pearson(x: number[], y: number[]): number | null {
  const length = Math.min(x.length, y.length);
  if (length < 10) return null;
  const xs = x.slice(-length);
  const ys = y.slice(-length);
  const meanX = xs.reduce((sum, v) => sum + v, 0) / length;
  const meanY = ys.reduce((sum, v) => sum + v, 0) / length;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < length; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return round2(cov / Math.sqrt(varX * varY));
}
