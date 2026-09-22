// Path: src/lib/hatActions.js
import { api } from './api'

// Final booking action shared by Feed, Showroom and direct Hat surfaces.
// Discovery/detail modals stay in place until this function is called.
// After the escrow exists, My Bookings becomes the canonical place to
// manage payment, status and the booking conversation.
export async function bookHat(hat, navigate) {
  try {
    const { escrow } = await api.createEscrow({ hat_id: hat.id })
    navigate('/my-bookings', { state: { bookingId: escrow.id } })
    return { escrow }
  } catch (e) {
    alert(e.message)
    return null
  }
}

// Final application action shared by every client-hat surface.
// Once the application exists, My Applications is the canonical place
// to track its status or withdraw it.
export async function submitApplication(hat, onHatChange, navigate) {
  try {
    const { application, already_applied } = await api.applyToHat(hat.id)
    onHatChange?.({ id: hat.id, my_application: application })
    alert(
      already_applied
        ? `You already applied for “${hat.hat_title}”.`
        : `Application sent for “${hat.hat_title}”.`,
    )
    navigate?.('/my-applications', { state: { applicationId: application?.id || null } })
    return { application, already_applied }
  } catch (e) {
    alert(e.message)
    return null
  }
}
