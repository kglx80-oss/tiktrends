import {
  CLASSE_RISQUE, VALEUR_ABSENTE, adminDateCourte, adminVariation, adminEuros, adminNombre, adminPluriel, adminPourcent, comptesARisque, estEnEssai, estPayant,
  filtresComptes, inscriptions, libelleRisque, mrrARisque, mrrEspace, niveauRisque, parcoursInscription, partCreditsUtilises, signauxRisque,
} from '@tiktrends/core';
import { Comptes } from '../../../../../spatial/vues/admin/Comptes';
import { bandeau, chargerEspaces, chargerTarifs, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const LIMITE = 200;

/** « Inscriptions & comptes » · porte de `/admin/signups` (V5) · fondateur ET admin de l'espace. */
export default async function ComptesSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const tarifs = await chargerTarifs();
  const espaces = await chargerEspaces(maintenant);
  const ins = inscriptions(espaces, tarifs, maintenant);
  const risque = comptesARisque(espaces, tarifs, maintenant);
  const variation = adminVariation(ins.variationPct, 'aucune le mois d’avant');

  return (
    <Comptes
      bandeau={bandeau(espaces, tarifs)}
      kpis={[
        { lbl: 'Inscriptions · 30 j', v: adminNombre(ins.n30), d: variation.texte, c: variation.classe },
        { lbl: 'Essais en cours', v: adminNombre(ins.essaisEnCours), d: `Fin dans 7 j : ${adminNombre(ins.essaisFinDans7j)}` },
        { lbl: 'Conversion · inscrits 30 j', v: adminPourcent(ins.conversionPct), d: 'devenus payants' },
        { lbl: 'Comptes à risque', v: adminNombre(risque.length), d: 'au moins un signal', c: risque.length ? 'dn' : '' },
      ]}
      alerte={risque.length ? { comptes: `${adminPluriel(risque.length, 'compte')} à surveiller`, mrr: `${adminEuros(mrrARisque(risque))} de MRR` } : null}
      parcours={parcoursInscription(espaces, tarifs, maintenant).map((e) => ({ libelle: e.libelle, n: adminNombre(e.n), hauteur: e.hauteur, part: e.partPrecedente == null ? null : adminPourcent(e.partPrecedente, 0) }))}
      filtres={filtresComptes(tarifs, 'risque')}
      comptes={espaces.slice(0, LIMITE).map((e) => {
        const payant = estPayant(e, tarifs), essai = !payant && estEnEssai(e, maintenant);
        const part = partCreditsUtilises(e, tarifs);
        const n = signauxRisque(e, maintenant).length;
        const enRisque = (payant || essai) && n > 0;
        return {
          id: e.id, nom: e.nom,
          cles: [e.forfait, ...(essai ? ['essai'] : []), ...(enRisque ? ['risque'] : [])],
          forfait: essai ? { libelle: 'Essai', classe: 'c' as const } : { libelle: tarifs.libelles[e.forfait] ?? e.forfait, classe: '' as const },
          mrr: payant ? adminEuros(mrrEspace(e, tarifs)) : VALEUR_ABSENTE,
          credits: { part: part ?? 0, texte: part == null ? VALEUR_ABSENTE : `${part} %`, over: (part ?? 0) > 100 },
          sante: { libelle: libelleRisque(n), classe: (CLASSE_RISQUE[niveauRisque(e, maintenant)] || 'g') as 'g' | 'w' | 'r' },
          profil: e.profil ?? VALEUR_ABSENTE,
          inscrit: adminDateCourte(e.creeLe),
        };
      })}
      note={`${espaces.length > LIMITE ? `Les ${LIMITE} derniers espaces inscrits sur ${adminNombre(espaces.length)}` : adminPluriel(espaces.length, 'espace')} · crédits utilisés = consommation sur 30 jours ÷ dotation de la formule.`}
    />
  );
}
