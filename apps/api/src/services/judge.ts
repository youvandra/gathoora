import { JudgeScore } from '../types'
import { generateText } from './openai'

export async function judgeDebate(topic: string, aText: string, bText: string) {
  const system = 'You are a strict debate judge panel. Evaluate A vs B using these criteria: 1) Argument Strength, 2) Factual Accuracy, 3) Direct Response Quality, 4) Coherence & Structure, 5) Persuasiveness, 6) Logical Fallacies Detection, 7) Rebuttal Efficiency, 8) Final Position Strength. Use only provided texts.'
  const prompt = `Topic: ${topic}\nA: ${aText}\nB: ${bText}\nReturn JSON with numeric scores (0-10) per factor and overall 0-1: {"A": {"argument_strength": number, "factual_accuracy": number, "direct_response": number, "coherence": number, "persuasiveness": number, "fallacies": number, "rebuttal_efficiency": number, "final_position": number}, "B": {"argument_strength": number, "factual_accuracy": number, "direct_response": number, "coherence": number, "persuasiveness": number, "fallacies": number, "rebuttal_efficiency": number, "final_position": number}, "overall": {"a": number, "b": number}}`
  const out = await generateText(system, prompt)
  try {
    const parsed = JSON.parse(out)
    let a = typeof parsed?.overall?.a === 'number' ? parsed.overall.a : (typeof parsed?.a_overall === 'number' ? parsed.a_overall : (typeof parsed?.a === 'number' ? parsed.a : undefined))
    let b = typeof parsed?.overall?.b === 'number' ? parsed.overall.b : (typeof parsed?.b_overall === 'number' ? parsed.b_overall : (typeof parsed?.b === 'number' ? parsed.b : undefined))
    if (typeof a !== 'number' || typeof b !== 'number') {
      const Ax = parsed?.A
      const Bx = parsed?.B
      const to01 = (v: number) => Math.max(0, Math.min(1, v / 10))
      if (Ax && Bx) {
        const w = { argument_strength: 0.2, factual_accuracy: 0.2, direct_response: 0.15, coherence: 0.15, persuasiveness: 0.1, rebuttal_efficiency: 0.1, final_position: 0.1 }
        const faA = typeof Ax.fallacies === 'number' ? Ax.fallacies : 10
        const faB = typeof Bx.fallacies === 'number' ? Bx.fallacies : 10
        const fallacyPenaltyA = (10 - faA) / 10 * 0.1
        const fallacyPenaltyB = (10 - faB) / 10 * 0.1
        const sumA = (to01(Ax.argument_strength) * w.argument_strength) + (to01(Ax.factual_accuracy) * w.factual_accuracy) + (to01(Ax.direct_response) * w.direct_response) + (to01(Ax.coherence) * w.coherence) + (to01(Ax.persuasiveness) * w.persuasiveness) + (to01(Ax.rebuttal_efficiency) * w.rebuttal_efficiency) + (to01(Ax.final_position) * w.final_position)
        const sumB = (to01(Bx.argument_strength) * w.argument_strength) + (to01(Bx.factual_accuracy) * w.factual_accuracy) + (to01(Bx.direct_response) * w.direct_response) + (to01(Bx.coherence) * w.coherence) + (to01(Bx.persuasiveness) * w.persuasiveness) + (to01(Bx.rebuttal_efficiency) * w.rebuttal_efficiency) + (to01(Bx.final_position) * w.final_position)
        a = Math.max(0, Math.min(1, sumA - fallacyPenaltyA))
        b = Math.max(0, Math.min(1, sumB - fallacyPenaltyB))
      }
    }
    const as = typeof a === 'number' ? Math.max(0, Math.min(1, a)) : 0.5
    const bs = typeof b === 'number' ? Math.max(0, Math.min(1, b)) : 0.5
    return { agentAScore: as, agentBScore: bs }
  } catch {
    const lenA = aText.length
    const lenB = bText.length
    const total = lenA + lenB || 1
    return { agentAScore: lenA / total, agentBScore: lenB / total }
  }
}

export async function aggregateJudgeScores(scores: JudgeScore[]) {
  const a = scores.reduce((s, v) => s + v.agentAScore, 0) / scores.length
  const b = scores.reduce((s, v) => s + v.agentBScore, 0) / scores.length
  return { a, b }
}

export async function judgeConclusion(topic: string, aText: string, bText: string, avgA: number, avgB: number) {
  const system = 'You are a strict debate judge. Provide a concise, neutral conclusion focusing on the comparative result of arguments, not numeric scores.'
  const prompt = `Topic: ${topic}\nSummarize in 2-4 sentences which side prevailed and why, based strictly on: argument strength, factual accuracy, direct response quality, coherence & structure, persuasiveness, logical fallacies (if any), rebuttal efficiency, and final position strength. Avoid mentioning numbers or scores. Consider A:\n${aText}\nConsider B:\n${bText}`
  const out = await generateText(system, prompt)
  return (out || '').trim()
}
