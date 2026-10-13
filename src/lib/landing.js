// All authenticated Home visits resolve to Showroom, regardless of role,
// former landing preferences or active deals. Bento remains a separate route.
export const HOME_PATH = '/showroom'
export function decideLanding() {
  return HOME_PATH
}
