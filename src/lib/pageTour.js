// One short, optional explanation per major ChombuTar screen.
// Kept outside page components so deep links, tabs and layout changes share
// the same first-visit behavior. No tutorials on payment dialogs or modals.
export const PAGE_TOURS = Object.freeze([
  {
    id:'showroom', pattern:/^\/showroom(?:\/|$)/,
    title:'Welcome to Showroom',
    description:'Discover talents, clients and their media posts. Search for a creator, browse their work, and open a Hat to explore a booking or application.',
    hint:'Start with a post that interests you.',
  },
  {
    id:'bento',pattern:/^\/bento(?:\/|$)/,
    title:'This is Bento Field',
    description:'Browse professional BentoCards showing who people are, what they offer and their Orbit activity scores. Open a Hat to view details, book or apply.',
    hint:'Use Search or filters to find the right match.',
  },
  {
    id:'vibes',pattern:/^\/vibes(?:\/|$)/,
    title:'Welcome to Hits & Vibes',
    description:'Share a thought, photo or video and engage with other subscribers. Media is safety-screened, and suspicious posts may need review.',
    hint:'Write something or add media to publish a Hit.',
  },
  {
    id:'my-hats',pattern:/^\/my-hats(?:\/|$)/,
    title:'Manage your Hats',
    description:'Your Hats are the services, skills or opportunities you put on ChombuTar. Update their details, price, availability and how they appear to others.',
    hint:'Create or edit a Hat here.',
  },
  {
    id:'create',pattern:/^\/create(?:\/|$)/,
    title:'Create a Hat',
    description:'Describe your offer or opportunity, choose its category, add media, and set pricing and availability. Clear details help the right people find you.',
    hint:'Review your details before publishing.',
  },
  {
    id:'deals',pattern:/^\/deals(?:\/|$)/,
    title:'All your deals in one place',
    description:'See incoming requests, applications and active bookings. Deal progress and payments stay connected to each booking.',
    hint:'Open a deal to review its status and next action.',
  },
  {
    id:'negotiations',pattern:/^\/negotiations(?:\/|$)/,
    title:'Negotiation Center',
    description:'Review offers, counteroffers and agreements before a deal is funded. Price decisions belong here, not in general chat.',
    hint:'Look under Action needed for offers awaiting you.',
  },
  {
    id:'wallet',pattern:/^\/wallet(?:\/|$)/,
    title:'Your ChombuTar Wallet',
    description:'View your balance and transaction history, add money and request a withdrawal. Accepted bookings are funded from the wallet into escrow.',
    hint:'Always confirm amounts before approving a payment.',
  },
  {
    id:'community-chat',pattern:/^\/chats(?:\/|$)/,
    title:'General Chat',
    description:'Connect with other subscribers in community conversations. These chats are separate from booking negotiations and escrow payments.',
    hint:'Search for someone and send an introduction.',
  },
  {
    id:'deal-chat',pattern:/^\/messages(?:\/|$)/,
    title:'Deals Chat',
    description:'Talk about an accepted booking in its linked conversation. Use the deal pages for funding, delivery, disputes and payment checkpoints.',
    hint:'Select a deal conversation to continue.',
  },
  {
    id:'notifications',pattern:/^\/notifications(?:\/|$)/,
    title:'Your notifications',
    description:'Find updates about bookings, applications, payments and account activity. Open an alert to act on it, or use Search to find an older update.',
    hint:'You can adjust device alerts in Settings.',
  },
  {
    id:'live',pattern:/^\/live(?:\/|$)/,
    title:'Live on ChombuTar',
    description:'Watch live performances and interact with creators. Eligible Talent accounts can start a broadcast when Live media infrastructure is available.',
    hint:'Explore live rooms or check your broadcast setup.',
  },
  {
    id:'profile',pattern:/^\/profile\/?$/,
    title:'Your professional profile',
    description:'Show visitors who you are through your bio, portfolio, Hats and reviews. Keep your information current so clients know what you do.',
    hint:'Edit your profile to make it more complete.',
  },
  {
    id:'settings',pattern:/^\/settings(?:\/|$)/,
    title:'Your account settings',
    description:'Manage privacy, notifications, security and data-saving preferences. You can also restart these page explanations here.',
    hint:'Settings are saved separately from your active deals.',
  },
  {
    id:'disputes',pattern:/^\/disputes(?:\/|$)/,
    title:'Deal disputes',
    description:'Follow problems reported on bookings and see their review status. Keep evidence inside the relevant deal so a dispute can be examined properly.',
    hint:'Open a case to review what happened.',
  },
  {
    id:'admin',pattern:/^\/admin(?:\/|$)/,adminOnly:true,
    title:'ChombuTar administration',
    description:'Review users, content reports, deals, financial records and operational settings. Customer escrow and wallet liabilities are not platform profit.',
    hint:'Use the relevant section before taking an action.',
  },
])

const PREFIX='chombutar:page-tour:v1:'
const memory=new Map()
export function pageTourKey(userId){
  return typeof userId==='string' && userId.trim() ? PREFIX+userId.trim() : null
}
const empty=()=>({disabled:false,seen:[]})
const safeStorage=()=>{
  try {return typeof window!=='undefined'?window.localStorage:null}
  catch {return null}
}
export function readPageTourState(userId,storage=safeStorage()){
  const key=pageTourKey(userId)
  if(!key)return empty()
  try{
    const data=storage?.getItem(key)||memory.get(key)
    if(!data)return empty()
    const parsed=JSON.parse(data)
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return empty()
    return {
      disabled:parsed.disabled===true,
      seen:Array.isArray(parsed.seen)
        ? [...new Set(parsed.seen.filter(v=>typeof v==='string' && PAGE_TOURS.some(p=>p.id===v)))]
        :[],
    }
  }catch{return empty()}
}
function savePageTourState(userId,state,storage=safeStorage()){
  const key=pageTourKey(userId)
  if(!key)return
  const serialized=JSON.stringify(state)
  memory.set(key,serialized)
  try{storage?.setItem(key,serialized)}catch{/* In-session choice still works. */}
}
export function pageTourForPath(pathname,isAdmin=false){
  const path=typeof pathname==='string'?pathname:''
  return PAGE_TOURS.find(item=>(!item.adminOnly||isAdmin) && item.pattern.test(path))||null
}
export function shouldShowPageTour(userId,page,storage=safeStorage()){
  if(!userId||!page)return false
  const state=readPageTourState(userId,storage)
  return !state.disabled && !state.seen.includes(page.id)
}
export function acknowledgePageTour(userId,pageId,storage=safeStorage()){
  if(!PAGE_TOURS.some(item=>item.id===pageId))return
  const state=readPageTourState(userId,storage)
  savePageTourState(userId,{...state,seen:[...new Set([...state.seen,pageId])]},storage)
}
export function stopAllPageTours(userId,storage=safeStorage()){
  const state=readPageTourState(userId,storage)
  savePageTourState(userId,{...state,disabled:true},storage)
}
export function restartPageTours(userId,storage=safeStorage()){
  savePageTourState(userId,empty(),storage)
}
