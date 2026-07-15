export function visibleLevels(zoom: number): Array<0 | 1 | 2> {
  if (zoom < 0.6) return [0]
  if (zoom < 1.1) return [0, 1]
  return [0, 1, 2]
}
