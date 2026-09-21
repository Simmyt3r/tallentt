// Path: src/lib/hatSeeking.js
//
// A Hat has two separate pieces of text:
//   hat_title — the name its owner chooses to give the Hat.
//   seeking   — what the Hat is for: the service a Talent is available for
//               ("Seeking"), or who a Client is looking for ("Hiring").
// Hats created before the two were separated only have hat_title (the
// database backfills `seeking` from it, but a record from an older response
// may not carry it), so it stands in until the owner edits the Hat.
export function hatSeeking(hat) {
  const seeking = typeof hat?.seeking === 'string' ? hat.seeking.trim() : ''
  if (seeking) return seeking
  return typeof hat?.hat_title === 'string' ? hat.hat_title.trim() : ''
}
