// 노트 텍스트의 짧은 결정적 해시(FNV-1a 32bit). 캐시 무효화 키 용도라 크립토 강도 불필요.
// 노트가 바뀌면 해시가 바뀌어 question_cache가 자동으로 새 항목을 만든다.
export function noteHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
