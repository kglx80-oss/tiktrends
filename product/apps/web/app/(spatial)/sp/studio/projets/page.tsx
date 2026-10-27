import { redirect } from 'next/navigation';
import {
  aPermissionEspace, autresIterationsSpatial, capacitesDuRefus, etatNouveauProjet, pastilleIterationSpatiale, refusStudiosSpatial,
  repriseCarteSpatiale, segmentsEtapeSpatiale, CHEMIN_NOUVEAU_PROJET, CLASSE_ETAPE_SPATIALE, NOTE_ITERATION_SPATIALE,
  type EtatProchainesIterations,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { getActiveBrand } from '../../../../../lib/brands';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { contexteDepuisSession } from '../../../../../lib/studios/garde';
import { chargerProchainesIterations } from '../../../../../lib/accueil-v5';
import { listerProjetsCartes } from '../../../../actions/studios/sources';
import { Lien } from '../../../../../spatial/communs';
import { Studios, type IterationsSpatiales } from '../../../../../spatial/vues/studios/Studios';
import { RefusStudios } from '../../../../../spatial/vues/studios/Refus';
import { SOUS_NAV_STUDIOS } from '../../../../../spatial/vues/studios/sous-nav';

export const dynamic = 'force-dynamic';

const FEATURE_STUDIO = FEATURES.find((f) => f.key === 'studio')!;
const TITRE = 'Studios';
const SOUS = 'Tes projets, du premier brief au dernier export';

/** Le plan d'itération réel (gagnantes prouvées) dans la forme de la maquette · un état fermé ne montre rien. */
function iterationsSpatiales(e: EtatProchainesIterations): IterationsSpatiales | null {
  switch (e.etat) {
    case 'ferme': return null;
    case 'offre': return { etat: 'message', message: e.message, lien: { href: '/billing', libelle: 'Voir les forfaits' } };
    case 'sans-marque': return { etat: 'message', message: e.message, lien: { href: '/brands', libelle: 'Choisir une marque' } };
    case 'erreur': return { etat: 'message', message: e.message, lien: null };
    case 'vide': return { etat: 'message', message: e.message, lien: { href: e.resultats, libelle: 'Voir les Résultats' } };
    case 'liste': return {
      etat: 'liste',
      cartes: e.cartes.map((c) => ({
        id: c.adId,
        flux: c.vignette ? [{ src: c.vignette, classe: 'won', tag: c.verdict }] : [],
        pastille: pastilleIterationSpatiale(c),
        titre: c.titre,
        mesure: c.mesure ? { valeur: c.mesure.valeur, libelle: c.mesure.libelle, detail: `${c.mesure.periode} · ${c.mesure.source}` } : null,
        garde: c.garde,
        change: c.change,
        raison: c.raison,
        iterer: c.iterer,
        note: c.iterer ? NOTE_ITERATION_SPATIALE.iterer : NOTE_ITERATION_SPATIALE.role,
      })),
      autre: { href: '/studio/iterer', titre: 'Itérer sur une autre créa', sous: autresIterationsSpatial(e.total, e.cartes.length) },
    };
  }
}

/**
 * « Studios » (Spatial) · mêmes gardes et mêmes sources que la liste V5
 * (`app/(app)/studio/projets`) : `listerProjetsCartes` (garde studio, capacité
 * `projets`, portée de marque), marque active, permission `studio.propose`
 * (même règle que `creerProjet`), plan d'itération réel. LECTURE SEULE · la
 * visite n'écrit rien, ne prépare rien, ne lance rien.
 */
export default async function StudiosSpatial({ searchParams }: { searchParams: Promise<{ toutes?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const sp = await searchParams;
  const r = await listerProjetsCartes();
  if (!r.ok) {
    const refus = refusStudiosSpatial({ capacites: capacitesDuRefus(r), code: r.code, plan: denyReason(effectiveAccess(s), FEATURE_STUDIO) === 'plan', message: r.message, traceId: r.traceId });
    return <RefusStudios titre={TITRE} sous={SOUS} sousNav={SOUS_NAV_STUDIOS} actif="/studio/projets" refus={refus} />;
  }

  const active = await getActiveBrand(s.workspaceId);
  const toutes = sp.toutes === '1' || !active;
  const cartes = toutes ? r.cartes : r.cartes.filter((c) => c.brandId === active!.id);
  const peutProposer = aPermissionEspace(contexteDepuisSession(s, [], [], '').permissions, 'studio.propose');
  const nouveau = etatNouveauProjet({ peutProposer, marqueActive: active ? { id: active.id, name: active.name } : null });
  const { iterations } = await chargerProchainesIterations(s, { marque: active ? { id: active.id } : null, peutIterer: nouveau.etat === 'pret' });
  const maintenant = new Date();
  // Les projets archivés · même action, même garde et même portée (lecture seule). Un refus ne coupe pas la page · le filtre n'est pas proposé.
  const lus = await listerProjetsCartes({ archives: true }).catch(() => null);
  const archivees = lus?.ok ? (toutes ? lus.cartes : lus.cartes.filter((c) => c.brandId === active!.id)) : null;
  const versSpatial = (c: (typeof r.cartes)[number]) => ({
    id: c.id, href: `/studio/projets/${c.id}`, title: c.title, marque: c.marque, libelleType: c.libelleType, etape: c.etape,
    // La photo produit épinglée · la route relit les droits avant de servir le fichier. Sans elle, la couverture reste vide.
    couverture: c.apercu ? [{ src: c.apercu }] : [],
    version: c.versionN != null ? `V${c.versionN}` : null,
    pastille: { libelle: c.libelleEtape, classe: CLASSE_ETAPE_SPATIALE[c.etape] },
    segments: segmentsEtapeSpatiale(c.etape),
    libelleStp: c.marque || 'Marque',
    reprise: repriseCarteSpatiale(c, maintenant),
  });

  const lienFaible = { color: 'inherit', textDecoration: 'underline' } as const;
  const note = (
    <>
      {active && r.cartes.length > 0 && (
        <p className="faint" style={{ fontSize: '12.5px', margin: '0 0 12px' }}>
          {toutes
            ? <>Toutes les marques · <Lien href="/studio/projets" style={lienFaible}>seulement {active.name}</Lien></>
            : <>Marque active : <b>{active.name}</b> · <Lien href="/studio/projets?toutes=1" style={lienFaible}>voir toutes les marques</Lien></>}
        </p>
      )}
      {nouveau.etat !== 'pret' && (
        <p className="faint" style={{ fontSize: '12.5px', margin: '0 0 12px' }}>
          {nouveau.message}{nouveau.etat === 'sans-marque' && <> · <Lien href={nouveau.lien.href} style={lienFaible}>{nouveau.lien.libelle}</Lien></>}
        </p>
      )}
    </>
  );

  const vide = r.cartes.length === 0
    ? { titre: 'Ton premier projet', texte: 'Crée-le ici, ou pars d’une annonce de la Veille avec « Préparer une création » · rien n’est généré tant que tu ne lances rien.' }
    : cartes.length === 0
      ? { titre: `Aucun projet pour ${active?.name ?? 'cette marque'}`, texte: <>Les autres marques en ont · <Lien href="/studio/projets?toutes=1" style={lienFaible}>voir leurs projets</Lien>.</> }
      : null;

  return (
    <Studios
      sousNav={SOUS_NAV_STUDIOS}
      iterations={iterationsSpatiales(iterations)}
      projets={cartes.map(versSpatial)}
      archives={archivees ? archivees.map(versSpatial) : null}
      nouveau={nouveau.etat === 'pret' ? { href: CHEMIN_NOUVEAU_PROJET } : null}
      note={note}
      peutArchiver={peutProposer}
      vide={vide}
    />
  );
}
