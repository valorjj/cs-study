const PALETTE: Record<string, string> = {
  hw: '#f59e0b', os: '#ef4444', network: '#10b981',
  java: '#3b82f6', javascript: '#eab308', dsa: '#8b5cf6',
  spring: '#22c55e', react: '#06b6d4', database: '#ec4899',
  systemdesign: '#f97316', devops: '#14b8a6',
}
export function domainColor(domain: string): string {
  return PALETTE[domain] ?? '#64748b'
}
