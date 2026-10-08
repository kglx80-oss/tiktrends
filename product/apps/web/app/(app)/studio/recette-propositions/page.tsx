import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ContenuVersion } from '@tiktrends/core';
import { gardeStudio } from '../../../../lib/studios/garde';
import { listerProjets } from '../../../../lib/studios/depot';
import { listerPropositions, projetEtCourante } from '../../../../lib/studios/propositions/depot-propositions';
import { disponibiliteJarvisServeur } from '../../../../lib/studios/propositions/dependances';
import { db } from '@tiktrends/db';
import { recetteOuverte } from './recette';
import { PanneauPropositions } from '../../../../components/studios/PanneauPropositions';
import { AccesRefuse } from '../../../../components/studios/propositions/EtatsPanneau';
import { cadrePage, h1, sub } from '../../../../components/ui';

export const dynamic = 'force-dynamic';

/**
 * RECETTE DE DÉVELOPPEMENT du panneau des propositions · ce n'est pas un écran
 * du produit. L'intégrateur monte `PanneauPropositions` dans la page projet ;
 * cette page sert seulement à le voir et à le capturer sur une base locale.
 *
 * Refus `notFound()` en production. Seule exception : la recette LOCALE
 * explicite du registre (`STUDIOS_PROMPTS_RECETTE_LOCALE=1` ET base sur
 * 127.0.0.1 / localhost · `environnementPrompts`), pour capturer le build de
 * production sur une base vide locale. La base de production est jointe par le
 * nom de service `db` : le drapeau n'y ouvre rien.
 */
export default async function RecettePropositions({ searchParams }: { searchParams: Promise<{ projet?: string }> }) {
  if (!recetteOuverte(process.env)) notFound();
  const sp = await searchParams;
  const g = await gardeStudio('studio.read');
  if (!g.ok) {
    return <div style={cadrePage}><h1 style={h1}>Recette · propositions</h1><div style={{ marginTop: 16 }}><AccesRefuse erreur={g} /></div></div>;
  }
  const projets = await listerProjets(g.ctx, { limite: 20 });
  const choisi = projets.find((p) => p.id === sp.projet) ?? projets[0] ?? null;
  const pc = choisi ? await projetEtCourante(db, g.ctx, choisi.id) : null;
  const initial = choisi ? await listerPropositions(g.ctx, { projectId: choisi.id }, { jarvis: await disponibiliteJarvisServeur(g.ctx) }) : null;

  return (
    <div style={cadrePage}>
      <h1 style={h1}>Recette · propositions</h1>
      <p style={{ ...sub, marginTop: 6 }}>Page de développement, absente en production · le panneau sera monté dans la page projet.</p>
      {projets.length === 0 && <p style={{ color: 'var(--muted)' }}>Aucun projet studio visible pour cette session.</p>}
      {projets.length > 1 && (
        <nav aria-label="Projets de recette" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {projets.map((p) => (
            <Link key={p.id} href={`/studio/recette-propositions?projet=${p.id}`} aria-current={p.id === choisi?.id ? 'page' : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '8px 14px', borderRadius: 999, border: `1px solid ${p.id === choisi?.id ? 'var(--accent-strong)' : 'var(--line-2)'}`, color: 'var(--ink)', textDecoration: 'none', fontSize: 14 }}>
              {p.title}
            </Link>
          ))}
        </nav>
      )}
      {choisi && pc?.ok && (
        <div style={{ maxWidth: 820 }}>
          <PanneauPropositions key={choisi.id} projectId={choisi.id} versionCourante={{ id: pc.courante.id, n: pc.courante.n }} initial={initial} />
          <p style={{ ...sub, marginTop: 12 }}>
            Projet « {choisi.title} » · {Object.keys((pc.courante.content as ContenuVersion).shots.byId).length} plan(s).
          </p>
        </div>
      )}
    </div>
  );
}
