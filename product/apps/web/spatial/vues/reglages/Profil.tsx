import { EnTete, Lien, Vue } from '../../communs';
import { AnnonceRetour } from '../marque/interactifs';
import { IdentiteProfil, type EnregistrerProfil, type IdentiteInitiale } from './profil-client';

/**
 * « Mon profil » · vague 4 · l'écran V5 `/profile` n'a pas de fragment de
 * maquette · composé avec les classes de la maquette (`.tile`, `.field`,
 * `.npr`, `.sw2`, `.kv2`, `.btn`), comme les Réglages voisins. PRÉSENTATIONNEL ·
 * chaque valeur vient de la session et de la table `users`, chaque geste d'une
 * action serveur EXISTANTE passée en props.
 */

export interface PropsProfil {
  identite: IdentiteInitiale;
  acces: { espace: string; role: string; abonnement: string };
  /** Les liens réels selon les droits (`liensAccesProfil`) · vide pour un membre. */
  liens: ReadonlyArray<{ href: string; libelle: string }>;
  enregistrer: EnregistrerProfil | null;
  /** `changePasswordAction` · redirige vers `/profile?ok=pw` ou `?e=…`. */
  changerMotDePasse: ((fd: FormData) => Promise<void>) | null;
  motDePasseMin: number;
  retours: Record<string, string>;
}

export function Profil(p: PropsProfil) {
  return (
    <Vue>
      <EnTete titre="Mon profil" sous={`${p.acces.role} · ${p.acces.espace} · ${p.acces.abonnement}`} />
      <div className="grid2">
        <section className="tile" data-geste="identite" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div><div className="lbl" style={{ margin: 0 }}>Identité</div><h2 style={{ margin: '4px 0 0' }}>Ta photo et ton nom</h2></div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Ta photo, ton nom et la confidentialité de tes informations.</p>
          <IdentiteProfil init={p.identite} enregistrer={p.enregistrer} />
        </section>
        <section className="tile" data-geste="mot-de-passe" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div><div className="lbl" style={{ margin: 0 }}>Sécurité</div><h2 style={{ margin: '4px 0 0' }}>Changer de mot de passe</h2></div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>On te demande ton mot de passe actuel pour confirmer que c’est bien toi. Les autres appareils connectés sont déconnectés.</p>
          {p.changerMotDePasse ? (
            <form action={p.changerMotDePasse} style={{ display: 'grid', gap: 12 }}>
              <label className="field">Mot de passe actuel<input name="current" type="password" required autoComplete="current-password" /></label>
              <label className="field">Nouveau mot de passe<input name="next" type="password" required minLength={p.motDePasseMin} autoComplete="new-password" placeholder={`${p.motDePasseMin} caractères min.`} /></label>
              <div><button className="btn pri" type="submit">Mettre à jour le mot de passe</button></div>
            </form>
          ) : <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>Changement de mot de passe indisponible pour le moment.</p>}
        </section>
        <section className="tile" data-geste="preferences">
          <h2>Préférences</h2>
          <dl className="kv2">
            <dt>Langue</dt><dd><span className="opt2 on">Français</span><span className="faint" style={{ fontSize: 12 }}>D’autres langues arrivent prochainement.</span></dd>
          </dl>
        </section>
        <section className="tile" data-geste="acces">
          <h2>Espace & accès</h2>
          <dl className="kv2">
            <dt>Espace</dt><dd>{p.acces.espace}</dd>
            <dt>Rôle</dt><dd>{p.acces.role}</dd>
            <dt>Abonnement</dt><dd>{p.acces.abonnement}</dd>
          </dl>
          {p.liens.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {p.liens.map((l) => <Lien key={l.href} className="btn sm" href={l.href}>{l.libelle}</Lien>)}
            </div>
          )}
        </section>
      </div>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
