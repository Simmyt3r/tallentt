import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {preview} from 'vite'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

const root=fileURLToPath(new URL('..',import.meta.url))
const port=5199
const mine='11111111-1111-4111-8111-111111111111'
const peer='22222222-2222-4222-8222-222222222222'
const associate='33333333-3333-4333-8333-333333333333'
const deal='44444444-4444-4444-8444-444444444444'
const employment='55555555-5555-4555-8555-555555555555'
const user={id:mine,username:'studio',fullName:'Studio User',role:'dual'}
const moment='2026-10-30T12:00:00Z'
let server,browser
try{
  await mkdir('test-results',{recursive:true})
  server=await preview({root,preview:{host:'127.0.0.1',port,strictPort:true}})
  browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'})
    await optOutPageToursForFixture(context)
    await context.addInitScript(()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,
        value:{writeText:async text=>{window.__copied=text}}})
    })
    const page=await context.newPage()
    const browserErrors=[]
    const sent=[]
    page.on('pageerror',e=>browserErrors.push(e.message))
    page.setDefaultTimeout(15000)
    const normal={peer_id:peer,peer_username:'alex',peer_name:'Alex User',peer_avatar:null,
      last_message:'Message with Alex',unread_count:1,last_at:moment}
    let messages=[
      {id:'66666666-6666-4666-8666-666666666666',sender_id:peer,body:'Can you review my design?',
        created_at:moment,read_at:null},
      {id:'77777777-7777-4777-8777-777777777777',sender_id:mine,body:'Sure, send it.',
        created_at:moment,read_at:moment},
    ]
    await page.route('**/api/**',route=>{
      const url=new URL(route.request().url())
      const respond=(payload,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)})
      if(url.pathname==='/api/auth')return respond({user})
      if(url.pathname==='/api/escrows'){
        if(route.request().method()==='POST'){
          const body=route.request().postDataJSON()
          sent.push(body)
          if(body.action==='community_send'){
            messages=[...messages,{id:'88888888-8888-4888-8888-888888888888',
              sender_id:mine,body:body.text,created_at:moment,read_at:null,
              reply_body:body.reply_to_id?'Can you review my design?':null}]
          }
          return respond({ok:true})
        }
        if(url.searchParams.has('community_thread'))
          return respond({thread:{id:associate,status:'accepted',initiator_id:mine,recipient_id:peer,
            peer_name:'Alex User',peer_username:'alex'},messages})
        if(url.searchParams.has('community'))return respond({threads:[{
          ...normal,id:associate,status:'accepted',initiator_id:mine,recipient_id:peer,
        }]})
        if(url.searchParams.has('employment'))return respond({available:true,threads:[{
          ...normal,id:employment,hat_title:'Designer',last_message:'Salary confirmed',
        }]})
        if(url.searchParams.has('conversations'))return respond({conversations:[{
          ...normal,id:deal,hat_title:'Logo design',peer_full_name:'Alex User',
          last_message:'When can you start?',created_at:moment,
        }],nextCursor:null})
        return respond({})
      }
      return respond({hats:[],notifications:[],items:[],count:0,threads:[]})
    })
    await page.goto('http://127.0.0.1:'+port+'/inbox')
    const aside=page.getByRole('complementary',{name:'Conversations'})
    await aside.getByRole('button',{name:/Alex User/}).waitFor()
    assert.equal(await aside.getByRole('button',{name:/Alex User/}).count(),1,
      'Alex should appear once even with three chat types')
    await aside.getByText('3 chats').waitFor()
    await aside.getByRole('button',{name:/Alex User/}).click()
    const contact=page.getByRole('region',{name:'Conversations with one person'})
    await contact.getByRole('button',{name:/Associate chat/}).waitFor()
    await contact.getByRole('button',{name:/Bento/}).waitFor()
    await contact.getByRole('button',{name:/Employment/}).waitFor()
    assert.equal(await contact.getByRole('button',{name:/Open chat/}).count(),3)
    await page.screenshot({path:'test-results/messages-consolidated-'+width+'.png',animations:'disabled'})
    await contact.getByRole('button',{name:/Associate chat/}).click()
    const history=page.getByRole('region',{name:'Message history'})
    await history.getByText('Can you review my design?').waitFor()
    const inbound=history.getByRole('article').first()
    await inbound.getByRole('button',{name:'Copy message'}).click()
    assert.equal(await page.evaluate(()=>window.__copied),'Can you review my design?')
    await inbound.getByRole('button',{name:'Translate message (coming soon)'}).click()
    await inbound.getByText('Translations are coming soon.').waitFor()
    await inbound.getByRole('button',{name:'Reply to Can you review my design?'}).click()
    await page.getByText('Replying to').waitFor()
    const own=history.getByRole('article').nth(1)
    await own.getByLabel('Read receipt: seen').waitFor()
    await inbound.getByRole('button',{name:'Forward message'}).click()
    const forward=page.getByRole('dialog',{name:'Forward message'})
    await forward.getByRole('radio').check()
    await forward.getByRole('button',{name:'Forward to selected chat'}).click()
    await forward.waitFor({state:'detached'})
    assert.ok(sent.some(x=>x.action==='community_send'&&x.text.includes('↪ Forwarded message')))
    await page.screenshot({path:'test-results/messages-actions-'+width+'.png',animations:'disabled'})
    assert.deepEqual(browserErrors,[])
    await context.close()
  }
  console.log('Inbox grouping, read receipts, copy, forward, reply and translate placeholder passed.')
}finally{
  await browser?.close()
  if(server)await new Promise(resolve=>server.httpServer.close(resolve))
}
