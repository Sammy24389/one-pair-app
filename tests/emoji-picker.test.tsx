import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import EmojiPicker from '../src/components/EmojiPicker'
import data from '../src/lib/emoji-data.json'

afterEach(cleanup)
it('bundles the full Unicode 17.0 qualified emoji repertoire without duplicate sequences', () => {
  expect(data.version).toBe('17.0')
  expect(data.entries).toHaveLength(3953)
  expect(new Set(data.entries.map(([emoji]) => emoji)).size).toBe(3953)
  expect(data.groups).toHaveLength(10)
  for (let category = 0; category < data.groups.length; category++) {
    expect(data.entries.some(([, , group]) => group === category)).toBe(true)
  }
  const names = data.entries.map(([, name]) => name)
  expect(names).toContain('flag: Nigeria')
  expect(names).toContain('woman technologist: dark skin tone')
  expect(names).toContain('family: man, woman, girl, boy')
  expect(names).toContain('flag: England')
})
it('searches across categories, preserves full ZWJ/skin-tone sequence and reports empty results', () => {
  const onEmoji = vi.fn()
  render(<EmojiPicker onEmoji={onEmoji} />)
  fireEvent.change(screen.getByLabelText('Search emoji'), {target: {value: 'woman technologist dark skin tone'}})
  fireEvent.click(screen.getByRole('button', {name: 'Send woman technologist: dark skin tone'}))
  expect(onEmoji).toHaveBeenCalledWith(String.fromCodePoint(0x1f469, 0x1f3ff, 0x200d, 0x1f4bb))
  fireEvent.change(screen.getByLabelText('Search emoji'), {target: {value: 'flag Nigeria'}})
  expect(screen.getByRole('button', {name: 'Send flag: Nigeria'})).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Search emoji'), {target: {value: 'nonexistentemojiname'}})
  expect(screen.getByRole('status').textContent).toContain('No emoji found')
})
it('offers category browsing and bounded incremental display of all emoji', () => {
  render(<EmojiPicker onEmoji={vi.fn()} />)
  fireEvent.click(screen.getByRole('tab', {name:'All emoji'}))
  expect(screen.getByRole('status').textContent).toBe('120 of 3953 emoji')
  fireEvent.click(screen.getByRole('button', {name: 'Show more emoji'}))
  expect(screen.getByRole('status').textContent).toBe('240 of 3953 emoji')
  fireEvent.click(screen.getByRole('tab', {name:data.groups[9]}))
  expect(screen.getByRole('button', {name: 'Send flag: Ascension Island'})).toBeTruthy()
  expect(screen.queryByRole('button', {name: 'Send grinning face'})).toBeNull()
})
it('disables sending during an in-flight message', () => {
  const send = vi.fn()
  render(<EmojiPicker onEmoji={send} disabled />)
  const button = screen.getByRole('button', {name: 'Send grinning face'}) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(send).not.toHaveBeenCalled()
})

it('uses direct category tabs with keyboard navigation and clears search on selection',()=>{
  render(<EmojiPicker onEmoji={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('Search emoji'),{target:{value:'heart'}})
  const first=screen.getByRole('tab',{name:'All emoji'})
  fireEvent.keyDown(first,{key:'End'})
  expect(document.activeElement).toBe(screen.getByRole('tab',{name:data.groups[9]}))
  expect((screen.getByLabelText('Search emoji') as HTMLInputElement).value).toBe('')
  expect(screen.queryByRole('combobox')).toBeNull()
})
