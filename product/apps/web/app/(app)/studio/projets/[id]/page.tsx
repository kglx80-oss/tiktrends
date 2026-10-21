import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CIBLE_TACTILE_MIN, capacitesDuRefus } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { roleAtLeast } from '../../../../../lib/rbac';
import { lireProjetDetail } from '../../../../actions/studios/sources';
import { chatThreadAction } from '../../../../actions/jarvis-chat';
import { VueProjet } from '../../../../../components/studios/projet/VueProjet';
import { ParcoursProjet } from '../../../../../components/studios/projet/ParcoursProjet';
import { ConceptHote } from '../../../../../components/studios/projet/ConceptHote';
import { VariantesEtTests } from '../../../../../components/studios/VariantesEtTests';
import { TachesProjet } from '../../../../../components/studios/taches/TachesProjet';
import { CanvasProjet } from '../../../../../components/studios/canvas/CanvasProjet';
import { LigneeProjet } from '../../../../../components/studios/canvas/LigneeProjet';
import { Icon } from '../../../../../components/Icon';
import { CapaciteNonActive } from '../../../../../components/studios/CapaciteNonActive';
import { etatInterrupteurs } from '../../../../../lib/studios/interrupteurs';
import { liensAtelierProjet } from '../../../../../lib/navigation';
import { cadrePage, h1, surface } from '../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Un projet, tel que le serveur le garde (reprise durable, FLOW-05). LECTURE
 * seule : marque, version, brief, sources, hypothèse, produit, complétude,
 * historique, export. `?version=<id>` ouvre une version antérieure en lecture.
 *
 * Hors portée ou inconnu : la même page neutre « introuvable » (pas de
 * différence entre « n'existe pas » et « pas à toi »).
 */
export default async function ProjetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;
  const r = await lireProjetDetail({ projectId: id, ...(sp.version ? { versionId: sp.version } : {}) });

  if (!r.ok) {
    const coupees = capacitesDuRefus(r);
    if (coupees.length) return <main style={cadrePage}><CapaciteNonActive capacites={coupees} projectId={id} /></main>;
    const refuse = r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED';
    const plan = refuse && denyReason(effectiveAccess(s), feature) === 'plan';
    return (
      <main style={cadrePage}>
        <Link href="/studio/projets" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>‹ Projets</Link>
        <h1 style={h1}>{refuse ? 'Accès réservé' : r.code === 'NOT_FOUND' ? 'Projet introuvable' : 'Projet indisponible'}</h1>
        <div data-etat={refuse ? 'acces-refuse' : r.code === 'NOT_FOUND' ? 'introuvable' : 'erreur'} style={{ marginTop: 18, padding: 24, ...surface, background: 'var(--surface)', display: 'grid', gap: 8, maxWidth: 640 }}>
          <div style={{ color: 'var(--muted)' }}><Icon name={refuse ? 'lock' : 'search'} size={28} /></div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
            {refuse
              ? (plan ? 'Les projets du Studio sont disponibles à partir du plan Core.' : 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre.')
              : r.message}
          </p>
          {!refuse && r.code !== 'NOT_FOUND' && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Identifiant support : {r.traceId}</p>}
        </div>
      </main>
    );
  }

  // « Variantes et tests » (L4-C) relit sa propre garde et sa portée · rendu
  // ici, côté serveur, puis placé dans son emplacement de la vue.
  const variantes = await VariantesEtTests({ projectId: r.detail.projet.id });
  // Tâches du projet (Étape 6 V5) · lecture seule des états de job, dans la portée.
  const taches = await TachesProjet({ projectId: r.detail.projet.id });
  // Canvas métier (L8-D, UX-04) · lecture seule à la visite, sous la vue projet.
  const canvas = await CanvasProjet({ projectId: r.detail.projet.id, versionId: r.detail.version.id });
  // Canvas de LIGNÉE (V5, lot 4) · projection lecture seule, sous le canvas de production.
  const lignee = await LigneeProjet({ projectId: r.detail.projet.id });
  // F1 · l'atelier ne montre un lien que vers ce qui est actif pour l'espace ; le reste se dit « non activé ».
  const inter = await etatInterrupteurs(s.workspaceId);

  // Concept créatif VIVANT (V5) · le fil Jarvis LIÉ au concept, lu CÔTÉ SERVEUR
  // par `conversationDuProjet` (jamais par clé navigateur). LECTURE seule · la
  // visite n'écrit rien. Un refus (accès, marque) rend un fil absent, jamais une
  // panne de page · l'hôte s'affiche quand même avec la zone « créations ».
  const filConcept = await chatThreadAction({ projectId: r.detail.projet.id }).catch(() => ({ error: '' as string } as Awaited<ReturnType<typeof chatThreadAction>>));
  const courante = r.detail.versions.find((v) => v.courante) ?? null;
  const atelier = liensAtelierProjet(r.detail.projet.id, inter.actif);
  const exportAutorise = roleAtLeast(s.role, 'member');

  return (
    <main style={cadrePage}>
      <ParcoursProjet detail={r.detail} atelier={atelier} exportAutorise={exportAutorise} generationActive={inter.actif(r.detail.projet.kind === 'video' ? 'video' : 'generation_image')} />
      <div data-emplacement="taches" style={{ marginBottom: 18 }}>{taches}</div>
      <div id="conversation-projet" style={{ scrollMarginTop: 100 }} />
      <div data-emplacement="concept-hote" style={{ marginBottom: 18 }}>
        <ConceptHote
          projectId={r.detail.projet.id}
          brandName={r.detail.projet.marque}
          kind={r.detail.projet.kind}
          ancienneVersion={r.detail.version.id !== courante?.id}
          generationImageActive={inter.actif('generation_image')}
          versionCourante={courante ? { id: courante.id, n: courante.n } : null}
          initialThread={filConcept.thread ?? null}
          initialErreur={filConcept.error ?? null}
        />
      </div>
      <div data-emplacement="variantes" style={{ marginTop: 18 }}>{variantes}</div>
      <details style={{ ...surface, padding: 18, marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>Détails et outils du projet</summary>
        <VueProjet detail={r.detail} exportAutorise={exportAutorise} atelier={atelier} masquerPropositions masquerEntete />
      </details>
      {canvas && <details data-emplacement="canvas" style={{ ...surface, padding: 18, marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>Ouvrir le canvas</summary>
        {canvas}
      </details>}
      {lignee && <details data-emplacement="canvas-lignee" style={{ ...surface, padding: 18, marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>Origine des créations et variantes</summary>
        {lignee}
      </details>}
    </main>
  );
}
