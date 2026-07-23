import type { ChatMsg } from './prompt.ts'

// Deno global — this module runs in the Supabase Edge (Deno) runtime. Minimal
// ambient declaration so `tsc -b` (which pulls this file in via the Vitest test
// import) typechecks without adding Deno lib types to the Vite app project.
// Erased at compile time; the real Deno global is present at Edge runtime.
declare const Deno: { env: { get(key: string): string | undefined } }

// OpenAI 호환 chat completions 바디. Gemini(호환 엔드포인트)·Ollama 둘 다 이 형태를 받는다.
export function buildChatBody(model: string, messages: ChatMsg[]): object {
  return {
    model,
    messages,
    temperature: 0,
    response_format: { type: 'json_object' },
    stream: false,
  }
}

// ENV로 배포(Gemini)↔로컬(Ollama)을 가른다.
// - LLM_BASE_URL 예) https://generativelanguage.googleapis.com/v1beta/openai  또는  http://host.docker.internal:11434/v1
// - LLM_API_KEY  Gemini 키(Ollama는 아무 값이나)
// - LLM_MODEL    예) gemini-flash-latest  또는  qwen2.5:3b-instruct
export async function chatComplete(messages: ChatMsg[]): Promise<string> {
  const base = Deno.env.get('LLM_BASE_URL')
  const key = Deno.env.get('LLM_API_KEY') ?? ''
  const model = Deno.env.get('LLM_MODEL')
  if (!base || !model) throw new Error('LLM env not configured')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildChatBody(model, messages)),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('LLM: no content')
  return content
}
