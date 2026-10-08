import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CIBLE_TACTILE_MIN, calquesParZ } from '@tiktrends/core';
import { getSession } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../../lib/rbac';
import { gardeStudio } from '../../../../../../lib/studios/garde';
import { lireEditeurPour } from '../../../../../../lib/studios/editeur/lecture';
import { urlsApercu } from '../../../../../../lib/studios/editeur/apercus';
import { EditeurCalques } from '../../../../../../components/studios/editeur/EditeurCalques';
import { Icon } from '../../../../../../components/Icon';
import { cadrePage, h1, surface } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Éditeur de calques du document image d'un projet (lot L5-B).
 *
 * Lecture serveur sous `studio.read` (portée : espace + marques visibles) ;
 * l'écran édite sans génération et enregistre par `enregistrerDocument`
 * (`studio.propose`). Sans ce droit : lecture seule. Hors portée ou inconnu :
 * la même page neutre « introuvable » que la fiche projet.
 */
export default async function EditeurImagePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const g = await gardeStudio('studio.read');
  const r = g.ok ? await lireEditeurPour(g.ctx, id) : g;

  if (!r.ok) {
    const refuse = r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED';
    const plan = refuse && denyReason(effectiveAccess(s), feature) === 'plan';
    const etat = refuse ? 'acces-refuse' : r.code === 'NOT_FOUND' ? 'introuvable' : 'erreur';
    return (
      <main style={cadrePage}>
        <Link href={r.code === 'NOT_FOUND' || refuse ? '/studio/projets' : `/studio/projets/${encodeURIComponent(id)}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>
          ‹ {r.code === 'NOT_FOUND' || refuse ? 'Projets' : 'Projet'}
        </Link>
        <h1 style={h1}>{refuse ? 'Accès réservé' : r.code === 'NOT_FOUND' ? 'Projet introuvable' : 'Document indisponible'}</h1>
        <div data-etat={etat} style={{ marginTop: 18, padding: 24, ...surface, background: 'var(--surface)', display: 'grid', gap: 8, maxWidth: 640 }}>
          <div style={{ color: 'var(--muted)' }}><Icon name={refuse ? 'lock' : 'search'} size={28} /></div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
            {refuse
              ? (plan ? 'L’éditeur d’image du Studio est disponible à partir du plan Core.' : 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre.')
              : r.message}
          </p>
          {!refuse && r.code !== 'NOT_FOUND' && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Identifiant support : {r.traceId}</p>}
        </div>
      </main>
    );
  }

  const d = r.donnees;
  const ids = [
    ...d.medias.map((m) => m.assetId),
    ...(d.produit ? [d.produit.assetId] : []),
    ...(d.document ? calquesParZ(d.document).flatMap((c) => (c.kind === 'image' || c.kind === 'logo' ? [c.assetId] : [])) : []),
  ];
  return (
    <main style={cadrePage}>
      <EditeurCalques
        projet={d.projet}
        version={d.version}
        contenu={d.contenu}
        document={d.document}
        formatPropose={d.formatPropose}
        produit={d.produit}
        medias={d.medias}
        apercus={urlsApercu(ids)}
        peutEnregistrer={d.peutEnregistrer}
      />
    </main>
  );
}
