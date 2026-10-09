/**
 * Asignación óptima (algoritmo húngaro, O(n²·m)) sobre una matriz de costos rectangular.
 * Devuelve, para cada renglón, la columna asignada o -1. Las celdas prohibidas llevan un
 * costo muy alto y el llamador descarta las asignaciones que lo alcanzan.
 */
export function hungarian(cost: number[][]): number[] {
  const rows = cost.length;
  const cols = rows ? (cost[0]?.length ?? 0) : 0;
  if (!rows || !cols) return new Array<number>(rows).fill(-1);
  if (rows > cols) {
    // Transponer para que n ≤ m y volver a invertir el resultado.
    const transposed = Array.from({ length: cols }, (_, j) => cost.map((row) => row[j] ?? 0));
    const byColumn = hungarian(transposed);
    const result = new Array<number>(rows).fill(-1);
    byColumn.forEach((row, column) => {
      if (row >= 0) result[row] = column;
    });
    return result;
  }
  const n = rows;
  const m = cols;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const current = (cost[i0 - 1]?.[j - 1] ?? 0) - u[i0]! - v[j]!;
        if (current < minv[j]!) {
          minv[j] = current;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j]! > 0) result[p[j]! - 1] = j - 1;
  }
  return result;
}
