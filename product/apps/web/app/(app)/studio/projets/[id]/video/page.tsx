import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CIBLE_TACTILE_MIN, capacitesDuRefus, coutMaximalTexte, decisionFournisseurStudio } from '@tiktrends/core';
import { getSession } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../../lib/rbac';
import { gardeStudio } from '../../../../../../lib/studios/garde';
import { lireVideoPour } from '../../../../../../lib/studios/video/lecture';
import { lirePointeur } from '../../../../../../lib/studios/prompts/depot-prompts';
import { modeleTexte } from '../../../../../../lib/studios/prompts/adaptateur';
import { spendStatus } from '../../../../../../lib/spend-guard';
import { EcranVideo } from '../../../../../../components/studios/video/EcranVideo';
import { CapaciteNonActive } from '../../../../../../components/studios/CapaciteNonActive';
import { Icon } from '../../../../../../components/Icon';
import { cadrePage, h1, surface } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Studio vidéo d'un projet (lot L6-A) · storyboard des plans, timeline,
 * impact de chaque geste avant tout devis, images clés et leurs devis, jobs.
 *
 * Lecture serveur sous `studio.read` (portée : espace + marques visibles),
 * sans aucune écriture ; les gestes passent par les actions de
 * `app/actions/studios/video.ts`. Hors portée ou inconnu : la même page
 * neutre « introuvable » que la fiche projet.
 */
export default async function StudioVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  // F1 · capacité « video », coupée par défaut (chaîne non validée en réel) · la page le dit.
  const g = await gardeStudio('studio.read', 'video');
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  const r = g.ok
    ? await lireVideoPour(g.ctx, id, {
      maintenant: new Date(), releasePubliee: pointeur !== null, fournisseurTexte: !!process.env.ANTHROPIC_API_KEY, plafondAtteint: plafond.blocked,
      fournisseurImage: decisionFournisseurStudio(process.env).ok, coutTexteUsd: coutMaximalTexte(modeleTexte()),
    })
    : g;

  if (!r.ok) {
    const coupees = capacitesDuRefus(r);
    if (coupees.length) return <main style={cadrePage}><CapaciteNonActive capacites={coupees} projectId={id} /></main>;
    const refuse = r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED';
    const plan = refuse && denyReason(effectiveAccess(s), feature) === 'plan';
    const etat = refuse ? 'acces-refuse' : r.code === 'NOT_FOUND' ? 'introuvable' : 'erreur';
    return (
      <main style={cadrePage}>
        <Link href={r.code === 'NOT_FOUND' || refuse ? '/studio/projets' : `/studio/projets/${encodeURIComponent(id)}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>
          ‹ {r.code === 'NOT_FOUND' || refuse ? 'Projets' : 'Projet'}
        </Link>
        <h1 style={h1}>{refuse ? 'Accès réservé' : r.code === 'NOT_FOUND' ? 'Projet introuvable' : 'Vidéo indisponible'}</h1>
        <div data-etat={etat} style={{ marginTop: 18, padding: 24, ...surface, background: 'var(--surface)', display: 'grid', gap: 8, maxWidth: 640 }}>
          <div style={{ color: 'var(--muted)' }}><Icon name={refuse ? 'lock' : 'search'} size={28} /></div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
            {refuse
              ? (plan ? 'Le studio vidéo est disponible à partir du plan Core.' : 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre.')
              : r.message}
          </p>
          {!refuse && r.code !== 'NOT_FOUND' && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Identifiant support : {r.traceId}</p>}
        </div>
      </main>
    );
  }

  return (
    <main style={cadrePage}>
      {/* L8-B · le retour nomme le projet (comme Produit, Textes, Identités) et fait 44 px de
          large au minimum (« ‹ Projet » mesurait 43 px) · le titre long du projet ne prend
          plus tout l'écran à 390 px : il est nommé une fois, dans le lien de retour. */}
      <Link href={`/studio/projets/${r.vue.projet.id}`} data-retour-projet style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, maxWidth: '100%', display: 'inline-flex', alignItems: 'center', overflowWrap: 'anywhere' }}>‹ {r.vue.projet.titre || 'Projet'}</Link>
      <h1 style={{ ...h1, marginBottom: 16, overflowWrap: 'anywhere' }}>Vidéo · storyboard et montage</h1>
      <EcranVideo vue={r.vue} />
    </main>
  );
}
