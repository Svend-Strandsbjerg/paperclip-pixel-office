import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGithubReader, GITHUB_TTL_MS, candidates, derive, loadDeliveries, prIdentity } from '../server/pipeline'
import { demoDeliveries, STAGES } from '../src/pipeline'
import { parseDeliveries } from '../src/pipeline-view'
const ids = { orchestrator:'o', developer:'d', 'browser-qa':'q', reviewer:'r' }
const A = 'a'.repeat(40), B = 'b'.repeat(40)
const pr = { repository:'owner/repo', number:1, url:'https://github.com/owner/repo/pull/1', head:A, branch:'feature', base:'main', state:'open' as const }
const date = (n: number) => new Date(1700000000000 + n*1000).toISOString()
const parent = { id:'p', identifier:'DEV-1', title:'Delivery', status:'blocked', assigneeAgentId:'o', projectId:'project' }
const child = (role: typeof STAGES[number], n: number, status = 'done') => ({ id:role+n, identifier:`DEV-${n+2}`, title:role, status, assigneeAgentId:ids[role], projectId:'project', parentId:'p', createdAt:date(n), completedAt:date(n+1) })
const children = [child('developer',0),child('browser-qa',2),child('reviewer',4)]
const products = (list = children) => new Map(list.map(i => [i.id,[{ issueId:i.id, type:'pull_request', provider:'github', url:pr.url, metadata:{delivery:{sha:A,outcome:'passed'}} }]]))
const result = (list = children, head = pr) => derive({parent,children:list},ids,products(list),head)
test('normal sequential progression through all gates to human readiness', () => {
  for (let i=0;i<3;i++) {
    const list = children.slice(0,i+1).map((c,j) => ({...c,status:j===i?'in_progress':'done'}))
    const d = result(list)
    assert.equal(d.gates[i].state,'active')
    assert.ok(d.gates.slice(0,i).every(g=>g.state==='valid'))
    assert.equal(d.merge,'waiting')
    list[i].status='done'
    assert.equal(result(list).gates[i].state,'valid')
  }
  assert.equal(result().merge,'ready')
})
test('new GitHub head invalidates all historical evidence without hiding exact SHAs', () => {
  const d = result(children,{...pr,head:B})
  assert.ok(d.gates.every(g=>g.state==='invalidated'&&g.sha===A))
  assert.equal(d.merge,'waiting')
})
test('new developer rework cycle invalidates old QA and reviewer, then can progress', () => {
  const first = children.slice(0,2)
  const rework = child('developer',6,'in_progress')
  let d = result([...first,rework])
  assert.equal(d.gates[0].state,'rework');assert.equal(d.gates[1].state,'invalidated');assert.equal(d.merge,'waiting')
  d = result([...first,{...rework,status:'done'},child('browser-qa',8),child('reviewer',10)])
  assert.equal(d.merge,'ready')
})
test('missing, shortened, conflicting evidence and text verdicts cannot qualify gates', () => {
  for (const sha of [undefined,'aaaaaaa', B]) {
    const p = products(); p.get(children[1].id)![0].metadata.delivery.sha = sha as string
    const d = derive({parent,children},ids,p,pr)
    assert.notEqual(d.gates[1].state,'valid');assert.equal(d.merge,'waiting')
  }
  const p = products();p.get(children[2].id)![0].metadata.delivery.outcome='REQUEST CHANGES'
  assert.equal(derive({parent,children},ids,p,pr).merge,'waiting')
  p.get(children[2].id)![0].metadata = undefined as never
  assert.equal(derive({parent,children},ids,p,pr).gates[2].state,'unknown')
})
test('ambiguous order and missing timestamps fail closed', () => {
  for (const list of [
    [...children, {...children[0], id:'duplicate'}],
    children.map((c,i)=>i===1?{...c,createdAt:date(1)}:c),
    children.map((c,i)=>i===0?{...c,createdAt:undefined}:c),
  ]) assert.equal(result(list).merge,'waiting')
})
test('selection isolates direct same-project specialists and includes multiple active parents', () => {
  const other = {...parent,id:'other',identifier:'DEV-100'}
  const input = [parent,...children,other,{...children[0],id:'other-dev',parentId:'other'}, {...parent,id:'unrelated'}, {...children[0],id:'cross-project',projectId:'elsewhere'}, {...parent,id:'closed',status:'done'}]
  const selected = candidates(input,ids)
  assert.deepEqual(selected.map(c=>c.parent.identifier),['DEV-1','DEV-100'])
  assert.equal(selected[0].children.length,3)
})
test('narrow GET enrichment verifies PR identity and strips all private data', async () => {
  const p = products(); p.set('p',[])
  const calls: string[]=[]
  const fetcher: typeof fetch = async (url,options) => {
    calls.push(String(url));assert.equal(options?.method,'GET');assert.equal(options?.redirect,'error')
    return Response.json({number:1,html_url:pr.url,state:'open',merged:false,head:{sha:A,ref:'feature'},base:{ref:'main',repo:{full_name:'owner/repo'}},secret:'private'})
  }
  const read = async (path:string) => p.get(path.split('/')[3])
  const output = await loadDeliveries([parent,...children],ids,read,fetcher,'server-token')
  assert.equal(output[0].merge,'ready');assert.deepEqual(calls,['https://api.github.com/repos/owner/repo/pulls/1'])
  assert.ok(!JSON.stringify(output).includes('private'));assert.ok(!JSON.stringify(output).includes('server-token'))
  for (const bad of [async()=>{throw Error('private')},async()=>Response.json({}, {status:403}),async()=>Response.json({number:2})]) {
    const failed = await loadDeliveries([parent,...children],ids,read,bad)
    assert.equal(failed[0].merge,'waiting');assert.equal(failed[0].pr,undefined)
  }
  p.get(children[2].id)![0].url='https://github.com/owner/repo/pull/2'
  await loadDeliveries([parent,...children],ids,read,async()=>assert.fail('Conflicting identity must not fetch'))
})
test('unavailable products and malicious PR URLs fail closed', async () => {
  for (const url of ['http://github.com/a/b/pull/1','https://github.com.evil/a/b/pull/1','https://github.com/a/b/pull/1?token=x','https://github.com/a/../pull/1']) assert.equal(prIdentity(url),undefined)
  const d = await loadDeliveries([parent,...children],ids,async()=>{throw Error('private')},async()=>assert.fail('No identity'))
  assert.equal(d[0].merge,'waiting')
})
test('browser projection supports demo and rejects fabricated ready payloads', () => {
  assert.deepEqual(parseDeliveries(demoDeliveries),demoDeliveries)
  assert.equal(parseDeliveries([{...demoDeliveries[0],pr:undefined}]),null)
  assert.equal(parseDeliveries([{...demoDeliveries[0],gates:[]}]),null)
})

