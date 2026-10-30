// Self-contained mobile/desktop navigation regression. Does not depend on
// Showroom Top 12 availability or live accounts.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { optOutPageToursForFixture } from './page-tour-fixture.mjs'

const root=fileURLToPath(new URL('..',import.meta.url))
const port=5197
const vite=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}})
let browser
const user={id:'11111111-1111-4111-8111-111111111111',username:'studio',
  fullName:'Studio Designer',name:'Studio Designer',role:'dual',avatarUrl:'/fixture-portrait.svg',
  isAdmin:false,skills:[],industry:[]}
const pass={user:{username:user.username,name:user.fullName,role:'dual',avatarUrl:user.avatarUrl,
  headline:'Designer and hiring manager',skills:[],industry:[]},
  tier:'Silver',orbit:70,roleOrbit:{talent:{score:60},client:{score:84}},
  completedJobs:5,successfulHires:9,paidTrackingMonths:{talent:3,client:5},
  signatureStatus:'signed',token:'CTWP1.navigation-test-signed-work-pass',
  evidence:[],robots:[],endorsements:[]}
const send=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
try {
  await mkdir('test-results',{recursive:true})
  await vite.listen()
  browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:850}})
    await optOutPageToursForFixture(context)
    const page=await context.newPage()
    const pageErrors=[]
    const networkErrors=[]
    page.on('pageerror',error=>pageErrors.push(error.message))
    page.on('console',msg=>{if(msg.type()==='error')networkErrors.push('console: '+msg.text())})
    page.on('requestfailed',req=>networkErrors.push('request: '+req.url()+' '+req.failure()?.errorText))
    page.on('response',response=>{if(response.status()>=400)networkErrors.push('http '+response.status()+' '+response.url())})
    page.setDefaultTimeout(20000)
    await page.route('**/fixture-portrait.svg',route=>route.fulfill({
      status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><rect width="280" height="280" fill="#0A13E6"/><circle cx="140" cy="135" r="76" fill="#F7F3EB"/></svg>',
    }))
    await page.route('**/api/**',route=>{
      const url=new URL(route.request().url())
      // Vite also serves real JS modules from api/_lib; never mock modules.
      if(url.pathname.endsWith('.js'))return route.continue()
      if(url.pathname==='/api/auth'){
        if(url.searchParams.get('action')==='work_pass')return send(route,pass)
        return send(route,{user})
      }
      if(url.pathname==='/api/users/studio')return send(route,{
        user,portfolio:[],hats:{talent:[],client:[]},
        isVerified:false,rating:0,ratedHatsCount:0,
        orbit:{score:70,factors:[],disclaimer:''},performance:null,
      })
      if(url.pathname==='/api/escrows')return send(route,{conversations:[],threads:[],nextCursor:null,counts:{}})
      if(url.pathname==='/api/hats')return send(route,{hats:[]})
      return send(route,{hats:[],items:[],notifications:[],count:0,threads:[],associates:[]})
    })
    await page.goto('http://127.0.0.1:'+port+'/profile')
    const trigger=page.getByRole('button',{name:'Open profile menu'})
    try { await trigger.waitFor() } catch (err) {
      console.error('Navigation fixture diagnostic',JSON.stringify({
        url:page.url(),body:(await page.locator('body').innerText()).slice(0,3000),
        html:(await page.locator('body').innerHTML()).slice(0,900),
        errors:pageErrors,networkErrors,
      }))
      await page.screenshot({path:'test-results/navigation-work-pass-'+width+'.png',fullPage:true})
      throw err
    }
    const workPassButton=page.getByRole('button',{name:'Open my Work Pass'})
    await workPassButton.waitFor()
    if(width===390){
      const bottom=page.getByRole('navigation',{name:'Primary'})
      assert.equal(await bottom.getByRole('button',{name:'Open my Work Pass'}).count(),1)
      assert.equal(await bottom.getByRole('link',{name:'Profile'}).count(),0,
        'Mobile bottom Profile tab should be replaced by Work Pass')
    }else{
      assert.equal(await page.locator('#desktop-sidebar').getByRole('button',{name:'Open my Work Pass'}).count(),1)
      assert.equal(await page.locator('#desktop-sidebar').getByRole('link',{name:'Profile'}).count(),0)
      assert.equal(await page.locator('#desktop-sidebar').getByRole('button',{name:'Log out'}).count(),0)
    }

    await trigger.click()
    const menu=page.getByRole('navigation',{name:'Profile and account'})
    await menu.getByRole('link',{name:'My profile'}).waitFor()
    await menu.getByRole('link',{name:'Edit profile'}).waitFor()
    await menu.getByRole('link',{name:'Membership & verification'}).waitFor()
    await menu.getByRole('link',{name:'Account settings'}).waitFor()
    await menu.getByRole('button',{name:'Sign out'}).waitFor()
    assert.equal(await menu.getByText('Work Pass').count(),0,'Work Pass should not duplicate the top profile menu')
    assert.equal(await trigger.getAttribute('aria-expanded'),'true')
    await page.keyboard.press('Escape')
    await menu.waitFor({state:'detached'})
    assert.equal(await trigger.getAttribute('aria-expanded'),'false')

    await trigger.click()
    await menu.getByRole('link',{name:'Edit profile'}).click()
    await page.getByRole('heading',{name:'Edit Profile'}).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('edit'),'1')
    await trigger.click()
    await menu.getByRole('link',{name:'My profile'}).click()
    await page.getByRole('heading',{name:'My Profile'}).waitFor()
    assert.equal(new URL(page.url()).searchParams.has('edit'),false)

    await workPassButton.click()
    const dialog=page.getByRole('dialog',{name:'ChombuTar Work Pass'})
    await dialog.getByRole('heading',{name:'Studio Designer'}).waitFor()
    await dialog.getByText('Talent Orbit',{exact:true}).waitFor()
    await dialog.getByText('Client Orbit',{exact:true}).waitFor()
    assert.equal(await page.getByRole('navigation',{name:'Profile and account'}).count(),0)
    await page.screenshot({path:'test-results/navigation-work-pass-'+width+'.png',animations:'disabled'})
    await dialog.getByRole('button',{name:'Close Work Pass'}).click()
    await dialog.waitFor({state:'detached'})

    if(width===390){
      await page.getByRole('button',{name:'Open menu'}).click()
      const drawer=page.getByRole('dialog',{name:'Navigation'})
      assert.equal(await drawer.getByRole('link',{name:'Profile'}).count(),0)
      assert.equal(await drawer.getByRole('button',{name:'Log out'}).count(),0)
      await drawer.getByRole('button',{name:'Close menu'}).click()
    }
    assert.deepEqual(pageErrors,[],'No browser errors during profile navigation')
    await context.close()
  }
  console.log('Navigation passed: mobile bottom Work Pass, desktop footer and top profile menu')
}finally{
  await browser?.close()
  await vite.close()
}
