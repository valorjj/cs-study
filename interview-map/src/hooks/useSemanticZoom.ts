export function visibleLevels(zoom: number): Array<0 | 1> {
  if (zoom < 0.6) return [0]
  return [0, 1]
}
