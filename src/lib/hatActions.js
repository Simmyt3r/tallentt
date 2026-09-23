// Path: src/lib/hatActions.js
import { api } from './api'

// Final booking action shared by Feed, Showroom and direct Hat surfaces.
// Discovery/detail modals stay in place until this function is called.
export async function bookHat(hat, navigate, proposal = null) {
  try {
    const { escrow } = await api.createEscrow({
      hat_id: hat.id,
      ...(proposal ? { proposed_amount: proposal.amount, proposal_message: proposal.message || '' } : {}),
    })
    navigate('/deals?role=client&tab=outgoing', { state: { bookingId: escrow.id } })
    return { escrow }
  } catch (e) {
    alert(e.message)
    return null
  }
}

// Final application action shared by every client-hat surface.
export async function submitApplication(hat, onHatChange, navigate, proposal = null) {
  try {
    const { application, already_applied } = await api.applyToHat(hat.id, proposal?.message || null, proposal)
    onHatChange?.({ id: hat.id, my_application: application })
    alert(
      already_applied
        ? `You already applied for “${hat.hat_title}”.`
        : `Application sent for “${hat.hat_title}”.`,
    )
    navigate?.('/deals?role=talent&tab=outgoing', { state: { applicationId: application?.id || null } })
    return { application, already_applied }
  } catch (e) {
    alert(e.message)
    return null
  }
}
