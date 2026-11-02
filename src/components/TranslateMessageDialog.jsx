import {useState} from 'react'
import {Languages,X} from 'lucide-react'

const languages=[['en','English'],['ha','Hausa'],['yo','Yoruba'],['ig','Igbo'],
  ['fr','French'],['ar','Arabic'],['es','Spanish'],['zh-CN','Chinese (Simplified)']]
export default function TranslateMessageDialog({body,onClose}){
  const [language,setLanguage]=useState('en')
  const [error,setError]=useState('')
  const text=String(body||'').trim()
  const params=new URLSearchParams({sl:'auto',tl:language,text,op:'translate'})
  function translate(event){
    if(!text){event.preventDefault();setError('This message has no text to translate.');return}
    if(!window.confirm('This sends the selected message text to Google Translate outside ChombuTar. Continue?')){
      event.preventDefault()
      return
    }
    // Native link navigation with noopener avoids popup blockers and never
    // shares the message with the translation provider before user consent.
    setTimeout(onClose,0)
  }
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Translate this message"
      onClick={event=>event.stopPropagation()}
      className="w-full max-w-[380px] space-y-4 rounded-3xl bg-white p-5 shadow-xl">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-black"><Languages size={18}/> Translate message</h2>
        <button type="button" onClick={onClose} aria-label="Close translation" className="grid h-11 w-11 place-items-center rounded-full"><X size={18}/></button>
      </header>
      <p className="text-xs text-black/65">Choose a language. Translation opens in Google Translate; the message is only shared externally with your confirmation.</p>
      <label className="block text-xs font-bold">Translate to
        <select value={language} onChange={e=>setLanguage(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-black/20 bg-white px-3 text-sm">
          {languages.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {error&&<p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
      <a href={'https://translate.google.com/?'+params.toString()} target="_blank" rel="noopener noreferrer"
        onClick={translate} className="flex min-h-11 w-full items-center justify-center rounded-full bg-[#0A13E6] px-4 text-sm font-bold text-white">
        Open translation
      </a>
    </section>
  </div>
}
