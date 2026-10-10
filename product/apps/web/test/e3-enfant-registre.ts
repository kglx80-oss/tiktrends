/**
 * E3 · processus ENFANT des gardes multiprocessus du registre
 * (`e3-registre-verrou.test.ts`). Lancé par `child_process.fork` sous tsx,
 * il joue la séquence RÉELLE de `registre.ts` :
 *
 *  · `course` · attend le signal de départ commun, puis engage 0,80 $ (lu
 *    d'une base désignée), « appelle » un faux fournisseur, règle ; rend
 *    l'issue au parent ;
 *  · `tue-pglite` · base pglite (migrations réelles) propre au processus, une
 *    dépense déjà en base ; lecture, engagement, puis réservation de l'appel
 *    écrite en base et « appel » qui ne finit jamais · le parent le tue
 *    (SIGKILL) : la base meurt avec lui ;
 *  · `tue-pg` · idem contre la vraie base Postgres de `DATABASE_URL`, lue par
 *    `lireBase` (le parent la supprime puis la recrée ensuite).
 *
 * Aucun appel réseau, aucune clé, aucune dépense.
 */

import { cloreEssai, engagerEssai, lireBase, lireBaseDepuis, lireEtatEssai, type LectureBase } from '../scripts/recette/registre';
import { detentionsVerrouMs } from '../scripts/recette/verrou';

const [mode, dossier, ...reste] = process.argv.slice(2);
const envoyer = (m: Record<string, unknown>) => new Promise<void>((ok) => process.send!(m, () => ok()));
const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const jamais = () => new Promise<never>(() => { setInterval(() => {}, 1 << 30); });

async function course(): Promise<void> {
  const [base, pauseMs] = reste;
  const lu: LectureBase = JSON.parse(process.env.E3_LECTURE ?? '{"lignes":[],"depenseFenetreUsd":0}');
  lu.base = base!;
  lu.lignes = lu.lignes.map((l) => ({ ...l, createdAt: new Date(l.createdAt) }));
  await new Promise<void>((ok) => { process.on('message', (m) => { if (m === 'go') ok(); }); void envoyer({ pret: true }); });
  const r = await engagerEssai(dossier!, { commande: `course:${process.pid}`, reservationMicros: 800_000, lu, avantEcriture: () => dormir(Number(pauseMs)) });
  if (!r.ok) { await envoyer({ accepte: false, raison: r.raison, detentions: detentionsVerrouMs }); return; }
  await dormir(5); // le faux fournisseur
  const c = await cloreEssai(dossier!, r.engagement.id, { etat: 'regle', montantMicros: 800_000 }, { lecteur: null });
  await envoyer({ accepte: true, id: r.engagement.id, regle: c.ok && c.engagement.etat === 'regle', detentions: detentionsVerrouMs });
}

async function tue(pg: boolean): Promise<void> {
  const { schema } = await import('@tiktrends/db');
  let db: NonNullable<typeof import('@tiktrends/db')['db']>;
  if (pg) db = (await import('@tiktrends/db')).db!;
  else {
    const { pgMemoire } = await import('./helpers/pg-memoire');
    db = await pgMemoire(schema as unknown as Record<string, unknown>) as unknown as typeof db;
  }
  const lecteur = pg ? lireBase : () => lireBaseDepuis(db);
  // Une dépense déjà en base avant la commande (image au prix fixe).
  await db.insert(schema.aiSpend).values({ workspaceId: null, provider: 'fal', model: 'fal_image', action: 'studio.generation', estimatedUsd: 0.08, actualUsd: 0.08 });
  const e = await lireEtatEssai(dossier!, new Date(), lecteur);
  if (!e.ok) { await envoyer({ erreur: e.raison }); return; }
  const r = await engagerEssai(dossier!, { commande: 'recette:pas1', reservationMicros: 330_000, lu: e.lu });
  if (!r.ok) { await envoyer({ erreur: r.raison }); return; }
  // Le faux fournisseur · la barrière commune réserve la ligne AVANT l'appel, puis l'appel ne revient jamais.
  await db.insert(schema.aiSpend).values({ workspaceId: null, provider: 'anthropic', model: 'claude', action: 'studio.compile', estimatedUsd: 0.093, actualUsd: 0.093 });
  await envoyer({ enAppel: true, id: r.engagement.id });
  await jamais();
}

const principal = mode === 'course' ? course() : mode === 'tue-pglite' ? tue(false) : mode === 'tue-pg' ? tue(true) : Promise.reject(new Error(`mode inconnu ${mode}`));
principal.then(() => process.exit(0), async (e) => { await envoyer({ erreur: (e as Error).message }).catch(() => {}); process.exit(1); });
