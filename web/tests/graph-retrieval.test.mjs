import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalContext } from '../server/canonical-context.mjs';
const nodes = [
  {id:'nebius',label:'Nebius',kind:'startup'},
  {id:'other',label:'Other company',kind:'startup'},
  {id:'unrelated',label:'Unrelated selection',kind:'startup'},
  {id:'investor',label:'Shared Backer',kind:'investor'},
  {id:'solo',label:'Only Nebius Backer',kind:'investor'},
  {id:'r1',label:'Nebius round',kind:'round',confidence:'high',source_url:'https://example.org/nebius'},
  {id:'r2',label:'Other round',kind:'round',confidence:'high',source_url:'https://example.org/other'},
  {id:'low',label:'Uncertain round',kind:'round',confidence:'low'},
];
const edges = [
  {source:'nebius',target:'r1',kind:'raised'},
  {source:'other',target:'r2',kind:'raised'},
  {source:'other',target:'low',kind:'raised'},
  {source:'investor',target:'r1',kind:'participated'},
  {source:'solo',target:'r1',kind:'participated'},
  {source:'investor',target:'r2',kind:'participated'},
  {source:'investor',target:'low',kind:'participated'},
];
const graph={nodes,edges};

test('named entity resolves outside the view and retrieves both sides of shared-investor paths',()=>{
 const result=canonicalContext(graph,{selected:{id:'unrelated'},question:'Who invests in Nebius and what other investments do they have?',neighborhood:{nodes:[]}});
 assert.equal(result.selected.id,'unrelated');
 assert.deepEqual(result.retrieval.matched_entities.map(n=>n.id),['nebius']);
 const path=result.paths.find(p=>p.company_id==='other');
 assert.deepEqual(path,{entity_id:'nebius',entity_round_id:'r1',investor_id:'investor',portfolio_round_id:'r2',company_id:'other'});
 assert.equal(result.nodes.find(n=>n.id==='r2').source_url,'https://example.org/other');
 assert(!result.paths.some(p=>p.portfolio_round_id==='low'));
 assert.equal(result.retrieval.investor_coverage.find(n=>n.investor_id==='solo').portfolio_companies_in_graph,1);
});
test('current-view scope does not expand named companies or reuse broader paths',()=>{
 const result=canonicalContext(graph,{scope:'visible',selected:{id:'nebius'},question:'Other investments of Nebius backers?',neighborhood:{nodes:[{id:'r1'}]}});
 assert.deepEqual(result.nodes.map(n=>n.id),['nebius','r1']);assert.deepEqual(result.paths,[]);
 assert.equal(result.retrieval.scope,'visible');
});
test('follow-ups resolve previous user entity and round selection resolves its company',()=>{
 const follow=canonicalContext(graph,{selected:{id:'unrelated'},question:'Which partnerships might fit?',messages:[{role:'user',content:'Who backs Nebius?'}]});
 assert(follow.paths.some(p=>p.company_id==='other'));
 const round=canonicalContext(graph,{selected:{id:'r1'},question:'What else have its backers invested in?'});
 assert.equal(round.retrieval.matched_entities[0].id,'nebius');
});
test('entity matching respects name boundaries and browser evidence cannot override retrieved sources',()=>{
 const result=canonicalContext(graph,{selected:{id:'unrelated'},question:'SuperNebiusCorp',neighborhood:{nodes:[{id:'r2',source_url:'https://forged.invalid'}]}});
 assert(!result.retrieval.matched_entities.some(n=>n.id==='nebius'));
 assert.equal(result.nodes.find(n=>n.id==='r2').source_url,'https://example.org/other');
});
test('bounded retrieval keeps complete paths and discloses truncation',()=>{
 const large=structuredClone(graph);
 for(let i=0;i<120;i++) {
  large.nodes.push({id:`c${i}`,label:`Company ${i}`,kind:'startup'},{id:`e${i}`,kind:'round',confidence:'high'});
  large.edges.push({source:`c${i}`,target:`e${i}`,kind:'raised'},{source:'investor',target:`e${i}`,kind:'participated'});
 }
 const result=canonicalContext(large,{selected:{id:'nebius'},question:'Nebius backers portfolios'});
 assert(result.retrieval.truncated);assert(result.paths.length<=80);assert(result.nodes.length<=240);
 const ids=new Set(result.nodes.map(n=>n.id));
 for(const p of result.paths) {
  for(const id of Object.values(p)) if(id)assert(ids.has(id));
  for(const [source,target] of [[p.entity_id,p.entity_round_id],[p.investor_id,p.entity_round_id],[p.investor_id,p.portfolio_round_id],[p.company_id,p.portfolio_round_id]])
   if(target)assert(result.edges.some(e=>e.source===source&&e.target===target));
 }
 assert(result.retrieval.investor_coverage.find(n=>n.investor_id==='solo').retrieved_paths>0);
});
