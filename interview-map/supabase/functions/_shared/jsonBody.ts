// 요청 본문이 실제로 JSON 객체인지 확인한다.
//
// `await req.json()` 은 본문이 `null`·`[]`·`"x"`·`42` 여도 성공한다 — JSON으로
// 유효하기 때문이다. 그래서 try/catch 만 두고 곧바로 구조분해하면(`const { a } =
// body`) `null` 에서 TypeError 가 나고, 클라이언트는 400 대신 500 을 받는다.
// "잘못된 요청"이 "서버 장애"로 보고되면 원인 추적이 어려워지고, 500 은 재시도
// 대상으로 취급되기도 한다.
//
// 필드 검증은 하지 않는다 — 그건 함수마다 다르고, 호출자의 책임이다.
// 이 헬퍼는 "구조분해해도 안전한가"만 답한다.
export function asObjectBody(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}
