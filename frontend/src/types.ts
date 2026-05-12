export type ScorecardData = {
  communication: number
  technical_depth: number
  problem_solving: number
  cultural_fit: number
  summary: string
  strengths: string[]
  red_flags: string[]
  transcript: { q: string; a: string; score: number | null }[]
}
