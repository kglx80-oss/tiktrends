'use client';

import { useEffect, useMemo, useState } from 'react';
import { VIDE_COULOIR, repliPossible, replierPerdants } from '@tiktrends/core';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { Noeud } from './briques';
import { useNaviguer } from './naviguer';
import { PanneauJarvis } from './PanneauJarvis';
import { OngletBrief } from './OngletBrief';
import { OngletCreations } from './OngletCreations';
import type { OngletProjet, PropsProjet } from './types';

/**
 * La fiche d'un projet · `docs/spatial/reference/projet.html`, balisage à
 * l'identique (en-tête, `wshead`, canvas en couloirs, panneau Jarvis).
 *
 * Les trois onglets de la maquette portent TOUT ce que la fiche V5 portait :
 *  · « Brief & références » · brief, hypothèse, références, produit, fiche
 *    marque, ce qui manque, propositions (demander, relire, appliquer,
 *    rejeter), historique des versions, export du brief, ateliers du projet
 *    (produit, textes, identités et voix, image, vidéo, export) ;
 *  · « Canvas » · la LIGNÉE réelle (brief → hypothèse → créations → mesure →
 *    itération) et la conversation Jarvis liée au projet ;
 *  · « Créations » · lots et sorties livrées avec leur état réel (en file, en
 *    cours, échec, prête), variantes et tests, tâches.
 *
 * Changer d'onglet n'écrit rien. Aucune génération n'est lancée d'ici · le
 * geste « Générer… » ouvre la préparation, où le devis est montré avant tout.
 */

const ONGLETS: ReadonlyArray<{ cle: OngletProjet; libelle: string }> = [
  { cle: 'brief', libelle: 'Brief & références' },
  { cle: 'canvas', libelle: 'Canvas' },
  { cle: 'crea', libelle: 'Créations' },
];

const ANCRES: Record<string, OngletProjet> = { '#brief': 'brief', '#propositions': 'brief', '#canvas': 'canvas', '#creations': 'crea', '#variantes': 'crea', '#taches': 'crea' };

export function Projet(p: PropsProjet) {
  const [onglet, setOnglet] = useState<OngletProjet>(p.ongletInitial ?? 'canvas');
  const [replie, setReplie] = useState(false);
  const naviguer = useNaviguer();

  // Une ancre (lien de tâche, retour de l'atelier) ouvre l'onglet qui la porte.
  useEffect(() => {
    const lire = () => { const o = ANCRES[window.location.hash]; if (o) setOnglet(o); };
    lire();
    window.addEventListener('hashchange', lire);
    return () => window.removeEventListener('hashchange', lire);
  }, []);

  const repli = useMemo(() => repliPossible(p.couloirs), [p.couloirs]);
  const couloirs = useMemo(() => replierPerdants(p.couloirs, replie && repli.possible), [p.couloirs, replie, repli.possible]);

  return (
    <Vue>
      <EnTete titre={p.projet.titre} sous={p.projet.sousTitre} />
      <div className="wshead">
        <div className="seg" role="group" aria-label="Vue du projet">
          {ONGLETS.map((o) => (
            <button key={o.cle} type="button" data-ptab={o.cle} aria-pressed={onglet === o.cle} onClick={() => setOnglet(o.cle)}>{o.libelle}</button>
          ))}
        </div>
        <span className={`pill ${p.pastille.classe}`} style={{ marginLeft: 'auto' }}><Ic n={p.pastille.icone} />{p.pastille.libelle}</span>
        {p.exporterHref && <Lien className="btn sm" href={p.exporterHref}><Ic n="down" />Exporter</Lien>}
      </div>

      {onglet === 'canvas' && (
        <div className="ws">
          <div className="board">
            <div className="btool">
              <button className="chip" type="button" disabled={!p.generer.href} title={p.generer.raison ?? 'Ouvre la préparation · le devis est montré avant tout lancement'}
                onClick={() => { if (p.generer.href) naviguer(p.generer.href); }}>
                <Ic n="spark" />{p.generer.libelle}
              </button>
              <button className="chip" type="button" data-fold="" aria-pressed={replie && repli.possible} disabled={!repli.possible} title={repli.raison ?? 'Masque les créations battues par une mesure'}
                onClick={() => setReplie((r) => !r)}>Replier les perdants</button>
              <span className="faint" style={{ marginLeft: 'auto', fontSize: '11.5px' }}>{p.aideCanvas}</span>
            </div>
            <div className="lanes">
              {couloirs.map((c) => (
                <div className="lane" key={c.cle}>
                  <span className="lh">{c.titre}</span>
                  {c.noeuds.map((n) => <Noeud key={n.id} n={n} />)}
                  {c.noeuds.length === 0 && <span className="faint" style={{ fontSize: '11.5px' }}>{VIDE_COULOIR[c.cle]}</span>}
                </div>
              ))}
            </div>
          </div>
          <PanneauJarvis {...p.jarvis} ouvrirBrief={() => setOnglet('brief')} />
        </div>
      )}

      {onglet === 'brief' && <OngletBrief {...p.brief} />}
      {onglet === 'crea' && <OngletCreations {...p.creations} />}
    </Vue>
  );
}
