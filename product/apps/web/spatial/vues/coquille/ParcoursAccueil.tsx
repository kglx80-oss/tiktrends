'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  basculerObjectif, boutonPrincipalParcours, libelleEtapeParcours, marqueSaisieValide, progressionParcours, texteBienvenueParcours,
  OBJECTIFS_PARCOURS, PROFILS_PARCOURS, type EtapeAccueilSpatial, type ReponsesParcours,
} from '@tiktrends/core';
import { saveOnboardingAction } from '../../../app/actions/onboarding';
import { getConnectionState } from '../../../app/actions/connections';
import { getDriveState } from '../../../app/actions/drive';
import { createCheckoutAction } from '../../../app/actions/stripe';
import { Ic } from '../../communs/base';
import { LOGOS_CONNECTEURS } from './logos';
import { connecteursDepuis, type ConnecteurParcours } from './connecteurs';

/**
 * Le parcours d'accueil de la maquette (`#onb` · `renderOnb`, `onbBody`,
 * script « Démarrage » · fragments `_onb-*.html`), au DOM exact, sur les
 * VRAIES actions du parcours V5 :
 *  · profil, objectifs, marque et site → `saveOnboardingAction` (crée la
 *    première marque, marque l'espace comme accueilli) · enregistré à la fin de
 *    « Ta marque » (pour que « Tes outils » branche CETTE marque), sinon à la
 *    sortie (« Passer tout », dernière étape) ;
 *  · « Tes outils » → l'état réel des connexions de la marque active
 *    (`getConnectionState`, `getDriveState`) et les vraies portes OAuth
 *    (Meta, Google Drive) ou la page Connexions (Shopify demande sa boutique) ;
 *  · « Ton offre » → le vrai paiement Stripe (`createCheckoutAction`) pour les
 *    formules achetables, et l'offre gratuite réelle de l'espace.
 * Les réponses que la maquette ne repose pas (niveau publicitaire, taille
 * d'équipe) sont REPRISES telles qu'enregistrées, jamais effacées.
 *
 * Échap ne ferme pas · le parcours est une page, « Passer tout » est le geste
 * explicite (il enregistre ce qui a été répondu).
 */

export interface FormuleParcours { cle: string; nom: string; prix: number; lignes: string[]; populaire: boolean }

export interface ParcoursAccueilProps {
  prenom: string;
  etapes: EtapeAccueilSpatial[];
  reponses: ReponsesParcours;
  /** Une marque existe déjà dans l'espace (« Tes outils » sans création). */
  marqueExiste: boolean;
  marqueNom: string | null;
  /** État réel des connexions, si une marque est active au chargement. */
  connecteurs: ConnecteurParcours[] | null;
  offre: { formules: FormuleParcours[]; essai: string; soldeGratuit: number } | null;
  /** Étape affichée au départ (tests) · 0 par défaut. */
  depart?: number;
}


/** Le pied (`obfoot`) des étapes ordinaires. */
function Pied({ i, n, onRetour, onPasser, onPrincipal, occupe }: { i: number; n: number; onRetour: () => void; onPasser: () => void; onPrincipal: () => void; occupe: boolean }) {
  const b = boutonPrincipalParcours(i, n);
  const milieu = !b.fin && i > 0;
  return (
    <footer className="obfoot">
      {i > 0 && <button className="btn icon" type="button" data-obnav="-1" aria-label="Étape précédente" onClick={onRetour}><Ic n="back" /></button>}
      {milieu && <button className="btn" type="button" data-obnav="skip" style={{ marginLeft: 'auto' }} onClick={onPasser} disabled={occupe}>Passer cette étape</button>}
      <button className="btn pri" type="button" data-obnav={b.fin ? 'done' : '1'} style={milieu ? undefined : { marginLeft: 'auto' }} onClick={onPrincipal} disabled={occupe}>
        {occupe ? 'Enregistrement…' : b.libelle}{b.fleche && !occupe && <Ic n="arrow" />}
      </button>
    </footer>
  );
}

function Champ({ id, libelle, children }: { id?: string; libelle: string; children: ReactNode }) {
  return <div className="obfield" id={id}><span>{libelle}</span><div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>{children}</div></div>;
}

