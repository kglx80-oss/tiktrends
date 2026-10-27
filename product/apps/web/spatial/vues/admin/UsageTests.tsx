import { Vue } from '../../communs';
import { Barre, TeteAdmin, Vide, type BandeauAdmin } from './base';

/**
 * « Usage & tests » · `docs/spatial/reference/a-usage.html`. PRÉSENTATIONNEL.
 *
 * Réel · l'usage de la plateforme sur 30 jours (générations, projets,
 * exécutions de prompts, messages Jarvis, lots de test, crédits, appels IA).
 * Sans source · les déploiements progressifs par part de comptes (l'outil a
 * des interrupteurs Studios par capacité et par espace, pas de pourcentage) et
 * les tests A/B de la plateforme (aucun n'existe) · l'écran le dit.
 */
export interface PropsUsageTests {
  bandeau: BandeauAdmin;
  titre: string;
  usage: ReadonlyArray<{ libelle: string; largeur: number; n: string }>;
}

export function UsageTests(p: PropsUsageTests) {
  return (
    <Vue>
      <TeteAdmin titre="Usage & tests" sous="usage" actif="/admin/usage" bandeau={p.bandeau} />
      <div className="agrid2">
        <section className="tile">
          <div className="sech"><h2>{p.titre}</h2></div>
          <div className="ausg">
            {p.usage.map((u) => <div className="aur" key={u.libelle}><span>{u.libelle}</span><Barre part={u.largeur} /><b>{u.n}</b></div>)}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Fonctionnalités progressives</h2></div>
          <div className="aflags">
            <Vide>Aucun déploiement par part de comptes · les Studios s’ouvrent par interrupteur (capacité, espace), réglés dans leur écran de l’ancienne interface.</Vide>
            <a className="btn sm" href="/admin/studios-interrupteurs">Interrupteurs Studios</a>
          </div>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Tests A/B en cours</h2></div>
        <div className="atable"><Vide>La plateforme ne mène aucun test A/B · rien n’est affiché. Les tests de pubs de tes clients vivent dans Résultats.</Vide></div>
      </section>
    </Vue>
  );
}
