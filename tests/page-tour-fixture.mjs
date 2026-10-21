// Existing browser suites test booking/chat/feed behavior with returning-user
// fixtures. Keep the onboarding modal out of their way; page-tour-ui.mjs
// separately tests first-visit dialogs and every persistence decision.
export async function optOutPageToursForFixture(context){
  await context.addInitScript(()=>{
    const userIds=[
      'owner',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '66666666-6666-4666-8666-666666666666',
      'f7b95df5-824d-47fd-af0f-19e466481132',
    ]
    for(const id of userIds)
      localStorage.setItem('chombutar:page-tour:v1:'+id,JSON.stringify({disabled:true,seen:[]}))
  })
}
