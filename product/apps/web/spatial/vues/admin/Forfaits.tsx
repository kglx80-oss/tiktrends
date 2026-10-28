import { LARGEUR_MIN_TABLE_TELEPHONE, styleTableDefilante } from '@tiktrends/core';
import { Lien, Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';
import { SectionLeviers, type LeviersFormule } from './leviers';

/**
 * « Forfaits & offres » · `docs/spatial/reference/a-abos.html`. PRÉSENTATIONNEL.
 *
 * Réel · les formules et leurs tarifs effectifs (code + `plan_config`), le
 * nombre d'espaces par formule, la vente en ligne (prix Stripe configuré), les
 * packs de crédits et leurs ventes, l'essai gratuit de l'inscription. Le
 * réglage des tarifs reste celui de la console (action existante, fondateur).
 * Sans source · l'offre annuelle, les codes promo, la création d'un forfait.
 * Vague 3 · les leviers internes de l'ancien écran (formule, crédits,
 * allocation de l'espace du fondateur) suivent, sur les actions existantes.
 */
const COLONNES = '1.3fr .8fr .9fr .8fr .9fr 1fr auto';

export interface PropsForfaits {
  bandeau: BandeauAdmin;
  forfaits: ReadonlyArray<{ cle: string; libelle: string; prix: string; credits: string; abonnes: string; annuel: string; vendable: boolean; raisonVente: string }>;
  /** Où se règlent les tarifs (écran existant) · `null` · aucun réglage accessible. */
  reglage: string | null;
  packs: ReadonlyArray<{ credits: string; prix: string; ventes: string; unitaire: string }>;
  essai: ReadonlyArray<{ libelle: string; valeur: string }>;
  /** Les leviers internes du fondateur sur SON espace (vague 3) · absents sinon. */
  leviers?: LeviersFormule | null;
}

export function Forfaits(p: PropsForfaits) {
  return (
    <Vue>
      <TeteAdmin titre="Forfaits & offres" sous="forfaits" actif="/admin/plans" bandeau={p.bandeau} />
      <section className="tile">
        <div className="sech"><h2>Forfaits publiés</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>Les abonnés actuels gardent leur prix Stripe</span></div>
        <div className="atable" data-table="forfaits" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.forfaits)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES }}><span>Forfait</span><span>Prix / mois</span><span>Crédits / mois</span><span>Espaces</span><span>Annuel</span><span>Vendable en ligne</span><span /></div>
          {p.forfaits.map((f) => (
            <div className="atr" key={f.cle} style={{ gridTemplateColumns: COLONNES }}>
              <span><b>{f.libelle}</b></span><span>{f.prix}</span><span>{f.credits}</span><span>{f.abonnes}</span><span>{f.annuel}</span>
              {/* L'état est RÉEL (prix Stripe configuré sur le serveur) · il ne se bascule pas d'ici. */}
              <span><button className="tg" type="button" role="switch" aria-checked={f.vendable} aria-label={`Vendable en ligne : ${f.libelle}`} title={f.raisonVente} disabled><i /></button></span>
              <span>{p.reglage ? <Lien className="btn sm" href={p.reglage}>Modifier</Lien> : null}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Packs de crédits</h2></div>
          <div className="atable">
            {p.packs.map((k) => (
              <div className="atr" key={k.credits} style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}><span><b>+{k.credits}</b> crédits</span><span>{k.prix}</span><span>{k.ventes}</span><span className="faint">{k.unitaire}</span></div>
            ))}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Codes promo</h2><Pill>Non branchés</Pill></div>
          <div className="atable"><Vide>L’outil ne gère aucun code promo · le paiement Stripe n’en propose pas. Les créer demande une décision d’offre.</Vide></div>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Essai gratuit</h2></div>
        <div className="atable">
          {p.essai.map((e) => <div className="atr" key={e.libelle} style={{ gridTemplateColumns: '1fr 1fr' }}><span className="faint">{e.libelle}</span><span><b>{e.valeur}</b></span></div>)}
        </div>
      </section>
      {p.leviers && <SectionLeviers l={p.leviers} />}
    </Vue>
  );
}
