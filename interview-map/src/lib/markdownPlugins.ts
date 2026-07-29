import remarkGfm from 'remark-gfm'
import type { PluggableList } from 'unified'

/**
 * 노트 본문은 범위 표기에 틸드를 쓴다(`0~65535`, `수십~수백 GB`, `3~4단계`).
 * GFM 기본값은 틸드 1개도 취소선으로 인정해서, 한 문단에 범위가 두 번 나오면
 * 그 사이 문장 전체가 취소선이 된다. 취소선은 `~~...~~`만 허용한다.
 */
export const remarkPlugins: PluggableList = [[remarkGfm, { singleTilde: false }]]
