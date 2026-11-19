/**
 * Rewrites a prompt for the chosen task and model with an LLM of OpenRouter, through the same job queue as
 * every generation, so the call is priced and kept in the history (outside any project).
 */

import { parsePrevisAnswer, previsInstruction, type PrevisScene } from './previs-scene'
import guides from '../../../../../crates/vs-server/src/prompt-guides.json'
import { generateApi, type Task } from './generate-api'

const PROMPT_MODEL = 'google/gemini-3.8-flash'

function rule(template: string, values: Record<string, string>): string {
  return template.replace(/\{(model|goal|count|language)\}/g, (token, key: string) => values[key] ?? token)
}

export async function improvePrompt(prompt: string, task: Task, modelName: string): Promise<string> {
  const goal = (guides.goals as Partial<Record<Task, string>>)[task] ?? 'the request'
  const system = rule(guides.improve, { model: modelName, goal })
  return runText({ prompt, system, temperature: 0.6 })
}

async function runText({ prompt, system, temperature }: { prompt: string; system: string; temperature: number }): Promise<string> {
  const { jobs } = await generateApi.createJobs({
    provider: 'openrouter',
    model: PROMPT_MODEL,
    task: 'text',
    values: { prompt, system, temperature },
    project_id: null,
    repeat: 1,
    place: false,
  })
  const id = jobs[0]?.id
  if (!id) throw new Error('the server did not start the job')
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 800))
    const job = await generateApi.job(id)
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error ?? job.status)
    if (job.status === 'done') {
      const text = job.outputs.find((output) => output.kind === 'text')?.text?.trim()
      if (!text) throw new Error('the model answered without text')
      return text
    }
  }
}


/** A script split into shots by the prompt model: each shot's prompt for a video model and its length. */
export async function splitScript(script: string, count: number, language: string): Promise<Array<{ prompt: string; seconds: number }>> {
  const system = rule(guides.storyboard, { count: String(count), goal: guides.goals.video, language })
  const text = await runText({ prompt: script, system, temperature: 0.5 })
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`the model did not answer with a list of shots: ${text.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) throw new Error(`the model did not answer with a list of shots: ${text.slice(0, 200)}`)
  const shots = parsed.flatMap((each: unknown) => {
    if (!each || typeof each !== 'object') return []
    const { prompt, seconds } = each as { prompt?: unknown; seconds?: unknown }
    if (typeof prompt !== 'string' || !prompt.trim()) return []
    const length = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.min(10, Math.max(2, seconds)) : 5
    return [{ prompt: prompt.trim(), seconds: length }]
  })
  if (shots.length === 0) throw new Error(`the model answered with no shot: ${text.slice(0, 200)}`)
  return shots
}

/** A 3D blocking of the shot the words describe, built by the prompt model, or the current one changed by them. */
export async function blockShot(
  description: string,
  aspect: string,
  current: PrevisScene | null,
): Promise<PrevisScene> {
  const text = await runText({
    prompt: description,
    system: previsInstruction(aspect, current),
    temperature: 0.4,
  })
  return parsePrevisAnswer(text)
}
