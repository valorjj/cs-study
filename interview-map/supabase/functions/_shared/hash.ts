// 노트 텍스트의 결정적 짧은 해시(FNV-1a 32bit). 질문 캐시 무효화 키. 순수·import 0(Deno·Vitest 공용).
export function noteHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
