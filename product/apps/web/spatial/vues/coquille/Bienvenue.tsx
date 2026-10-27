import type { ReactNode } from 'react';
import { EnTete, Ic, Lien, Vue } from '../../communs';

/**
 * L'écran « Bienvenue sur TikTrends » de la maquette (`vBienvenue` · fragment
 * `docs/spatial/reference/bienvenue.html`), servi à `/onboarding` sous le
 * parcours (`ParcoursAccueil`, la surcouche `#onb`).
 *
 * La maquette y SIMULE un scan de boutique (« 72 % »), ce que Jarvis « a
 * compris » de Neva et une pub de départ fictive. Ici, chaque tuile ne montre
 * que du réel :
 *  1 · le site · celui de la marque, ou celui donné au parcours ; aucun scan
 *      n'est en cours, la barre de progression n'est pas reproduite ;
 *  2 · la marque · son nom, son logo, sa description (ou son secteur et son
 *      ton), ses mots à employer (vert) et à éviter (rouge), tels qu'en base ;
 *  3 · le premier test · aucun visuel inventé ; le lien mène au vrai parcours
 *      de création.
 */

export interface BienvenueProps {
  site: string | null;
  marque: { nom: string; logoUrl: string | null; resume: string | null; aEmployer: string[]; aEviter: string[] } | null;
  /** « Préparer mon premier test » · la vraie destination ouverte à la personne, sinon absent. */
  premierTest: string | null;
  /** Le lien de la fiche marque, pour corriger ce qui y est lu · `null` sans droit. */
  fiche: string | null;
}

function Tuile({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return <section className="tile"><span className="n">{n}</span><h3>{titre}</h3>{children}</section>;
}

export function Bienvenue({ site, marque, premierTest, fiche }: BienvenueProps) {
  return (
    <Vue>
      <EnTete titre="Bienvenue sur TikTrends" sous="Premiers pas · 3 minutes" />
      <div className="coach"><span className="orb">J</span><p>Je m’appelle Jarvis. Dis-moi qui tu es, ce que tu cherches et quelle est ta marque : je m’en sers pour adapter mes suggestions.</p></div>
      <div className="onb">
        <Tuile n={1} titre="Ton site">
          <div className="url"><Ic n="search" />{site || 'Pas encore renseigné'}</div>
          <p className="faint" style={{ fontSize: 12.5 }}>{site ? 'L’adresse de ta boutique, reprise dans la fiche marque.' : 'Tu le donnes à l’étape « Ta marque », ou plus tard dans la fiche.'}</p>
        </Tuile>
        <Tuile n={2} titre="Ce que je sais de ta marque">
          {marque ? (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {marque.logoUrl && <img src={marque.logoUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 16 }} />}
                <div><strong>{marque.nom}</strong><p className="muted" style={{ fontSize: 12.5 }}>{marque.resume || 'Fiche à compléter · description, ton, audience.'}</p></div>
              </div>
              {(marque.aEmployer.length > 0 || marque.aEviter.length > 0) && (
                <div className="chips" style={{ margin: 0 }}>
                  {marque.aEmployer.map((m) => <span key={`g-${m}`} className="pill g">{m}</span>)}
                  {marque.aEviter.map((m) => <span key={`r-${m}`} className="pill r">{m}</span>)}
                </div>
              )}
              <p className="faint" style={{ fontSize: 11.5 }}>{fiche ? <Lien href={fiche}>À valider ou corriger, champ par champ.</Lien> : 'À valider ou corriger, champ par champ.'}</p>
            </>
          ) : <p className="faint" style={{ fontSize: 11.5 }}>Aucune marque pour l’instant · tu la crées à l’étape « Ta marque ».</p>}
        </Tuile>
        <Tuile n={3} titre="Ton premier test">
          <p className="faint" style={{ fontSize: 12.5 }}>Aucune pub mesurée pour l’instant. Crée une première pub, mesure-la, puis itère sur ce qui marche.</p>
          {premierTest && <Lien className="btn pri" href={premierTest}>Préparer mon premier test</Lien>}
        </Tuile>
      </div>
    </Vue>
  );
}
