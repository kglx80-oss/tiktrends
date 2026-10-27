import { DEFINITIONS_CAPACITES, type CapaciteStudio } from '@tiktrends/core';
import { EnTete, Ic, Lien, Vue } from '../../communs';

/**
 * Les états d'un écran de projet qui ne s'ouvre pas · mêmes cas et mêmes
 * phrases que la V5 (projet introuvable, accès réservé, capacité non activée
 * pour l'espace, erreur avec identifiant support), dans les tuiles Spatial.
 * « Introuvable » et « pas à toi » sont la même page neutre.
 */

export type RaisonEtat =
  | { type: 'introuvable'; message: string }
  | { type: 'refuse'; plan: boolean; quoi: string }
  | { type: 'erreur'; message: string; traceId: string }
  | { type: 'capacite'; capacites: CapaciteStudio[] };

export function EtatProjet({ raison, projectId, titre }: { raison: RaisonEtat; projectId: string; titre?: string }) {
  if (raison.type === 'capacite') {
    const caps = raison.capacites.length ? raison.capacites : (['projets'] as CapaciteStudio[]);
    const defs = caps.map((c) => DEFINITIONS_CAPACITES[c]);
    const versProjet = !caps.includes('projets') ? `/studio/projets/${encodeURIComponent(projectId)}` : null;
    return (
      <Vue>
        <EnTete titre={defs.map((d) => d.libelle).join(' · ')} sous={titre ?? 'Studios'} />
        <section className="tile" role="status" data-etat="non-active" data-capacites={caps.join(' ')} style={{ display: 'grid', gap: 10, maxWidth: 680 }}>
          <div className="lbl"><Ic n="lock" />Non activé pour cet espace</div>
          {defs.map((d) => <p key={d.libelle} className="muted" style={{ fontSize: 13 }}>{d.libelle} · {d.couvre}.{d.raison ? ` En recette : ${d.raison}.` : ' Coupé par l’équipe de la plateforme.'}</p>)}
          <p className="muted" style={{ fontSize: 13 }}>Rien n’a été écrit ni débité. Tes projets, leurs versions et leurs médias restent intacts et réapparaissent dès l’activation.</p>
          <p className="faint" style={{ fontSize: '12.5px' }}>L’ouverture se fait d’abord pour des espaces pilotes, puis pour tous après recette. Pour en faire partie, écris à l’équipe depuis le support.</p>
          <div className="kc">
            {versProjet && <Lien className="btn sm" href={versProjet}><Ic n="back" />Revenir au projet</Lien>}
            <Lien className="btn sm" href="/support">Écrire au support</Lien>
          </div>
        </section>
      </Vue>
    );
  }
  const h1 = raison.type === 'refuse' ? 'Accès réservé' : raison.type === 'introuvable' ? 'Projet introuvable' : 'Projet indisponible';
  const etat = raison.type === 'refuse' ? 'acces-refuse' : raison.type === 'introuvable' ? 'introuvable' : 'erreur';
  const retour = raison.type === 'erreur' ? { href: `/studio/projets/${encodeURIComponent(projectId)}`, libelle: 'Projet' } : { href: '/studio/projets', libelle: 'Projets' };
  return (
    <Vue>
      <EnTete titre={h1} sous="Studios" />
      <section className="tile" data-etat={etat} style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
        <div className="lbl"><Ic n={raison.type === 'refuse' ? 'lock' : 'search'} />{h1}</div>
        <p className="muted" style={{ fontSize: 13 }}>
          {raison.type === 'refuse'
            ? (raison.plan ? `${raison.quoi} est disponible à partir du plan Core.` : 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre.')
            : raison.message}
        </p>
        {raison.type === 'erreur' && <p className="faint" style={{ fontSize: '12.5px' }}>Identifiant support : {raison.traceId}</p>}
        <div className="kc"><Lien className="btn sm" href={retour.href}><Ic n="back" />{retour.libelle}</Lien></div>
      </section>
    </Vue>
  );
}
