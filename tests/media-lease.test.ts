import {afterEach, expect, it} from 'vitest'
import {claimMedia, releaseMedia} from '../src/lib/media-lease'
const pair = {}, group = {}
afterEach(() => { releaseMedia(pair); releaseMedia(group) })
it('prevents a second caller from acquiring media until the owner ends', () => {
  expect(claimMedia(pair)).toBe(true)
  expect(claimMedia(group)).toBe(false)
  releaseMedia(group)
  expect(claimMedia(group)).toBe(false)
  releaseMedia(pair)
  expect(claimMedia(group)).toBe(true)
})
