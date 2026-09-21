// Path: src/components/UserIdentity.jsx
import { Link } from 'react-router-dom'
import { getPrimaryIdentity, getProfilePath, getSecondaryIdentity, resolveIdentity } from '../lib/profile.js'
import { Avatar } from './bentoCardShared'

// The one way a person is shown anywhere in the app:
//
//   [Avatar] Full Name            [Logo] Business Name Ltd.
//            ^username                   username
//
// Avatar, name and username are three separate links, and all three lead to
// the same place — `/profile/:username` (see getProfilePath in lib/profile.js).
// What is shown, and in which format, comes from the helpers in lib/profile.js;
// this file only lays it out.

// A link to a person's profile. It is meant to be dropped into surfaces that
// are themselves clickable (a BentoCard that opens its modal, a Showroom post,
// a conversation row), so it always stops the click from reaching them —
// otherwise opening someone's profile would also open the modal, start a View,
// or trigger whatever else the parent does. With no username there is nothing
// to link to, so it renders plain text instead of a dead link.
export function ProfileLink({ user, to, className, ariaLabel, children, ...rest }) {
  const path = to === undefined ? getProfilePath(user) : to
  if (!path) return <span className={className} {...rest}>{children}</span>
  return (
    <Link
      to={path}
      className={`pointer-events-auto ${className || ''}`}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </Link>
  )
}

const NAME_CLASS = 'font-bold text-[14px] leading-tight'
const USERNAME_CLASS = 'text-[12px] font-semibold text-black/55 leading-tight'

// `user` can be anything resolveIdentity understands: a user/profile object, a
// database-style row, or the result of identityFromRow / identityFromHat.
//
//   layout="stacked" (default)  avatar on the left, name over username
//   layout="inline"             one line — "Name ^username" — for dense rows
//
// `children` render under the username (a location line, badges, ...);
// `avatarBadge` sits on the avatar (e.g. an availability dot); `nameBadge` sits
// after the name (e.g. the verified tick). Neither is part of a link's text.
// `nameAs` lets a page keep its heading semantics (e.g. "h1" on a profile).
export default function UserIdentity({
  user,
  layout = 'stacked',
  showAvatar = true,
  align = 'center',
  gap = 'gap-2.5',
  avatarClassName = 'w-10 h-10',
  className = '',
  nameClassName = NAME_CLASS,
  usernameClassName = USERNAME_CLASS,
  avatarBadge = null,
  nameBadge = null,
  nameAs: NameTag = 'div',
  nameId,
  fallbackLabel = 'Unknown user',
  children = null,
}) {
  const identity = resolveIdentity(user)
  const primary = getPrimaryIdentity(identity)
  const secondary = getSecondaryIdentity(identity)
  const label = primary || fallbackLabel
  const avatarLabel = primary ? `View ${primary}'s profile` : undefined
  const avatarName = identity.fullName || identity.username || fallbackLabel

  const avatar = showAvatar ? (
    <ProfileLink
      user={identity}
      ariaLabel={avatarLabel}
      className="relative shrink-0 rounded-full"
      data-identity="avatar"
    >
      <Avatar src={identity.avatarUrl} name={avatarName} className={avatarClassName} />
      {avatarBadge}
    </ProfileLink>
  ) : null

  if (layout === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 min-w-0 max-w-full align-middle ${className}`}>
        {avatar}
        <span className="min-w-0 truncate">
          <ProfileLink user={identity} id={nameId} className={`hover:underline ${nameClassName}`} data-identity="name">
            {label}
          </ProfileLink>
          {nameBadge}
          {secondary && (
            <>
              {' '}
              <ProfileLink user={identity} className={`hover:underline ${usernameClassName}`} data-identity="username">
                {secondary}
              </ProfileLink>
            </>
          )}
        </span>
      </span>
    )
  }

  return (
    <div className={`flex ${align === 'start' ? 'items-start' : 'items-center'} ${gap} min-w-0 ${className}`}>
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 min-w-0">
          <NameTag id={nameId} className={`min-w-0 truncate ${nameClassName}`}>
            <ProfileLink user={identity} className="hover:underline" data-identity="name">
              {label}
            </ProfileLink>
          </NameTag>
          {nameBadge}
        </div>
        {secondary && (
          <div className={`min-w-0 truncate ${usernameClassName}`}>
            <ProfileLink user={identity} className="hover:underline" data-identity="username">
              {secondary}
            </ProfileLink>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
