// A small image stored in source code for a connectivity test. No user media
// is transmitted to the provider during this diagnostic request.
// 128×128 neutral, synthetic RGB PNG.
const NEUTRAL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAyUlEQVR42u3RMQ0AAAgEsfcvj5kFJ8iAockpuKZ6dFgsAABAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAFwAAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAHxoAbR4yY5t16v8AAAAAElFTkSuQmCC'
import { effectiveScreeningConfig } from './showroomScreeningConfig.js'

export async function testVisionConnection({ fetchImpl = fetch } = {}) {
  const config = await effectiveScreeningConfig()
  if (!config.visionKey) throw Object.assign(new Error('Save a Google Cloud Vision API key first.'), {status:409})
  let response
  try {
    response = await fetchImpl('https://vision.googleapis.com/v1/images:annotate', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':config.visionKey},
      body:JSON.stringify({requests:[{image:{content:NEUTRAL_PNG},
        features:[{type:'SAFE_SEARCH_DETECTION'}]}]}),
      signal:AbortSignal.timeout(12000),
    })
  } catch {
    throw Object.assign(new Error('Could not contact Cloud Vision. Check connectivity and try again.'), {status:503})
  }
  // Deliberately do not return provider response bodies, which could include
  // account details or other remote diagnostics.
  if (!response.ok) throw Object.assign(
    new Error('Google Cloud Vision refused the test request. Check API key permissions, billing and quota.'),
    {status:503},
  )
  let body
  try {body=await response.json()} catch {body=null}
  if (!body?.responses?.[0]?.safeSearchAnnotation || body.responses[0].error) {
    throw Object.assign(new Error('Cloud Vision did not return the expected safety analysis.'), {status:503})
  }
  return {ok:true, provider:'Google Cloud Vision', validatedAt:new Date().toISOString()}
}
