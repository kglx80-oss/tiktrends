import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CIBLE_TACTILE_MIN, capacitesDuRefus } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { roleAtLeast } from '../../../../../lib/rbac';
import { lireProjetDetail } from '../../../../actions/studios/sources';
import { VueProjet } from '../../../../../components/studios/projet/VueProjet';
import { VariantesEtTests } from '../../../../../components/studios/VariantesEtTests';
import { CanvasProjet } from '../../../../../components/studios/canvas/CanvasProjet';
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
  // Canvas métier (L8-D, UX-04) · lecture seule à la visite, sous la vue projet.
  const canvas = await CanvasProjet({ projectId: r.detail.projet.id, versionId: r.detail.version.id });
  // F1 · l'atelier ne montre un lien que vers ce qui est actif pour l'espace ; le reste se dit « non activé ».
  const inter = await etatInterrupteurs(s.workspaceId);
  return (
    <main style={cadrePage}>
      <VueProjet detail={r.detail} exportAutorise={roleAtLeast(s.role, 'member')} variantes={variantes} atelier={liensAtelierProjet(r.detail.projet.id, inter.actif)} />
      {canvas && <div data-emplacement="canvas" style={{ marginTop: 18 }}>{canvas}</div>}
    </main>
  );
}