export function ParcoursAccueil(p: ParcoursAccueilProps) {
  const router = useRouter();
  const [i, setI] = useState(p.depart ?? 0);
  const [profil, setProfil] = useState(p.reponses.profile);
  const [objectifs, setObjectifs] = useState<string[]>(p.reponses.goals);
  const [nom, setNom] = useState(p.reponses.brandName);
  const [site, setSite] = useState(p.reponses.siteUrl);
  const [enregistre, setEnregistre] = useState(false);
  const [marque, setMarque] = useState(p.marqueExiste);
  const [connecteurs, setConnecteurs] = useState<ConnecteurParcours[] | null>(p.connecteurs);
  const [choix, setChoix] = useState(p.offre?.formules.find((f) => f.populaire)?.cle ?? p.offre?.formules[0]?.cle ?? '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [, demarrer] = useTransition();
  const titre = useRef<HTMLHeadingElement>(null);

  // Une étape « Tes outils » n'a de sens qu'avec une marque · sans elle, sautée.
  const visibles = p.etapes.filter((e) => e !== 'outils' || marque);
  const etape = visibles[Math.min(i, visibles.length - 1)]!;
  const k = Math.min(i, visibles.length - 1);
  const n = visibles.length;

  useEffect(() => { titre.current?.focus(); setErreur(null); }, [k]);
  // « Ton offre » · le mode paiement de la maquette (fond net, rail visible).
  useEffect(() => {
    const pay = etape === 'offre';
    document.body.classList.toggle('onb-pay', pay);
    return () => document.body.classList.remove('onb-pay');
  }, [etape]);
  // Les connexions réelles de la marque, lues en arrivant sur « Tes outils ».
  useEffect(() => {
    if (etape !== 'outils' || connecteurs) return;
    void Promise.all([getConnectionState(), getDriveState()]).then(([c, d]) => setConnecteurs(connecteursDepuis(c, d))).catch(() => setConnecteurs([]));
  }, [etape, connecteurs]);

  async function enregistrer(avecMarque: boolean): Promise<boolean> {
    setOccupe(true); setErreur(null);
    try {
      const r = await saveOnboardingAction({
        profile: profil, goals: objectifs, adLevel: p.reponses.adLevel, teamSize: p.reponses.teamSize,
        brandName: avecMarque ? nom : p.reponses.brandName, siteUrl: avecMarque ? site : p.reponses.siteUrl,
      });
      if (r.error) { setErreur(r.error); return false; }
      setEnregistre(true);
      if (r.brandId) { setMarque(true); setConnecteurs(null); }
      return true;
    } catch {
      setErreur('L’enregistrement a échoué. Réessaie dans un instant.');
      return false;
    } finally { setOccupe(false); }
  }

  async function terminer() {
    if (!enregistre && !(await enregistrer(false))) return;
    router.push('/dashboard');
    router.refresh();
  }

  async function principal() {
    const b = boutonPrincipalParcours(k, n);
    if (etape === 'marque') {
      if (!marqueSaisieValide(nom)) { setErreur('Donne un nom à ta marque pour la créer, ou passe cette étape.'); return; }
      if (!(await enregistrer(true))) return;
    }
    if (b.fin) { await terminer(); return; }
    setI(k + 1);
  }

  const passer = () => { if (etape === 'marque') { setNom(p.reponses.brandName); setSite(p.reponses.siteUrl); } setI(k + 1); };

  async function brancher(href: string) {
    if (!enregistre && !(await enregistrer(false))) return;
    window.location.assign(href);
  }

  function abonner() {
    const f = p.offre?.formules.find((x) => x.cle === choix);
    if (!f) return;
    void (async () => {
      if (!enregistre && !(await enregistrer(false))) return;
      const fd = new FormData(); fd.set('plan', f.cle);
      demarrer(() => createCheckoutAction(fd));
    })();
  }

  const prog = progressionParcours(n, k);
  const large = etape === 'offre';

  return (
    <div className={large ? 'onbwrap paymode' : 'onbwrap'} id="onb">
      <div className={large ? 'onbbox glass pay' : 'onbbox glass'} role="dialog" aria-modal="true" aria-labelledby="obtt">
        <header className="obtop">
          <div className="obprog" aria-hidden="true">{prog.map((c, x) => <i key={x} className={c} />)}</div>
          <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{libelleEtapeParcours(visibles, k)}</span>
          <button className="btn sm" type="button" data-obclose="1" onClick={() => void terminer()} disabled={occupe}>Passer tout</button>
        </header>
        <div className="obbody">
          {etape === 'bienvenue' && (
            <div className="obhero">
              <span className="orb">J</span>
              <h2 id="obtt" ref={titre} tabIndex={-1}>Bienvenue sur TikTrends{p.prenom ? `, ${p.prenom}` : ''}</h2>
              <p>{texteBienvenueParcours(visibles, p.marqueNom)}</p>
              <div className="obpts">
                {[['brush', 'Créer', 'Des pubs dans le style de ton choix'], ['flask', 'Tester', 'Une variable à la fois, avec une règle claire'], ['bulb', 'Apprendre', 'Ce qui marche nourrit tes prochains briefs']].map(([ic, t, d]) => (
                  <div key={t} className="tile"><span className="ico"><Ic n={ic!} s={false} /></span><strong>{t}</strong><small>{d}</small></div>
                ))}
              </div>
            </div>
          )}
          {etape === 'profil' && (
            <>
              <h2 id="obtt" ref={titre} tabIndex={-1}>Tu es plutôt…</h2>
              <p className="obsub">Je m’adapte : vocabulaire, tableaux de bord et suggestions de Jarvis.</p>
              <div className="obgrid">
                {PROFILS_PARCOURS.map((x) => (
                  <button key={x.cle} type="button" className="tile obopt" data-obp={x.cle} aria-pressed={profil === x.cle} onClick={() => setProfil(x.cle)}>
                    <span className="ico"><Ic n={x.icone} s={false} /></span><strong>{x.titre}</strong><small>{x.sous}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {etape === 'objectifs' && (
            <>
              <h2 id="obtt" ref={titre} tabIndex={-1}>Qu’attends-tu de TikTrends ?</h2>
              <p className="obsub">Plusieurs choix possibles. Jarvis priorisera ses recommandations en conséquence.</p>
              <div className="obchips">
                {OBJECTIFS_PARCOURS.map((x) => {
                  const on = objectifs.includes(x.cle);
                  return <button key={x.cle} type="button" className="chip" data-obg={x.cle} aria-pressed={on} onClick={() => setObjectifs((o) => basculerObjectif(o, x.cle))}>{on && <Ic n="check" />}{x.libelle}</button>;
                })}
              </div>
            </>
          )}
          {etape === 'marque' && (
            <>
              <h2 id="obtt" ref={titre} tabIndex={-1}>Ta marque</h2>
              <p className="obsub">On la crée pour toi. Le site est optionnel · tu compléteras la fiche marque ensuite.</p>
              <Champ id="obnomf" libelle="Nom de la marque">
                <input id="obnom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Studio Nova" autoComplete="off" maxLength={120} style={{ flex: 1, minWidth: 0 }} />
              </Champ>
              <Champ libelle="Site de la boutique">
                <input id="obsite" value={site} onChange={(e) => setSite(e.target.value)} placeholder="votreboutique.com" autoComplete="off" maxLength={200} style={{ flex: 1, minWidth: 0 }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void principal(); } }} />
              </Champ>
            </>
          )}
          {etape === 'outils' && (
            <>
              <h2 id="obtt" ref={titre} tabIndex={-1}>Branche tes outils</h2>
              <p className="obsub">Lecture seule, révocable à tout moment. Meta Ads est le plus important : c’est lui qui permet de conclure tes tests.</p>
              <div className="obgrid">
                {connecteurs === null ? <p className="faint" role="status">Lecture de tes connexions…</p> : connecteurs.map((c) => (
                  <div key={c.cle} className={c.connecte ? 'tile obapp on' : 'tile obapp'}>
                    <span className="applogo" style={{ width: 38, height: 38 }}><span style={{ width: 26, height: 26, display: 'block' }} dangerouslySetInnerHTML={{ __html: LOGOS_CONNECTEURS[c.cle] }} /></span>
                    <div style={{ flex: 1, minWidth: 0, display: 'grid' }}><strong>{c.nom}</strong><small className="faint">{c.sous}</small></div>
                    {c.connecte
                      ? <span className="pill g"><Ic n="check" />Connecté</span>
                      : <a className="btn sm pri" href={c.href} data-cconn={c.cle} onClick={(e) => { e.preventDefault(); void brancher(c.href); }}>Connecter</a>}
                  </div>
                ))}
              </div>
            </>
          )}
          {etape === 'offre' && p.offre && (
            <div className="obpay">
              <span className="ob3k">Dernière étape</span>
              <h2 id="obtt" ref={titre} tabIndex={-1}>Continue avec TikTrends</h2>
              <p className="obsub">Teste, itère et apprends ce qui fait vendre {p.marqueNom || 'ta marque'}. {p.offre.essai}</p>
              <div className="obplans">
                {p.offre.formules.map((f) => {
                  const on = choix === f.cle;
                  return (
                    <button key={f.cle} type="button" className={['obpl', on ? 'on' : '', f.populaire ? 'rec' : ''].filter(Boolean).join(' ')} data-obpick={f.cle} aria-pressed={on} onClick={() => setChoix(f.cle)}>
                      {f.populaire && <span className="pill obrec">Populaire</span>}
                      <strong>{f.nom}</strong>
                      <span className="obpp"><b>{f.prix} €</b><small>/ mois HT</small></span>
                      <ul>{f.lignes.map((l) => <li key={l}><Ic n="check" />{l}</li>)}</ul>
                    </button>
                  );
                })}
              </div>
              <button className="btn pri obgo" type="button" data-obstart="1" disabled={occupe || !choix} onClick={abonner}>
                S’abonner · {p.offre.formules.find((f) => f.cle === choix)?.nom ?? ''}<Ic n="arrow" />
              </button>
              <button className="obfree" type="button" data-obfree="1" disabled={occupe} onClick={() => void terminer()}>
                Continuer avec l’offre gratuite · {p.offre.soldeGratuit.toLocaleString('fr-FR')} crédits
              </button>
            </div>
          )}
          {erreur && <p className="faint" role="alert" style={{ margin: '10px 0 0', color: 'var(--warn)' }}>{erreur}</p>}
        </div>
        {etape === 'offre' ? (
          <footer className="obfoot">
            <button className="btn icon" type="button" data-obnav="-1" aria-label="Étape précédente" onClick={() => setI(k - 1)}><Ic n="back" /></button>
            <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>Paiement sécurisé par Stripe · annulable à tout moment</span>
          </footer>
        ) : (
          <Pied i={k} n={n} occupe={occupe} onRetour={() => setI(k - 1)} onPasser={passer} onPrincipal={() => void principal()} />
        )}
      </div>
    </div>
  );
}
