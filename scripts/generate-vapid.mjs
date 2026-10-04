import { createECDH } from 'node:crypto'

const ecdh = createECDH('prime256v1')
ecdh.generateKeys()

const publicKey = ecdh.getPublicKey().toString('base64url')
const privateKey = ecdh.getPrivateKey().toString('base64url')

console.log(JSON.stringify({
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  VAPID_SUBJECT: 'https://chombutar.vercel.app/',
}, null, 2))
