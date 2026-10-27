import { EnTete, SousNav, Vue } from '../../communs';
import type { ActionFormulaire } from './base';
import { AnnonceRetour, BoutonAppel, SupprimerConfirme } from './interactifs';
import { Ic } from '../../communs';
import { ChoixPersona, type PersonaVue } from './personas-client';

/**
 * « Personas » · `docs/spatial/reference/clients.html` (maquette : `vClients`).
 * PRÉSENTATIONNEL · les personas viennent de `personas`, les scénarios d'usage
 * de `scenarios`. Ce que la base ne porte pas (part des acheteurs, canaux) n'est
 * pas affiché · la case dit ce qui manque.
 */

export type { PersonaVue } from './personas-client';

export interface PropsPersonas {
  sousNav: ReadonlyArray<{ href: string; libelle: string }>;
  brandId: string;
  nom: string;
  personas: readonly PersonaVue[];
  scenarios: ReadonlyArray<{ titre: string; contexte: string | null }>;
  /** Jarvis ouvert à la personne · `null` sinon (raison au survol). */
  jarvis: string | null;
  creerPub: string | null;
  ajouterPersona: ActionFormulaire | null;
  ajouterScenario: ActionFormulaire | null;
  retours: Record<string, string>;
  /**
   * Les gestes de la fiche V5 sans fragment de maquette (vague 2) · retirer un
   * persona ou un scénario, générer le visuel d'un scénario (payant, prix
   * annoncé). Absents, l'écran est celui de la maquette.
   */
  gestion?: GestionPersonas;
}

export interface GestionPersonas {
  retirerPersona: ActionFormulaire | null;
  retirerScenario: ActionFormulaire | null;
  scenarios: ReadonlyArray<{ id: string; titre: string; contexte: string | null; image: string | null }>;
  /** Le visuel d'un scénario · `generateScenarioImageAction` (barrière de dépense) · `null` sans moteur d'image, avec la raison. */
  visuel: { appel: ((i: { brandId: string; scenarioId: string }) => Promise<{ url?: string; error?: string }>) | null; cout: number | null; raison: string | null };
}

function TuileScenarios({ brandId, g }: { brandId: string; g: GestionPersonas }) {
  const prix = g.visuel.cout != null ? ` · ${g.visuel.cout} crédit${g.visuel.cout > 1 ? 's' : ''}` : '';
  return (
    <section className="tile" data-geste="scenarios" style={{ marginTop: 16 }}>
      <div className="sech" style={{ margin: '0 0 10px' }}><h2>Scénarios d’usage</h2><span className="faint" style={{ fontSize: '12.5px' }}>{g.scenarios.length} scénario{g.scenarios.length > 1 ? 's' : ''} · un visuel aide à choisir le bon décor</span></div>
      {g.scenarios.length === 0
        ? <p className="faint" style={{ fontSize: 13, margin: 0 }}>Aucun scénario · ajoute-le depuis la fiche du persona.</p>
        : (
          <div className="nprefs">
            {g.scenarios.map((x) => (
              <div className="npr" key={x.id} style={{ flexWrap: 'wrap' }}>
                <span className="applogo" style={{ width: 56, height: 56, overflow: 'hidden' }}>{x.image ? <img src={x.image} alt="" style={{ width: 56, height: 56, objectFit: 'cover' }} /> : <Ic n="img" />}</span>
                <div style={{ flex: '1 1 200px' }}><strong>{x.titre}</strong><small>{x.contexte ?? 'Contexte à préciser'}</small></div>
                <BoutonAppel className="btn sm" appel={g.visuel.appel} argument={{ brandId, scenarioId: x.id }} succes="Visuel du scénario créé" raison={g.visuel.raison} attente="Génération…">
                  <Ic n="spark" />{x.image ? 'Régénérer' : 'Générer le visuel'}{prix}
                </BoutonAppel>
                <SupprimerConfirme action={g.retirerScenario} champs={{ brandId, id: x.id }} libelle={`Retirer le scénario ${x.titre}`} confirmation={`Retirer le scénario « ${x.titre} » ?`}><Ic n="x" /></SupprimerConfirme>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

export function Personas(p: PropsPersonas) {
  return (
    <Vue>
      <EnTete titre="Personas" sous={`Les personnes à qui ${p.nom} parle · Jarvis écrit pour elles`} />
      <SousNav items={p.sousNav} actif={`/brands/${p.brandId}/personas`} />
      <ChoixPersona brandId={p.brandId} personas={p.personas} scenarios={p.scenarios} jarvis={p.jarvis} creerPub={p.creerPub} ajouterPersona={p.ajouterPersona} ajouterScenario={p.ajouterScenario} {...(p.gestion ? { retirerPersona: p.gestion.retirerPersona } : {})} />
      {p.gestion && <TuileScenarios brandId={p.brandId} g={p.gestion} />}
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
