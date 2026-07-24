// 사용자/노트 텍스트의 구분선 토큰을 중화해 데이터 블록 조기 종료(인젝션 브레이크아웃)를 막는다. 순수·import 0.
export function neutralizeDelimiters(s: string): string {
  return s
    .replaceAll('<<<END>>>', '<<< END >>>')
    .replaceAll('<<<ANSWER>>>', '<<< ANSWER >>>')
    .replaceAll('<<<NOTE>>>', '<<< NOTE >>>')
}