test('closed PR is never ready and merged status comes only from GitHub', () => {
  assert.equal(result(children,{...pr,state:'closed'} as never).merge,'waiting')
  assert.equal(result(children,{...pr,state:'merged'} as never).merge,'merged')
})
test('a malformed direct specialist cannot disappear and resurrect an older valid gate', () => {
  assert.throws(()=>candidates([parent,...children,{...child('developer',8),identifier:null}],ids))
})
test('conflicting stage SHAs and overlapping prior work cannot establish readiness', () => {
  const p=products();p.get(children[0].id)!.push({...p.get(children[0].id)![0],metadata:{delivery:{sha:B,outcome:'passed'}}})
  assert.equal(derive({parent,children},ids,p,pr).gates[0].state,'unknown')
  assert.equal(result([...children,{...child('developer',-2,'in_progress')}]).merge,'waiting')
})

const githubResponse = (head = A) => Response.json({number:1,html_url:pr.url,state:'open',merged:false,head:{sha:head,ref:'feature'},base:{ref:'main',repo:{full_name:pr.repository}}})
test('shared reader coalesces browsers and deliveries, canonicalizes identity, expires changed heads', async () => {
  let now = 0, calls = 0, head = A
  const fetcher: typeof fetch = async (_url, options) => { calls++; assert.equal(options?.method,'GET'); return githubResponse(head) }
  const github = createGithubReader(fetcher, undefined, () => now)
  const p = products(); p.set('p',[])
  const load = () => loadDeliveries([parent,...children],ids,async path=>p.get(path.split('/')[3]),fetcher,undefined,github)
  const output = await Promise.all([load(),load(),load()])
  assert.ok(output.every(d=>d[0].merge==='ready')); assert.equal(calls,1)
  await github({...pr, repository:'OWNER/REPO',url:pr.url.toUpperCase()})
  assert.equal(calls,1)
  head = B; now = GITHUB_TTL_MS - 1
  assert.equal((await load())[0].pr?.head,A)
  now++
  assert.ok((await load())[0].gates.every(g=>g.state==='invalidated'))
  assert.equal(calls,2)
})
test('anonymous aggregate budget stays below 60 reads/hour even across many identities', async () => {
  let now = 0, calls = 0
  const github = createGithubReader(async()=>{calls++;return githubResponse()},undefined,()=>now)
  for (;now<3_600_000;now+=1500) {
    await Promise.all(Array.from({length:10},(_,i)=>github({...pr,number:i+1})))
  }
  assert.ok(calls<=48, String(calls))
})
test('expired heads fail closed and retry/reset signals back off across PR identities', async () => {
  for (const headers of [{'retry-after':'600'}, {'retry-after':new Date(720_000).toUTCString()}, {'x-ratelimit-remaining':'0','x-ratelimit-reset':'720'}]) {
    let now = 0, calls = 0
    const github = createGithubReader(async()=>++calls===1?githubResponse():Response.json({}, {status:429,headers:headers as Record<string,string>}), 'token',()=>now)
    assert.equal((await github(pr))?.head,A)
    now = GITHUB_TTL_MS
    assert.equal(await github(pr),undefined)
    now = 719_999
    assert.equal(await github(pr),undefined)
    assert.equal(await github({...pr,number:2}),undefined)
    assert.equal(calls,2)
    now = 720_000; await github(pr); assert.equal(calls,3)
  }
})
test('network/invalid responses back off, recover, and bound hostile retry signals', async () => {
  let now=0, calls=0
  const github=createGithubReader(async()=>{
    calls++
    if(calls===1) throw Error('offline')
    if(calls===2) return Response.json({})
    if(calls===3) return Response.json({}, {status:403,headers:{'retry-after':'999999999'}})
    return githubResponse()
  },'token',()=>now)
  assert.equal(await github(pr),undefined)
  now=4999;await github(pr);assert.equal(calls,1)
  now=5000;assert.equal(await github(pr),undefined)
  now=14999;await github(pr);assert.equal(calls,2)
  now=15000;assert.equal(await github(pr),undefined)
  now+=3_600_000-1;await github(pr);assert.equal(calls,3)
  now++;assert.equal((await github(pr))?.head,A);assert.equal(calls,4)
})
