import {Search} from 'lucide-react'
import {forwardRef} from 'react'

// Shared search input for BentoField and Showroom: one recognisable shape,
// accessible label and keyboard behavior. No extra floating search icon.
const DiscoverySearch=forwardRef(function DiscoverySearch({
  value,onChange,placeholder='Search Hats and creators…',label='Search Hats and creators',
  id,className='',onClear,
},ref){
  return <div className={`relative min-w-0 ${className}`}>
    <Search aria-hidden="true" size={15}
      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/45"/>
    <input ref={ref} id={id} type="search" aria-label={label} value={value}
      onChange={event=>onChange(event.target.value)} placeholder={placeholder}
      className="h-10 w-full min-w-0 rounded-full border-[1.5px] border-black bg-white pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-4 focus:ring-black/[0.06]"
      onKeyDown={event=>{if(event.key==='Escape'&&value){onChange('');onClear?.()}}}/>
  </div>
})
export default DiscoverySearch
