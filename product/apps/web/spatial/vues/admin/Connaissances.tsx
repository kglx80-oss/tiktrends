import type { VueAdminConnaissances } from '../../../app/actions/connaissances';
import { Lien, Vue } from '../../communs';
import { TeteAdmin, type BandeauAdmin } from './base';
import { ConnaissancesSpatiales } from './connaissances-client';

/**
 * « Connaissances » · ce que l'équipe plateforme donne à lire à Jarvis
 * (ancien `/admin/connaissances`). La page pose la garde « accès total »
 * d'équipe et lit la vue · `erreur` · lecture impossible, dite.
 */
export interface PropsConnaissances {
  bandeau: BandeauAdmin;
  vue: VueAdminConnaissances | null;
  erreur: string | null;
  espaces: Array<{ id: string; name: string }>;
  marques: Array<{ id: string; name: string; workspaceId: string }>;
}

export function Connaissances(p: PropsConnaissances) {
  return (
    <Vue>
      <TeteAdmin titre="Connaissances" sous="connaissances" actif="/admin/connaissances" bandeau={p.bandeau} />
      <div className="kc" style={{ alignItems: 'center', marginBottom: 14 }}>
        <small className="faint">Ce que l’équipe donne à lire à Jarvis · consignes, méthodes d’itération, savoirs, données.</small>
        <Lien className="btn sm" href="/admin/prompts/registre?onglet=connaissances" style={{ marginLeft: 'auto' }}>Voir dans le registre IA</Lien>
      </div>
      {p.erreur || !p.vue
        ? <section className="tile" role="alert" data-etat="erreur"><b>{p.erreur ?? 'Lecture impossible.'}</b></section>
        : <ConnaissancesSpatiales vueInitiale={p.vue} espaces={p.espaces} marques={p.marques} />}
    </Vue>
  );
}
