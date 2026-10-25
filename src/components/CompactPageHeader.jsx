import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DiscoverySearch from './DiscoverySearch.jsx'

/**
 * Shared compact page heading used across authenticated screens.
 * Lists can pass a controlled search to filter locally. Other screens get a
 * global discovery search that opens Showroom with the submitted query.
 */
export default function CompactPageHeader({
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  onSearchSubmit,
  icon: Icon,
  status,
  className = '',
}) {
  const navigate = useNavigate()
  const [globalSearch, setGlobalSearch] = useState('')
  const localSearch = typeof onSearchChange === 'function'
  const value = localSearch ? (searchValue ?? '') : globalSearch
  const change = localSearch ? onSearchChange : setGlobalSearch

  function submitSearch(term) {
    const query = String(term || '').trim()
    if (!query) return
    if (onSearchSubmit) {
      onSearchSubmit(query)
    } else if (!localSearch) {
      navigate(`/showroom?q=${encodeURIComponent(query)}`)
    }
  }

  return (
    <header className={`sticky top-[57.5px] md:top-16 z-30 isolate -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 h-[52px] flex items-center gap-3 border-b border-black/10 bg-[#F7F3EB]/95 backdrop-blur-lg ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon && <Icon size={18} aria-hidden="true" className="shrink-0" />}
        <h1 className="min-w-0 truncate text-[18px] sm:text-[21px] font-black tracking-tight">{title}</h1>
        {status}
      </div>
      <div className="ml-auto w-full min-w-0 max-w-[min(52vw,340px)]">
        <DiscoverySearch
          value={value}
          onChange={change}
          onSubmit={submitSearch}
          placeholder={searchPlaceholder || (localSearch ? `Search ${title}…` : 'Search ChombuTar…')}
          label={searchLabel || `Search ${title}`}
          className="w-full"
        />
      </div>
    </header>
  )
}
