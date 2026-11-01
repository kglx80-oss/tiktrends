import { vueInventaireStockage } from '@tiktrends/core';
import { chargerInventaireStockage } from '../../../../../lib/stockage-inventaire';
import { Stockage } from '../../../../../spatial/vues/admin/Stockage';
import { bandeauSeul, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Stockage · fichiers orphelins » · porte `porteAdmin` (admin de l'espace ET
 * fondateur) AVANT toute lecture. LECTURE SEULE · la liste du bucket, les
 * références recensées et la règle du noyau (`inventaireOrphelins`) · aucune
 * suppression n'est possible depuis cet écran.
 */
export default async function StockageSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const [bandeau, r] = await Promise.all([bandeauSeul(), chargerInventaireStockage({ maintenant })]);
  if (r.etat === 'sans_stockage') return <Stockage bandeau={bandeau} etat="indisponible" raison="Le stockage de fichiers n’est pas activé sur cette plateforme · rien à inventorier." />;
  if (r.etat === 'sans_base') return <Stockage bandeau={bandeau} etat="indisponible" raison="La base de données est injoignable · l’inventaire ne peut pas dire ce qui est référencé." />;
  const vue = vueInventaireStockage(r.inventaire, {
    listeComplete: r.listeComplete, erreurListe: r.erreurListe,
    colonnesIncompletes: r.lectures.filter((l) => !l.complete).map((l) => `${l.table}.${l.colonne}`),
  }, r.noms, maintenant);
  return <Stockage bandeau={bandeau} etat="pret" {...vue} />;
}
