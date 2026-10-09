import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CIBLE_TACTILE_MIN, capacitesDuRefus } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { effectiveAccess } from '../../../../lib/access';
import { FEATURES, denyReason } from '../../../../lib/rbac';
import { listerProjetsCartes } from '../../../actions/studios/sources';
import { CarteProjet } from '../../../../components/studios/projet/CarteProjet';
import { Icon } from '../../../../components/Icon';
import { CapaciteNonActive } from '../../../../components/studios/CapaciteNonActive';
import { cadrePage, h1, sub, surface, vide, btn } from '../../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Projets · reprendre là où on s'est arrêté (cahier 01 §4.1).
 *
 * Une carte par projet : marque, type, étape, ce qui manque, date. LECTURE
 * seule : la visite n'écrit rien, ne prépare rien, ne lance rien. La marque
 * active filtre la liste ; « Toutes les marques » l'élargit aux marques
 * visibles.
 *
 * États : premier usage (aucun projet), vide pour la marque active, rempli,
 * accès refusé, erreur récupérable (identifiant support). Le chargement est
 * `loading.tsx`.
 */
export default async function ProjetsPage({ searchParams }: { searchParams: Promise<{ toutes?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const sp = await searchParams;
  const r = await listerProjetsCartes();

  if (!r.ok) {
    const coupees = capacitesDuRefus(r);
    if (coupees.length) return <main style={cadrePage}><CapaciteNonActive capacites={coupees} /></main>;
    if (r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') {
      const plan = denyReason(effectiveAccess(s), feature) === 'plan';
      return (
        <main style={cadrePage}>
          <h1 style={h1}>Projets</h1>
          <div data-etat="acces-refuse" style={{ marginTop: 20, padding: 28, ...surface, background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ color: 'var(--muted)' }}><Icon name="lock" size={34} /></div>
            <h2 style={{ margin: '10px 0 6px', fontSize: 18, fontWeight: 500, color: 'var(--ink)' }}>{plan ? 'Inclus dès l’abonnement Core' : 'Accès réservé'}</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
              {plan ? 'Les projets du Studio sont disponibles à partir du plan Core.' : 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre à un administrateur de l’espace.'}
            </p>
          </div>
        </main>
      );
    }
    return (
      <main style={cadrePage}>
        <h1 style={h1}>Projets</h1>
        <p role="alert" data-etat="erreur" style={{ marginTop: 16, color: '#ff9db0', fontSize: 14 }}>{r.message} · identifiant support : {r.traceId}</p>
      </main>
    );
  }

  const active = await getActiveBrand(s.workspaceId);
  const toutes = sp.toutes === '1' || !active;
  const cartes = toutes ? r.cartes : r.cartes.filter((c) => c.brandId === active!.id);

  return (
    <main style={cadrePage}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={h1}>Projets</h1>
        <a href="/veille" style={{ ...btn, textDecoration: 'none' }}>Créer depuis la Veille</a>
      </div>
      <p style={sub}>Chaque projet garde ses sources, son hypothèse, son produit et son brief · reprends-le où tu l’as laissé.</p>
      {active && r.cartes.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 16px' }}>
          {toutes
            ? <>Toutes les marques · <Link href="/studio/projets" style={{ color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN }}>seulement {active.name}</Link></>
            : <>Marque active : <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{active.name}</b> · <Link href="/studio/projets?toutes=1" style={{ color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN }}>voir toutes les marques</Link></>}
        </p>
      )}

      {r.cartes.length === 0 ? (
        <section data-etat="premier-usage" style={{ ...vide, padding: 24, display: 'grid', gap: 12, maxWidth: 720 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)' }}>Ton premier projet part d’une annonce</h2>
          <ol style={{ margin: 0, paddingLeft: 20, listStyle: 'decimal', display: 'grid', gap: 6, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5 }}>
            <li>Dans la Veille, choisis une annonce qui t’inspire.</li>
            <li>« Préparer une création » montre ce qu’on peut vraiment observer, et ce qui manque.</li>
            <li>Choisis une hypothèse et un produit de ta marque · le projet garde tout, rien n’est généré.</li>
          </ol>
          <div><a href="/veille" style={{ ...btn, textDecoration: 'none' }}>Ouvrir la Veille</a></div>
        </section>
      ) : cartes.length === 0 ? (
        <section data-etat="vide-marque" style={{ ...vide, padding: 24, display: 'grid', gap: 8, maxWidth: 720 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Aucun projet pour {active?.name ?? 'cette marque'}.</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            <Link href="/studio/projets?toutes=1" style={{ color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN }}>Voir les projets des autres marques</Link> · ou pars d’une annonce dans la <a href="/veille" style={{ color: 'var(--accent-strong)' }}>Veille</a>.
          </p>
        </section>
      ) : (
        <div data-etat="rempli" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
          {cartes.map((c) => <CarteProjet key={c.id} carte={c} />)}
        </div>
      )}
    </main>
  );
}
