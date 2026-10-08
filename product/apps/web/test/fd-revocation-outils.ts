import { RUBRIQUE_REFERENCE, ficheVierge } from '@tiktrends/core';
import { db, schema } from '@tiktrends/db';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { planEtDevis } from '../lib/studios/benchmark/programme';
import { acteurPlateforme } from './l2-outils';

/**
 * Outils des gardes de révocation F-D · une release `staged` évaluée
 * (tests structurels réussis) et une évaluation benchmark RÉELLE passée avec
 * fiches remplies, écrite directement (la chaîne complète qui la produit est
 * prouvée par `fd-evaluation-db`). Seul compte ici ce que le geste fait d'une
 * révocation.
 */
export async function releaseApprouvable(admin: string, motif: string): Promise<{ releaseId: string; evaluationId: string }> {
  const a = acteurPlateforme(admin);
  const imp = await depot.importerPack(a);
  if (!imp.ok) throw new Error('import');
  for (const l of await depot.listerVersions()) if (l.status === 'draft') await depot.validerVersion(a, { id: l.id });
  const base = (await depot.listerVersions()).filter((l) => l.key === 'jarvis.route' && l.status === 'validated').sort((x, y) => y.version - x.version)[0]!;
  const b = await depot.enregistrerBrouillon(a, { baseId: base.id, champs: { title: `Routage Jarvis · ${motif}` }, motif });
  if (!b.ok) throw new Error(JSON.stringify(b));
  if (!(await depot.validerVersion(a, { id: b.id })).ok) throw new Error('validation');
  const r = await depot.creerRelease(a, { motif });
  if (!r.ok || r.existante) throw new Error(JSON.stringify(r));
  if (!(await depot.evaluerRelease(a, { releaseId: r.id })).ok) throw new Error('évaluation');
  const pd = planEtDevis(null);
  if (!pd.ok) throw new Error('plans');
  const fiches = pd.plans.flatMap((p) => { const f = ficheVierge(p, RUBRIQUE_REFERENCE, 'reel'); return f ? [{ ...f, sorties: f.sorties.map((s) => ({ ...s, relecteur: 'Relectrice A', notes: Object.fromEntries(RUBRIQUE_REFERENCE.dimensions.map((d) => [d, 2])) as typeof s.notes })) }] : []; });
  const [ev] = await db.insert(schema.studioPromptEvaluations).values({
    releaseId: r.id, kind: 'benchmark', passed: true, evaluatorId: admin,
    result: { type: 'fiches_benchmark', mode: 'reel', releaseHash: r.releaseHash, empreinteRapport: 'garde-revocation', evaluationReelle: true, refus: [], verdict: { statut: 'CONFORME', approuvable: true, moyenne: 10 }, fiches },
  }).returning({ id: schema.studioPromptEvaluations.id });
  return { releaseId: r.id, evaluationId: ev!.id };
}
