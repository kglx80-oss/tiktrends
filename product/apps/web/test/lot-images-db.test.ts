import { erreurStudio } from '@tiktrends/core';
import { describe, it, expect, vi, beforeAll,  } from 'vitest';

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, cleBudgetEssai } from '@tiktrends/db';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const T = new Date('2026-10-08T10:00:00Z');
const O = { veilleOuverte: true, maintenant: T };
let reponse: (a: AppelModele) => unknown = () => ({});
const texte = adaptateurSimule((a) => reponse(a));
const deps = { adaptateur: texte, environnement: 'test' as const, ...O };
let cat: Catalogue;

/* ── Le modèle simulé lie chaque référence reçue avec un rôle déclaré ── */
function repondreConsigne(instruction = 'Coureur portant les lunettes et le bandeau, piste au lever du jour, lumière rasante.') {
  reponse = (a) => {
    const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        generationInstruction: instruction, negativeConstraints: ['Pas de texte dans l’image'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
        referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'style', scope: 'background' })),
      },
    };
  };
}

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};

async function photo(projectId: string, n: number): Promise<string> {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[n - 1]!.assetId;
}

/** Projet de la marque A1 · brief L4-B, photo n°5 épinglée avec ses composants. */
async function projetEpingle() {
  const p = await projetStatique(db, ids, cat);
  const v = await courante(p.projectId);
  const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, productId: cat.produit.id, photoId: await photo(p.projectId, 5), composants: ['lunettes', 'bandeau'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p;
}

/** Compiler (attesté) puis retenir · la consigne est dans la version courante. */
async function consigneRetenue(projectId: string, instruction?: string) {
  repondreConsigne(instruction);
  const c = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId, mode: 'generative_scene' }, deps);
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const v = await courante(projectId);
  const r = await retenirConsignePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { compilation: c, version: r.version };
}

