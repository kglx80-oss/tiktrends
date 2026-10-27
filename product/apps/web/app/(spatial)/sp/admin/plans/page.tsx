import { VALEUR_ABSENTE, adminEuros, adminNombre, adminPluriel, adminPourcent, espacesParForfait, inscriptions } from '@tiktrends/core';
import { signupOpen } from '../../../../../lib/auth';
import { planPurchasable } from '../../../../../lib/stripe';
import { CREDIT_PACKS } from '../../../../../lib/credit-packs';
import { TRIAL_DEFAULT_CREDITS, TRIAL_DEFAULT_DAYS } from '../../../../../lib/trial';
import type { Plan } from '../../../../../lib/rbac';
import { Forfaits } from '../../../../../spatial/vues/admin/Forfaits';
import { bandeau, chargerEspaces, chargerRecharges, chargerTarifs, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Forfaits & offres » · porte de `/admin/plans` (V5) · fondateur ET admin de
 * l'espace. Lecture seule : aucune offre, aucun prix n'est modifié ici. Les
 * leviers V5 de cette adresse (appliquer une formule, ajuster les crédits de
 * SON espace) restent dans l'ancienne interface · « Modifier » mène au réglage
 * des tarifs existant (console fondateur).
 */
export default async function ForfaitsSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const [tarifs, recharges] = await Promise.all([chargerTarifs(), chargerRecharges(maintenant)]);
  const espaces = await chargerEspaces(maintenant, []);
  const parForfait = espacesParForfait(espaces);
  const ins = inscriptions(espaces, tarifs, maintenant);

  return (
    <Forfaits
      bandeau={bandeau(espaces, tarifs)}
      reglage="/console"
      forfaits={tarifs.ordre.map((f) => {
        const vendable = f === 'starter' ? signupOpen() : planPurchasable(f as Plan);
        return {
          cle: f, libelle: tarifs.libelles[f] ?? f,
          prix: (tarifs.prix[f] ?? 0) > 0 ? adminEuros(tarifs.prix[f]) : 'Gratuit',
          credits: adminNombre(tarifs.credits[f] ?? 0), abonnes: adminNombre(parForfait[f] ?? 0), annuel: VALEUR_ABSENTE, vendable,
          raisonVente: f === 'starter' ? (vendable ? 'Inscription libre ouverte' : 'Inscription sur invitation seulement') : (vendable ? 'Prix Stripe configuré sur le serveur' : 'Aucun prix Stripe configuré sur le serveur'),
        };
      })}
      packs={CREDIT_PACKS.map((k) => {
        const ventes = recharges.filter((r) => r.credits === k.credits).length;
        return { credits: adminNombre(k.credits), prix: adminEuros(k.eur), ventes: `${adminPluriel(ventes, 'vente')} / 30 j`, unitaire: `${adminEuros((k.eur / k.credits) * 100, 2)} / 100 crédits` };
      })}
      essai={[
        { libelle: 'Durée', valeur: adminPluriel(TRIAL_DEFAULT_DAYS, 'jour') },
        { libelle: 'Crédits offerts', valeur: adminPluriel(TRIAL_DEFAULT_CREDITS, 'crédit') },
        { libelle: 'Carte bancaire requise', valeur: 'Non' },
        { libelle: 'Conversion inscrits → payants', valeur: ins.conversionPct == null ? VALEUR_ABSENTE : `${adminPourcent(ins.conversionPct)} (30 j)` },
      ]}
    />
  );
}
