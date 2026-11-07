import {Link,NavLink} from 'react-router-dom'
import {Eye,LogIn,Compass,LayoutGrid,MessagesSquare} from 'lucide-react'
const items=[
  {to:'/showroom',label:'Showroom',icon:Compass},
  {to:'/bento',label:'Bento Feed',icon:LayoutGrid},
  {to:'/vibes',label:'Hits & Vibes',icon:MessagesSquare},
]
export default function GuestLayout({children}){
  return <div className="min-h-screen bg-[#F7F3EB] text-black">
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#F7F3EB]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-black" aria-label="ChombuTar landing page">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-full object-cover"/>
          <span>ChombuTar</span>
        </Link>
        <nav aria-label="Guest discovery" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-2 sm:ml-4 sm:w-auto">
          {items.map(({to,label,icon:Icon})=><NavLink key={to} to={to}
            className={({isActive})=>'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold '+(isActive?'bg-black text-white':'hover:bg-black/5')}>
            <Icon size={15}/>{label}
          </NavLink>)}
        </nav>
        <Link to="/auth?mode=signup" className="order-2 ml-auto inline-flex min-h-10 items-center gap-2 rounded-full bg-[#E8B447] px-4 text-[12px] font-black sm:order-3">
          <LogIn size={16}/>Sign Up / Log In
        </Link>
      </div>
    </header>
    <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pt-3 text-[11px] text-black/55 sm:px-6">
      <Eye size={15}/> Browsing as guest — no Orbit, Discovery credit or engagement actions are recorded.
    </div>
    <main className="mx-auto w-full max-w-7xl px-4 pb-14 pt-5 sm:px-6">{children}</main>
  </div>
}
