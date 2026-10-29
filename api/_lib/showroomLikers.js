// Owner-only Showroom likers. Usernames, display names and avatar URLs are
// public profile fields; email, phone, verification data and sessions stay private.
import { query } from './db.js'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const PAGE_SIZE=30
export async function getShowroomLikers(viewerId,{postId,kind,page=0}={}){
  if(!viewerId)throw bad(401,'Sign in to see who liked your post.')
  if(!UUID.test(String(postId||'')))throw bad(400,'Invalid Showroom post.')
  if(!['hat','gallery'].includes(kind))throw bad(400,'Invalid Showroom post type.')
  const offset=Number(page)
  if(!Number.isSafeInteger(offset)||offset<0||offset>100)throw bad(400,'Invalid page.')
  const isGallery=kind==='gallery'
  const ownerSql=isGallery
    ?'SELECT author_id AS owner_id FROM showroom_gallery_posts WHERE id=$1 AND deleted_at IS NULL'
    :'SELECT user_id AS owner_id FROM hats WHERE id=$1'
  const {rows:owners}=await query(ownerSql,[postId])
  if(!owners.length)throw bad(404,'Showroom post not found.')
  if(owners[0].owner_id!==viewerId)throw bad(403,'Only the post owner can view its likes.')
  const table=isGallery?'showroom_gallery_likes':'hat_likes'
  const idColumn=isGallery?'post_id':'hat_id'
  const {rows}=await query(`SELECT u.username,u.full_name,u.avatar_url,l.created_at
    FROM ${table} l JOIN users u ON u.id=l.user_id
    WHERE l.${idColumn}=$1
    ORDER BY l.created_at DESC,l.user_id DESC
    LIMIT $2 OFFSET $3`,[postId,PAGE_SIZE+1,offset*PAGE_SIZE])
  return {
    people:rows.slice(0,PAGE_SIZE).map(row=>({
      username:row.username,name:row.full_name,avatarUrl:row.avatar_url,likedAt:row.created_at,
    })),
    nextPage:rows.length>PAGE_SIZE?offset+1:null,
  }
}
