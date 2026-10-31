// ChombuTar's own Work Pass navigation mark: credential + orbital path +
// verified work check. Single-color SVG inherits the active nav color.
export default function WorkPassNavIcon({size=24,className=''}) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
    viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true">
    <rect x="5" y="7" width="22" height="18" rx="4"/>
    <path d="M9 12h7"/>
    <circle cx="15" cy="18" r="4.3" strokeWidth="1.5"/>
    <ellipse cx="15" cy="18" rx="9.5" ry="3.7" transform="rotate(-31 15 18)" strokeWidth="1.45"/>
    <path d="m21.2 21.1 1.9 1.9 4.1-4.3" strokeWidth="2.35"/>
    <path d="m22.7 4.4.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>
  </svg>
}