import { preparerLotImagesPour, approuverLotImagesPour, lireLotImagesPour, type VueLotImages } from '../lib/studios/image/lot-images';
beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'cle-factice-lot';
  await semer(db, schema, ids);cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());etat.session = session(ids, 'ua');
});
const ctx = () => ctxDe(ids, 'ua');
async function preparer(nombre = 3) {
  await db.update(schema.workspaces).set({ creditsBalance: 10000 }).where(eq(schema.workspaces.id, ids.wsA));
  const p = await projetEpingle();await consigneRetenue(p.projectId);
  const r = await preparerLotImagesPour(ctx(), { projectId:p.projectId,nombre,controleVision:false },base,T);
  if (!r.ok) throw new Error(JSON.stringify(r));return r.lot;
}
const confirmation = (lot:VueLotImages) => ({lotId:lot.id,empreinte:lot.empreinte,creditsAnnonces:lot.totalCredits,usdMicrosAnnonces:lot.totalUsdMicros,confirme:true});
const options = () => ({base,illimite:false,fournisseurImage:true,plafond:{capUsd:100,depenseUsd:0,bloque:false},maintenant:T});
async function quantites() {
  return Promise.all([schema.studioJobs,schema.studioApprovals,schema.studioOutbox,schema.studioBudgetLedger,schema.studioAuditEvents,schema.creditLedger].map(t=>db.select().from(t).then(r=>r.length)));
}
describe('Lot images · mêmes paramètres, transaction atomique', () => {
  it('prépare sans job, approuve tout une fois et relit sans relance', async () => {
    const avant = await db.select().from(schema.studioJobs);const lot = await preparer();
    expect(await db.select().from(schema.studioJobs)).toHaveLength(avant.length);
    expect(lot.totalCredits).toBe(lot.devis.reduce((s,q)=>s+q.maximumCredits,0));
    expect(new Set(lot.devis.map(q=>q.projectVersionId)).size).toBe(1);
    const r = await approuverLotImagesPour(ctx(),confirmation(lot),options());expect(r.ok,JSON.stringify(r)).toBe(true);if (!r.ok) return;
    expect(r.jobs).toHaveLength(3);const counts = await quantites();
    const again = await approuverLotImagesPour(ctx(),confirmation(lot),options());expect(again).toEqual({...r,deja:true});expect(await quantites()).toEqual(counts);
    const lu = await lireLotImagesPour(ctx(),lot.id,base);expect(lu.ok && lu.jobs).toEqual(r.jobs);
  });
  it('rollback réel des premières approbations/crédits/audit/outbox si la seconde est refusée',async()=>{
    const lot = await preparer();const avant = await quantites();
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id,ids.wsA));let n=0;
    const r = await approuverLotImagesPour(ctx(),confirmation(lot),{...options(),verifierDevis:async()=>++n===2 ? erreurStudio('UNSUPPORTED_CAPABILITY',{traceId:ctx().traceId}):null});
    expect(r.ok).toBe(false);expect(n).toBe(2);expect(await quantites()).toEqual(avant);
    const [apres] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id,ids.wsA));expect(apres!.creditsBalance).toBe(ws!.creditsBalance);
  });
  it('refuse total falsifié, budget cumulé, autre espace',async()=>{
    const lot = await preparer();const avant=await quantites();
    expect((await approuverLotImagesPour(ctx(),{...confirmation(lot),creditsAnnonces:0},options())).ok).toBe(false);
    const r=await approuverLotImagesPour(ctx(),confirmation(lot),{...options(),plafond:{capUsd:lot.totalUsdMicros/1e6-0.000001,depenseUsd:0,bloque:false}});
    expect(!r.ok && r.code).toBe('BUDGET_EXCEEDED');expect((await lireLotImagesPour(ctxDe(ids,'ub'),lot.id,base)).ok).toBe(false);
    expect((await approuverLotImagesPour(ctxDe(ids,'ub'),confirmation(lot),options())).ok).toBe(false);expect(await quantites()).toEqual(avant);
  });
  it('confirmations concurrentes retrouvent les mêmes jobs',async()=>{
    const lot=await preparer(2);const [a,b]=await Promise.all([approuverLotImagesPour(ctx(),confirmation(lot),options()),approuverLotImagesPour(ctx(),confirmation(lot),options())]);
    expect(a.ok,JSON.stringify(a)).toBe(true);expect(b.ok,JSON.stringify(b)).toBe(true);if(a.ok&&b.ok)expect(a.jobs.map(j=>j.id)).toEqual(b.jobs.map(j=>j.id));
  });
  it('garde résultats partiels et incertains sans nouvelle création',async()=>{
    const lot=await preparer(2);const r=await approuverLotImagesPour(ctx(),confirmation(lot),options());if(!r.ok)throw Error(r.code);
    await db.update(schema.studioJobs).set({state:'completed'}).where(eq(schema.studioJobs.id,r.jobs[0]!.id));
    await db.update(schema.studioJobs).set({state:'reconciliation_required'}).where(eq(schema.studioJobs.id,r.jobs[1]!.id));const counts=await quantites();
    const lu=await lireLotImagesPour(ctx(),lot.id,base);expect(lu.ok&&lu.jobs.map(j=>j.etat)).toEqual(['completed','reconciliation_required']);
    const replay=await approuverLotImagesPour(ctx(),confirmation(lot),options());expect(replay.ok&&replay.deja).toBe(true);expect(await quantites()).toEqual(counts);
  });
  it('deux lots concurrents ne peuvent pas réserver ensemble au-delà du restant',async()=>{
    const a=await preparer(2), b=await preparer(2);
    const ledger=await db.select().from(schema.studioBudgetLedger);
    const ouvert=ledger.reduce((s,l)=>s+(l.kind==='reserve'?Number(l.usdMicros):l.kind==='settle'||l.kind==='release'?-Number(l.usdMicros):0),0);
    const o={...options(),plafond:{capUsd:(ouvert+a.totalUsdMicros+1)/1e6,depenseUsd:0,bloque:false}};
    const rs=await Promise.all([approuverLotImagesPour(ctx(),confirmation(a),o),approuverLotImagesPour(ctx(),confirmation(b),o)]);
    expect(rs.filter(r=>r.ok)).toHaveLength(1);
    expect(rs.filter(r=>!r.ok).map(r=>!r.ok&&r.code)).toEqual(['BUDGET_EXCEEDED']);
  });
  it('refuse expiration et manque de crédits avec rollback complet',async()=>{
    const lot=await preparer(3);const avant=await quantites();
    const expire=await approuverLotImagesPour(ctx(),confirmation(lot),{...options(),maintenant:new Date(lot.expiresAt.getTime()+1)});
    expect(expire.ok).toBe(false);expect(await quantites()).toEqual(avant);
    await db.update(schema.workspaces).set({creditsBalance:lot.devis[0]!.maximumCredits}).where(eq(schema.workspaces.id,ids.wsA));
    const r=await approuverLotImagesPour(ctx(),confirmation(lot),options());expect(!r.ok&&r.code).toBe('BUDGET_EXCEEDED');expect(await quantites()).toEqual(avant);
    const [ws]=await db.select().from(schema.workspaces).where(eq(schema.workspaces.id,ids.wsA));expect(ws!.creditsBalance).toBe(lot.devis[0]!.maximumCredits);
  });
  it('refuse une marque retirée du contexte et une version modifiée',async()=>{
    const lot=await preparer();
    expect((await lireLotImagesPour({...ctx(),marques:[ids.brandA2],restrictionsMarque:[ids.brandA2]},lot.id,base)).ok).toBe(false);
    await consigneRetenue(lot.projectId,'Nouvelle lumière et nouvelle disposition du produit.');
    const avant=await quantites();const r=await approuverLotImagesPour(ctx(),confirmation(lot),options());
    expect(!r.ok&&r.code).toBe('VERSION_CONFLICT');expect(await quantites()).toEqual(avant);
  });

  it('budget essai : dépenses anciennes et réserves du même espace restent engagées',async()=>{
    const lot=await preparer(2);
    const ledger=await db.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.workspaceId,ids.wsA));
    const reserve=ledger.reduce((s,l)=>s+(l.kind==='reserve'?Number(l.usdMicros):l.kind==='settle'||l.kind==='release'?-Number(l.usdMicros):0),0)/1e6;
    await db.insert(schema.aiSpend).values({workspaceId:ids.wsA,provider:'fal',action:'test-budget-ancien',actualUsd:2,estimatedUsd:2,createdAt:new Date('2026-07-01'),reconcileReason:'transport interrompu'});
    const key=cleBudgetEssai(ids.wsA);
    await db.insert(schema.appSettings).values({key,value:{plafondUsd:reserve+lot.totalUsdMicros/1e6+1,depuis:'2026-01-01T00:00:00Z',motif:'essai total'}});
    const avant=await quantites();
    const r=await approuverLotImagesPour(ctx(),confirmation(lot),options());
    expect(!r.ok&&r.code).toBe('BUDGET_EXCEEDED');expect(await quantites()).toEqual(avant);
    // Même budget ne compte pas la dépense d'un autre espace.
    await db.update(schema.appSettings).set({value:{plafondUsd:reserve+lot.totalUsdMicros/1e6+2.01,depuis:'2026-01-01T00:00:00Z',motif:'essai total'}}).where(eq(schema.appSettings.key,key));
    await db.insert(schema.aiSpend).values({workspaceId:ids.wsB,provider:'fal',action:'autre-espace-ancien',actualUsd:500,createdAt:new Date('2026-07-01')});
    const accepte=await approuverLotImagesPour(ctx(),confirmation(lot),options());expect(accepte.ok,JSON.stringify(accepte)).toBe(true);
    await db.delete(schema.appSettings).where(eq(schema.appSettings.key,key));
  });

});
