import { redirect } from 'next/navigation';
import { gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { LIBELLE_ACTION_CREDIT, VALEUR_ABSENTE, adminDollars, adminNombre, adminPourcent, type CreditAction } from '@tiktrends/core';
import { gardePlateforme } from '../../../../../lib/studios/prompts/garde-prompts';
import { Modeles } from '../../../../../spatial/vues/admin/Modeles';
import { bandeauSeul, chargerDepenseParFournisseur } from '../donnees';

export const dynamic = 'force-dynamic';

/** Les clés que les fournisseurs d'IA demandent sur le serveur · seule leur PRÉSENCE est lue, jamais leur valeur. */
const CLES: ReadonlyArray<{ nom: string; env: string }> = [
  { nom: 'Anthropic', env: 'ANTHROPIC_API_KEY' },
  { nom: 'fal', env: 'FAL_KEY' },
  { nom: 'Higgsfield', env: 'HIGGSFIELD_API_KEY' },
  { nom: 'Google', env: 'GOOGLE_API_KEY' },
];

/**
 * « Modèles IA connectés » · porte de `/admin/ia-studios` (V5) · la garde
 * plateforme `prompt.read` (accès total d'équipe), avant toute lecture. Le
 * registre de prompts V5 de cette adresse (versions, releases, évaluations)
 * reste ouvert dans l'ancienne interface · « Bibliothèque IA » y mène.
 */
export default async function ModelesSpatial() {
  const g = await gardePlateforme('prompt.read');
  if (!g.ok) redirect(g.code === 'AUTH_REQUIRED' ? '/login' : '/dashboard');
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - 30 * 86_400_000);
  const R = schema.studioPromptRuns;
  const [b, depense, runs] = await Promise.all([
    bandeauSeul(),
    chargerDepenseParFournisseur(maintenant),
    db ? db.select({
      modele: R.model, n: sql<number>`count(*)`, echecs: sql<number>`count(*) filter (where ${R.status} = 'failed')`,
      latence: sql<number | null>`percentile_cont(0.5) within group (order by ${R.latencyMs})`,
    }).from(R).where(gte(R.createdAt, depuis)).groupBy(R.model) : Promise.resolve([]),
  ]);
  const parModele = new Map(runs.map((r) => [r.modele, r]));
  const libellePoste = (a: string | null) => (a ? LIBELLE_ACTION_CREDIT[a as CreditAction] ?? a : null);

  return (
    <Modeles
      bandeau={b}
      legende="Modèles appelés sur 30 jours · coûts relevés par la barrière de dépense"
      modeles={[...depense.modeles].sort((a, b2) => b2.usd - a.usd).map((m) => {
        const r = parModele.get(m.modele);
        const n = Number(r?.n ?? 0);
        return {
          id: `${m.fournisseur}:${m.modele}`, fournisseur: m.fournisseur, nom: m.modele, actif: m.appels > 0,
          poste: libellePoste(m.poste) ? `Poste principal · ${libellePoste(m.poste)} · ${adminNombre(m.appels)} appels` : `${adminNombre(m.appels)} appels`,
          latence: r?.latence != null ? `${(Number(r.latence) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : VALEUR_ABSENTE,
          echecs: n > 0 ? adminPourcent((Number(r!.echecs) / n) * 100) : VALEUR_ABSENTE,
          cout: adminDollars(m.usd),
        };
      })}
      cles={CLES.map((c) => ({ nom: c.nom, etat: process.env[c.env] ? 'Définie sur le serveur' : 'Absente', detail: 'Rotation non suivie dans l’outil' }))}
    />
  );
}
