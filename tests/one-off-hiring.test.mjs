import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeHiringDuration} from '../api/_lib/hatFields.js'
import {emptyForm,buildPayload,validateForm} from '../src/lib/hatForm.js'

test('One-Off client Hats do not need a second, contradictory duration',()=>{
  assert.deepEqual(normalizeHiringDuration(null,'client',null,'One-Off'),{ok:true,value:null})
  const form=emptyForm({country:'Nigeria'})
  form.hatType='One-Off'
  form.hiringDuration=''
  const issues=validateForm(form,{role:'client',media:{ready:0,failed:0,uploading:0}})
  assert.equal(issues.hiringDuration,undefined)
  const fields=buildPayload(form,{role:'client',mode:'create'})
  assert.equal(fields.hat_type,'One-Off')
  assert.equal(fields.hiring_duration,null)
})
test('Contracts display both Hat type and real hiring duration',()=>{
  assert.deepEqual(normalizeHiringDuration('6 months','client',null,'Contract'),{ok:true,value:'6 months'})
  assert.equal(normalizeHiringDuration(null,'client',null,'Contract').ok,false)
  const form=emptyForm({country:'Nigeria'})
  form.hatType='Contract'
  form.hiringDuration='6 months'
  const fields=buildPayload(form,{role:'client',mode:'create'})
  assert.equal(fields.hat_type,'Contract')
  assert.equal(fields.hiring_duration,'6 months')
})
