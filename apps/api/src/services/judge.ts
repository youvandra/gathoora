import { JudgeScore } from '../types'
import { generateText } from './openai'

export async function judgeDebate(topic: string, aText: string, bText: string) {
  const system = 'You are a strict multi-criteria debate judge. Evaluate A vs B only from their texts. Score 0–10 for these factors: 1) Argument Strength (logic quality, relevance, reasoning, evidence), 2) Factual Accuracy (hallucinations, correctness, consistency with reliable sources), 3) Direct Response Quality (addresses opponent points, avoids dodging), 4) Coherence & Structure (flow, internal consistency, clarity, progression), 5) Persuasiveness (clarity, reasoning, confidence, evidence density), 6) Logical Fallacies Detection (fewer fallacies is better; score this as 0–10 quality where 10 means no fallacies), 7) Rebuttal Efficiency (effectiveness dismantling opponent points), 8) Final Position Strength (completeness of final stance and defense).'
  const prompt = `Topic: ${topic}\nA: ${aText}\nB: ${bText}\nReturn strict JSON with numeric scores (0–10) per factor and overall (0–1): {"A": {"argument_strength": number, "factual_accuracy": number, "direct_response": number, "coherence": number, "persuasiveness": number, "fallacies": number, "rebuttal_efficiency": number, "final_position": number}, "B": {"argument_strength": number, "factual_accuracy": number, "direct_response": number, "coherence": number, "persuasiveness": number, "fallacies": number, "rebuttal_efficiency": number, "final_position": number}, "overall": {"a": number, "b": number}}`
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
        const w = {
          argument_strength: 0.34,
          factual_accuracy: 0.25,
          direct_response: 0.18,
          rebuttal_efficiency: 0.12,
          persuasiveness: 0.07,
          final_position: 0.10
        }
        const faA = typeof Ax.fallacies === 'number' ? Ax.fallacies : 10
        const faB = typeof Bx.fallacies === 'number' ? Bx.fallacies : 10
        const fallacyPenaltyA = (10 - faA) / 10 * 0.06
        const fallacyPenaltyB = (10 - faB) / 10 * 0.06
        const sumA = (to01(Ax.argument_strength) * w.argument_strength)
          + (to01(Ax.factual_accuracy) * w.factual_accuracy)
          + (to01(Ax.direct_response) * w.direct_response)
          + (to01(Ax.rebuttal_efficiency) * w.rebuttal_efficiency)
          + (to01(Ax.persuasiveness) * w.persuasiveness)
          + (to01(Ax.final_position) * w.final_position)
        const sumB = (to01(Bx.argument_strength) * w.argument_strength)
          + (to01(Bx.factual_accuracy) * w.factual_accuracy)
          + (to01(Bx.direct_response) * w.direct_response)
          + (to01(Bx.rebuttal_efficiency) * w.rebuttal_efficiency)
          + (to01(Bx.persuasiveness) * w.persuasiveness)
          + (to01(Bx.final_position) * w.final_position)
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
  const aArr = scores.map(s => s.agentAScore).slice().sort((x, y) => x - y)
  const bArr = scores.map(s => s.agentBScore).slice().sort((x, y) => x - y)
  function trimmedMean(arr: number[]) {
    if (arr.length >= 4) {
      const trimmed = arr.slice(1, arr.length - 1)
      return trimmed.reduce((s, v) => s + v, 0) / trimmed.length
    }
    return arr.reduce((s, v) => s + v, 0) / arr.length
  }
  const a = trimmedMean(aArr)
  const b = trimmedMean(bArr)
  return { a, b }
}

export async function judgeConclusion(topic: string, aText: string, bText: string, avgA: number, avgB: number) {
  const system = 'You are a strict debate judge. Provide a concise, neutral conclusion focusing on the comparative result of arguments, not numeric scores.'
  const prompt = `Topic: ${topic}\nSummarize in 2-4 sentences which side prevailed and why, based strictly on: argument strength, factual accuracy, direct response quality, coherence & structure, persuasiveness, logical fallacies (if any), rebuttal efficiency, and final position strength. Avoid mentioning numbers or scores. Consider A:\n${aText}\nConsider B:\n${bText}`
  const out = await generateText(system, prompt)
  return (out || '').trim()
}
