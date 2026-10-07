"""Offline artifact checks. Covers only JSON Schema keywords used in this pack.
Not a replacement for the application's standard JSON Schema validator or semantic tests.
"""
from pathlib import Path
import json,re,csv,hashlib
B=Path(__file__).resolve().parent.parent
schema=json.loads((B/'03-CONTRATS.schema.json').read_text());pack=json.loads((B/'02-PROMPTS.json').read_text());examples=json.loads((B/'08-EXEMPLES-CONTRATS.json').read_text());bench=json.loads((B/'09-BENCHMARK.json').read_text())
def valid(sc,v):
 if '$ref'in sc:return valid(schema['$defs'][sc['$ref'].split('/')[-1]],v)
 if 'const'in sc and v!=sc['const']:return False
 if 'enum'in sc and v not in sc['enum']:return False
 typ=sc.get('type'); types=[typ]if isinstance(typ,str)else typ
 def ist(t):return {'object':isinstance(v,dict),'array':isinstance(v,list),'string':isinstance(v,str),'null':v is None,'boolean':isinstance(v,bool),'integer':isinstance(v,int)and not isinstance(v,bool),'number':isinstance(v,(int,float))and not isinstance(v,bool)}[t]
 if types and not any(ist(t)for t in types):return False
 if 'anyOf'in sc and not any(valid(q,v)for q in sc['anyOf']):return False
 if 'allOf'in sc and not all(valid(q,v)for q in sc['allOf']):return False
 if 'if'in sc and valid(sc['if'],v)and not valid(sc.get('then',{}),v):return False
 if isinstance(v,dict):
  if any(k not in v for k in sc.get('required',[])):return False
  ps=sc.get('properties',{})
  if sc.get('additionalProperties')is False and any(k not in ps for k in v):return False
  if any(not valid(ps[k],x)for k,x in v.items()if k in ps):return False
 if isinstance(v,list):
  if len(v)<sc.get('minItems',0)or len(v)>sc.get('maxItems',float('inf')):return False
  if 'items'in sc and not all(valid(sc['items'],x)for x in v):return False
 if isinstance(v,str):
  if len(v)<sc.get('minLength',0)or len(v)>sc.get('maxLength',float('inf')):return False
  if 'pattern'in sc and not re.search(sc['pattern'],v):return False
 if isinstance(v,(int,float))and not isinstance(v,bool):
  if v<sc.get('minimum',-float('inf'))or v>sc.get('maximum',float('inf')):return False
 return True
keys=[x['key']for x in pack['templates']];assert len(keys)==len(set(keys))==22
assert len(pack['styleRecipes'])==8
csvrows=list(csv.DictReader((B/'04-RECETTE.csv').open()));ids={x['id']for x in csvrows};assert len(ids)==len(csvrows)==92
fids={x['id']for x in bench['cases']};assert len(fids)==24
checks=[]
for t,c in zip(pack['templates'],examples['cases']):
 assert t['key']==c['templateKey']
 for r in ('inputSchemaRef','outputSchemaRef'):assert t[r].split('/')[-1]in schema['$defs']
 assert all(x in ids|fids for x in t['evaluationCaseIds'])
 assert any(x in fids for x in t['evaluationCaseIds'])
 expected=hashlib.sha256(json.dumps({k:v for k,v in t.items()if k!='contentHash'},sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest();assert expected==t['contentHash']
 ins=schema['$defs'][t['inputSchemaRef'].split('/')[-1]];outs=schema['$defs'][t['outputSchemaRef'].split('/')[-1]]
 for field,sc,should in [('inputExample',ins,True),('readyOutputShapeExample',outs,True),('blockedOutputExample',outs,True),('invalidOutputExample',outs,False),('invalidInputExample',ins,False)]:
  assert valid(sc,c[field])is should,(t['key'],field);checks.append(t['key']+':'+field)
 # bad ready-null must fail even though null is permitted for blocked.
 assert not valid(outs,{'status':'ready','questions':[],'warnings':[],'evidenceIds':[],'result':None});checks.append(t['key']+':ready-null-rejected')
assert hashlib.sha256(pack['commonSystemInstructions'].encode()).hexdigest()==pack['commonSystemHash']
report={'status':'passed','artifactChecks':len(checks),'templates':22,'styleRecipes':8,'acceptanceRequirements':92,'semanticBenchmarkCases':24,'scope':'Syntaxe JSON, références internes, unicité, hashes et exemples de forme avec vérificateur local des mots-clés utilisés. Aucun appel IA ni test produit. Pas certification complète JSON Schema draft2020-12 (formats/domaines à vérifier par validateur standard dans dépôt).','productAcceptance':'NON_EXECUTE','checks':checks}
(B/'VERIFICATION-DOSSIER.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='checks'},ensure_ascii=False,indent=2))
