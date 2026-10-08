import Link from 'next/link';
import { notFound } from 'next/navigation';
import { erreurStudio } from '@tiktrends/core';
import { cadrePage, h1 } from '../../../../components/ui';
import { VariantesEtTests } from '../../../../components/studios/VariantesEtTests';
import type { EtatRecette } from '../../../../components/studios/variantes/PanneauVariantes';
import { gardeStudio } from '../../../../lib/studios/garde';
import { listerProjets } from '../../../../lib/studios/depot';
import { recetteAutorisee } from './autorisation';

export const dynamic = 'force-dynamic';

/**
 * Page de RECETTE locale de « Variantes et tests » (agent L4-C) · elle monte le
 * composant autonome pour les captures, en attendant la page projet (L4-B).
 * Refusée en production (`notFound`). Seule exception : la recette LOCALE d'un
 * build de production (`next start`, donc `NODE_ENV=production`) avec le
 * drapeau `STUDIOS_RECETTE_PAGES=1` ET une base locale (127.0.0.1, localhost,
 * ::1) · même règle que `environnementPrompts` ; la base de production est
 * jointe par son nom de service, le drapeau n'y vaut rien.
 * `?etat=` force un état d'affichage (formulaire ouvert, erreur avec saisies
 * conservées, hors ligne, conflit, quota).
 */

type SP = { projet?: string; etat?: string; variante?: string };

export default async function RecetteVariantes({ searchParams }: { searchParams: Promise<SP> }) {
  if (!recetteAutorisee(process.env)) notFound();
  const sp = await searchParams;
  const recette: EtatRecette = {};
  const trace = 'st_recette_locale';
  if (sp.etat === 'hors-ligne') recette.horsLigne = true;
  if ((sp.etat === 'formulaire' || sp.etat === 'erreur') && sp.variante) recette.formulaireOuvert = sp.variante;
  if (sp.etat === 'erreur' && sp.variante) {
    recette.erreurFormulaire = erreurStudio('INVALID_SCHEMA', { traceId: trace, violations: [
      { chemin: 'hypothese', raison: 'Écris l’hypothèse en une phrase (10 à 2 000 caractères) : quel effet, sur quelle métrique.' },
      { chemin: 'objectif', raison: 'Indique l’objectif du test (3 à 500 caractères).' },
    ] });
  }
  if (sp.etat === 'conflit') recette.message = { ton: 'warn', texte: 'Le projet a changé depuis l’ouverture de cette page · recharge-la, puis itère à nouveau. Rien n’a été écrasé.', traceId: trace };
  if (sp.etat === 'quota') recette.message = { ton: 'warn', texte: 'Le plafond de dépense est atteint · réduis la demande ou attends le prochain cycle.', traceId: trace };

  let projets: Array<{ id: string; title: string }> = [];
  if (!sp.projet) {
    const g = await gardeStudio('studio.read');
    if (g.ok) projets = (await listerProjets(g.ctx, { limite: 20 })).map((p) => ({ id: p.id, title: p.title }));
  }

  return (
    <main style={cadrePage}>
      <div style={{ marginBottom: 16, display: 'grid', gap: 6 }}>
        <h1 style={h1}>Recette locale</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Page de recette locale · absente en production. Le composant sera monté dans la page projet.</p>
      </div>
      {sp.projet ? <VariantesEtTests projectId={sp.projet} recette={recette} /> : (
        <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
          {projets.map((p) => <li key={p.id}><Link href={`?projet=${p.id}`} style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', color: 'var(--ink)' }}>{p.title}</Link></li>)}
          {projets.length === 0 && <li style={{ color: 'var(--ink-2)' }}>Aucun projet studio visible.</li>}
        </ul>
      )}
    </main>
  );
}
