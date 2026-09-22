import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('final Book and Apply actions land on their canonical dashboards', async () => {
  const actions = await read('src/lib/hatActions.js')
  assert.match(actions, /navigate\('\/my-bookings'/)
  assert.match(actions, /navigate\?\.\('\/my-applications'/)
  assert.doesNotMatch(actions, /navigate\(`\/messages\?escrow=/)
})

test('Feed passes navigation into the shared application action', async () => {
  const feed = await read('src/pages/Feed.jsx')
  assert.match(feed, /submitApplication\(hat, handleHatChange, navigate\)/)
})

test('Showroom keeps its detail flow but final booking uses the shared booking action', async () => {
  const showroom = await read('src/components/ShowroomDetailModal.jsx')
  assert.match(showroom, /import \{ bookHat \} from '\.\.\/lib\/hatActions'/)
  assert.match(showroom, /await bookHat\(fresh, navigate\)/)
  assert.match(showroom, /await bookHat\(target, navigate\)/)
  assert.doesNotMatch(showroom, /navigate\(`\/talent\//)
})

test('direct hat and profile surfaces use the same dashboard handoff', async () => {
  const [hatPage, profile] = await Promise.all([
    read('src/pages/HatPage.jsx'),
    read('src/pages/TalentProfile.jsx'),
  ])
  assert.match(hatPage, /submitApplication\(h, handleHatChange, navigate\)/)
  assert.match(profile, /await bookHat\(hat, navigate\)/)
  assert.match(profile, /submitApplication\(/)
  assert.doesNotMatch(profile, /navigate\(`\/messages\?escrow=/)
})
