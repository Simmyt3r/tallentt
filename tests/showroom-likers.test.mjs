import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,likers,people,hatId,showcaseId
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-showroom-gallery-2026-10.sql',import.meta.url),'utf8'))
  const owner=randomUUID(),other=randomUUID(),fan=randomUUID()
  people={owner,other,fan}
  for(const [id,name] of [[owner,'postowner'],[other,'outsider'],[fan,'postfan']]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash)
      VALUES($1,$2,$3,$4,'hash')`,[id,name,name.toUpperCase(),name+'@example.test'])
  }
  hatId=randomUUID()
  await pool.query(`INSERT INTO hats(id,user_id,username,hat_name,hat_title,category)
    VALUES($1,$2,'postowner','Video editor','Video editor','Video')`,[hatId,owner])
  await pool.query('INSERT INTO hat_likes(hat_id,user_id) VALUES($1,$2)',[hatId,fan])
  showcaseId=randomUUID()
  await pool.query(`INSERT INTO showroom_gallery_posts
    (id,author_id,public_id,media_url,media_type,caption,moderation_status)
    VALUES($1,$2,'asset-test','https://example.com/asset.jpg','image','A photo','visible')`,
    [showcaseId,owner])
  await pool.query('INSERT INTO showroom_gallery_likes(post_id,user_id) VALUES($1,$2)',[showcaseId,fan])
  likers=(await import('../api/_lib/showroomLikers.js')).getShowroomLikers
})
after(async()=>{await db?.close();delete global.__tworldPool})
test('only the post owner can identify who liked a Hat',async()=>{
  await assert.rejects(likers(null,{postId:hatId,kind:'hat'}),e=>e.status===401)
  await assert.rejects(likers(people.other,{postId:hatId,kind:'hat'}),e=>e.status===403)
  const result=await likers(people.owner,{postId:hatId,kind:'hat'})
  assert.equal(result.people.length,1)
  assert.equal(result.people[0].username,'postfan')
  assert.equal(result.people[0].name,'POSTFAN')
  assert.deepEqual(Object.keys(result.people[0]).sort(),['avatarUrl','likedAt','name','username'])
  assert.equal(result.nextPage,null)
})
test('gallery likers share the same owner-only privacy protection',async()=>{
  await assert.rejects(likers(people.other,{postId:showcaseId,kind:'gallery'}),e=>e.status===403)
  const result=await likers(people.owner,{postId:showcaseId,kind:'gallery'})
  assert.equal(result.people[0].username,'postfan')
  assert.equal(result.nextPage,null)
  await assert.rejects(likers(people.owner,{postId:hatId,kind:'gallery'}),e=>e.status===404)
})
test('invalid IDs, types and unbounded pagination are rejected',async()=>{
  for(const payload of [
    {postId:'not-a-uuid',kind:'hat'},
    {postId:hatId,kind:'admin'},
    {postId:hatId,kind:'hat',page:101},
    {postId:hatId,kind:'hat',page:-1},
  ])await assert.rejects(likers(people.owner,payload),e=>e.status===400)
})
test('an unlike immediately removes a subscriber from the owner list',async()=>{
  await pool.query('DELETE FROM hat_likes WHERE hat_id=$1 AND user_id=$2',[hatId,people.fan])
  assert.deepEqual((await likers(people.owner,{postId:hatId,kind:'hat'})).people,[])
})
