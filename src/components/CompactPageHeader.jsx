import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DiscoverySearch from './DiscoverySearch.jsx'

/**
 * Shared page heading with the original flexible sticky-header styling.
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
  showSearch = true,
  inlineSearch = false,
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
    <header className={`sticky top-14 md:top-16 z-10 -mx-4 md:-mx-6 lg:-mx-8 mb-4 border-b border-black/10 bg-[#F7F3EB]/95 px-4 py-3 md:px-6 lg:px-8 backdrop-blur-lg ${className}`}>
      <div className={inlineSearch
        ? 'flex w-full min-w-0 flex-nowrap items-center justify-between gap-2'
        : 'flex w-full flex-wrap items-center justify-between gap-3'}>
        <div className={inlineSearch
          ? 'flex min-w-0 shrink-0 items-center gap-2'
          : 'flex min-w-fit shrink-0 items-center gap-2'}>
          {Icon && <Icon size={22} aria-hidden="true" className="shrink-0" />}
          <h1 className={inlineSearch
            ? 'whitespace-nowrap text-[13px] min-[360px]:text-[15px] sm:text-[21px] md:text-[23px] font-black tracking-tight'
            : 'min-w-0 text-[21px] sm:text-[23px] font-black tracking-tight'}>{title}</h1>
          {status}
        </div>
        {showSearch && <div className={inlineSearch
          ? 'ml-auto min-w-0 max-w-[340px] flex-[1_1_0%]'
          : 'ml-auto min-w-[11rem] max-w-[340px] flex-[1_1_14rem]'}>
          <DiscoverySearch
            value={value}
            onChange={change}
            onSubmit={submitSearch}
            placeholder={searchPlaceholder || (localSearch ? `Search ${title}…` : 'Search ChombuTar…')}
            label={searchLabel || `Search ${title}`}
            className="w-full"
          />
        </div>}
      </div>
    </header>
  )
}
