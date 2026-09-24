import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('final Book and Apply actions land in the correct My Deals direction', async () => {
  const actions = await read('src/lib/hatActions.js')
  assert.match(actions, /navigate\('\/deals\?role=client&tab=outgoing'/)
  assert.match(actions, /navigate\?\.\('\/deals\?role=talent&tab=outgoing'/)
  assert.doesNotMatch(actions, /navigate\(`\/messages\?escrow=/)
})

test('Feed passes navigation into the shared application action', async () => {
  const feed = await read('src/pages/Feed.jsx')
  assert.match(feed, /submitApplication\(hat, handleHatChange, navigate, proposal\)/)
})

test('Showroom keeps its detail flow but final booking uses the shared booking action', async () => {
  const showroom = await read('src/components/ShowroomDetailModal.jsx')
  assert.match(showroom, /import \{ bookHat \} from '\.\.\/lib\/hatActions'/)
  assert.match(showroom, /await bookHat\(fresh, navigate\)/)
  assert.match(showroom, /await bookHat\(target, navigate, proposal\)/)
  assert.doesNotMatch(showroom, /navigate\(`\/talent\//)
})

test('direct hat and profile surfaces use the same dashboard handoff', async () => {
  const [hatPage, profile] = await Promise.all([
    read('src/pages/HatPage.jsx'),
    read('src/pages/TalentProfile.jsx'),
  ])
  assert.match(hatPage, /submitApplication\(h, handleHatChange, navigate, proposal\)/)
  assert.match(profile, /await bookHat\(hat, navigate\)/)
  assert.match(profile, /submitApplication\(/)
  assert.doesNotMatch(profile, /navigate\(`\/messages\?escrow=/)
})


test('Range negotiation flow mounts the proposal modal and advances through explicit steps', async () => {
  const detail = await read('src/components/BentoCardDetailModal.jsx')
  assert.match(detail, /const \[negotiationStep, setNegotiationStep\] = useState\(null\)/)
  assert.match(detail, /setNegotiationStep\('fee'\)/)
  assert.match(detail, /setNegotiationStep\('proposal'\)/)
  assert.match(detail, /<NegotiationProposalModal/)
  assert.match(detail, /open=\{negotiationStep === 'proposal'\}/)
  assert.match(detail, /onSubmit=\{handleProposalSubmit\}/)
})


test('Showroom Range negotiation uses the same fee-to-proposal handoff', async () => {
  const showroom = await read('src/components/ShowroomDetailModal.jsx')
  assert.match(showroom, /fresh\.price_type === 'range' \|\| Boolean\(fresh\.price_negotiable\)/)
  assert.match(showroom, /setNegotiationStep\('fee'\)/)
  assert.match(showroom, /setNegotiationStep\('proposal'\)/)
  assert.match(showroom, /<NegotiationFeeNotice/)
  assert.match(showroom, /<NegotiationProposalModal/)
  assert.match(showroom, /open=\{negotiationStep === 'proposal'\}/)
  assert.match(showroom, /await bookHat\(target, navigate, proposal\)/)
})


test('proposal modal stays mounted while the request is submitting', async () => {
  const [shared, detail, showroom] = await Promise.all([
    read('src/components/bentoCardShared.jsx'),
    read('src/components/BentoCardDetailModal.jsx'),
    read('src/components/ShowroomDetailModal.jsx'),
  ])
  assert.match(shared, /const \[submitting, setSubmitting\] = useState\(false\)/)
  assert.match(shared, /const result = await onSubmit\?\.\(/)
  assert.match(shared, /\{submitting \? 'Sending…' : actionLabel\}/)
  assert.match(detail, /const result = await runPrimaryAction\(proposal\)/)
  assert.match(detail, /if \(result\) setNegotiationStep\(null\)/)
  assert.match(showroom, /const result = await bookHat\(target, navigate, proposal\)/)
  assert.match(showroom, /if \(result\) setNegotiationStep\(null\)/)
})
