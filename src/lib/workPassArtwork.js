// Story export mirrors the ChombuTar Work Pass branding using canvas.
// Only current profile facts are rendered. No synthetic awards or false verification.
import { workPassAccent } from '../../shared/workPass.js'
const BLUE='#0A13E6',CREAM='#F7F3EB',INK='#101735'
function round(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r)
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}
}
async function image(source){
  if(!source)return null
  return new Promise(resolve=>{
    const img=new Image()
    img.crossOrigin='anonymous'
    img.onload=()=>resolve(img)
    img.onerror=()=>resolve(null)
    img.src=source
  })
}
function cover(ctx,img,x,y,w,h){
  const scale=Math.max(w/img.width,h/img.height)
  const sw=w/scale,sh=h/scale
  ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h)
}
function textFit(ctx,value,maxWidth,maxSize,minSize=28){
  let font=maxSize
  while(font>minSize){ctx.font='900 '+font+'px system-ui,sans-serif';if(ctx.measureText(value).width<=maxWidth)break;font-=2}
  return font
}
export async function renderWorkPassStory({pass,qr,avatarUrl}){
  if(!pass?.user)throw Error('A Work Pass is required to create a story.')
  const canvas=document.createElement('canvas')
  canvas.width=1080;canvas.height=1920
  const ctx=canvas.getContext('2d')
  if(!ctx)throw Error('Image export is not supported in this browser.')
  const [logo,avatar,qrImg,...evidence]=await Promise.all([
    image('/logo.png'),image(avatarUrl),image(qr),
    ...(pass.evidence||[]).slice(0,3).map(item=>image(item.image_url)),
  ])
  ctx.fillStyle=CREAM;ctx.fillRect(0,0,1080,1920)
  // Card header in ChombuTar electric blue.
  const grad=ctx.createLinearGradient(90,70,990,1080)
  grad.addColorStop(0,'#071039');grad.addColorStop(.68,BLUE);grad.addColorStop(1,'#2737AE')
  round(ctx,58,72,964,1010,52,grad)
  ctx.save();ctx.beginPath();ctx.roundRect(58,72,964,1010,52);ctx.clip()
  ctx.strokeStyle='rgba(220,229,255,.26)'
  ctx.lineWidth=3
  for(let r of [210,320,435]){ctx.beginPath();ctx.ellipse(842,345,r,r*.58,-.43,0,Math.PI*2);ctx.stroke()}
  for(let i=0;i<13;i++){ctx.beginPath();ctx.moveTo(500+i*46,100);ctx.lineTo(920+i*8,995);ctx.strokeStyle='rgba(255,255,255,.035)';ctx.stroke()}
  ctx.restore()
  round(ctx,106,137,110,110,25,'#fff')
  if(logo)cover(ctx,logo,112,143,98,98)
  ctx.fillStyle='#fff';ctx.font='900 61px system-ui,sans-serif';ctx.fillText('ChombuTar',242,203)
  ctx.fillStyle='#CBD6FF';ctx.font='700 25px system-ui,sans-serif';ctx.fillText('WORK PASS  ·  REAL WORK',245,240)
  const accent=workPassAccent(pass.tier)
  // Actual account portrait, never a fabricated image.
  ctx.beginPath();ctx.arc(274,483,146,0,Math.PI*2);ctx.lineWidth=12;ctx.strokeStyle=accent;ctx.stroke()
  ctx.save();ctx.beginPath();ctx.arc(274,483,138,0,Math.PI*2);ctx.clip()
  ctx.fillStyle='#E1E6FF';ctx.fillRect(136,345,276,276)
  if(avatar)cover(ctx,avatar,136,345,276,276)
  else{ctx.fillStyle=BLUE;ctx.font='900 135px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText((pass.user.name||pass.user.username||'?')[0].toUpperCase(),274,531);ctx.textAlign='left'}
  ctx.restore()
  round(ctx,465,347,470,70,34,accent)
  ctx.fillStyle=INK;ctx.font='900 33px system-ui,sans-serif'
  ctx.fillText((pass.tier||'Bronze').toUpperCase()+' WORK PASS',495,392)
  const name=pass.user.name||pass.user.username||'ChombuTar member'
  textFit(ctx,name,535,66,36);ctx.fillStyle='#fff';ctx.fillText(name.slice(0,38),462,502)
  ctx.font='600 30px system-ui,sans-serif';ctx.fillStyle='#D9E2FF';ctx.fillText('@'+pass.user.username,466,550)
  ctx.font='700 29px system-ui,sans-serif';ctx.fillStyle='#fff'
  ctx.fillText((pass.user.headline||pass.user.role||'Professional').slice(0,36),466,610)
  round(ctx,111,770,858,125,27,'rgba(255,255,255,.13)','rgba(255,255,255,.19)')
  ctx.font='700 30px system-ui,sans-serif';ctx.fillStyle='#fff'
  ctx.fillText(pass.token?'●  Digitally signed by ChombuTar':'●  Unsigned profile preview',150,843)
  ctx.font='700 24px system-ui,sans-serif';ctx.fillStyle='#DCE4FF';ctx.fillText('WORK  ·  TRUST  ·  GROW',140,991)
  ctx.font='800 23px system-ui,sans-serif'
  ctx.fillText('TALENT ORBIT '+String(pass.roleOrbit?.talent?.score??0)+'/100',140,1048)
  ctx.fillText('CLIENT ORBIT '+String(pass.roleOrbit?.client?.score??0)+'/100',570,1048)
  // Metrics, labels and QR retain live platform data and true score units.
  round(ctx,58,1110,964,233,34,'#fff','#DCE0F0')
  const stats=[['ORBIT SCORE',String(Number(pass.orbit)||0)+'/100'],['COMPLETED JOBS',String(Number(pass.completedJobs)||0)],['SUCCESSFUL HIRES',String(Number(pass.successfulHires)||0)]]
  for(let i=0;i<stats.length;i++){
    const x=97+i*310
    if(i){ctx.fillStyle='#E1E4F0';ctx.fillRect(x-16,1146,2,162)}
    ctx.fillStyle='#727A93';ctx.font='800 22px system-ui,sans-serif';ctx.fillText(stats[i][0],x,1182)
    ctx.fillStyle=BLUE;ctx.font='900 62px system-ui,sans-serif';ctx.fillText(stats[i][1],x,1268)
  }
  round(ctx,58,1370,964,274,34,'#EEF1FF','#DDE3FC')
  ctx.fillStyle=INK;ctx.font='900 38px system-ui,sans-serif'
  ctx.fillText(pass.token?'SIGNED WORK PASS':'WORK PASS PREVIEW',90,1445)
  ctx.fillStyle='#5D6480';ctx.font='600 24px system-ui,sans-serif'
  ctx.fillText(pass.token?'Scan to verify the ChombuTar signature':'Signing has not been activated',92,1492)
  if(qrImg){round(ctx,750,1390,238,238,18,'#fff');ctx.drawImage(qrImg,760,1400,218,218)}
  else{ctx.strokeStyle='#BAC4ED';ctx.strokeRect(770,1410,200,200)}
  ctx.fillStyle=INK;ctx.font='900 31px system-ui,sans-serif';ctx.fillText('CUSTOMER-APPROVED WORK',65,1708)
  if(evidence.some(Boolean)){
    for(let i=0;i<evidence.length;i++){
      const x=62+i*327
      round(ctx,x,1734,305,130,19,'#E5E9F4')
      if(evidence[i]){ctx.save();ctx.beginPath();ctx.roundRect(x,1734,305,130,19);ctx.clip();cover(ctx,evidence[i],x,1734,305,130);ctx.restore()}
    }
  }else{
    ctx.font='500 25px system-ui,sans-serif';ctx.fillStyle='#677189';ctx.fillText('Approved work will appear here after completed jobs.',65,1765)
  }
  ctx.font='500 21px system-ui,sans-serif';ctx.fillStyle='#677189'
  ctx.fillText('Past work records do not guarantee future performance.',65,1893)
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not export Work Pass image.')),'image/png'))
}
