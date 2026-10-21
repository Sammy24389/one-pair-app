// One microphone/camera call at a time, including pending permission prompts.
let owner: object | null = null
export const claimMedia = (candidate: object) => {
  if (owner && owner !== candidate) return false
  owner = candidate
  return true
}
export const releaseMedia = (candidate: object) => {
  if (owner === candidate) owner = null
}
