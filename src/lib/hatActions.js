// Path: src/lib/hatActions.js
import { api } from './api'

// Book a talent hat: create the escrow, then hand off to the existing
// messages/negotiation flow. Identical to what Feed.jsx did inline before
// — extracted so HatPage.jsx (the direct /hat/:hatId route) can trigger
// the exact same booking behavior without a second copy of this logic.
export async function bookHat(hat, navigate) {
  try {
    const { escrow } = await api.createEscrow({ hat_id: hat.id })
    navigate(`/messages?escrow=${escrow.id}`)
  } catch (e) {
    alert(e.message)
  }
}

// Apply to a client hat. `onHatChange`, if given, patches the caller's own
// hat state with the returned application (same as Feed.jsx's
// handleHatChange) so an "Applied" state shows immediately without a
// refetch. Named distinctly from api.applyToHat (the raw request) to keep
// the two easy to tell apart at a glance.
export async function submitApplication(hat, onHatChange) {
  try {
    const { application, already_applied } = await api.applyToHat(hat.id)
    onHatChange?.({ id: hat.id, my_application: application })
    alert(
      already_applied
        ? `You already applied for “${hat.hat_title}”.`
        : `Application sent for “${hat.hat_title}”.`,
    )
  } catch (e) {
    alert(e.message)
  }
}