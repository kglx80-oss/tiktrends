'use client';

import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  LONGUEUR_PARTIE_MAX, NOTES_ESTIMATION, VARIABLES_HYPOTHESE, completudeHypothese, composerHypothese, validerSaisieHypothese,
  type DepartHypothese, type EstimationHypothese, type SaisieHypotheseLibre,
} from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';
import { DialogueSpatial } from '../marque/interactifs';
import { pendantAction, FERME } from '../projet/focus';
import { Hypothese } from './communs';

/**
 * Le formulaire d'une hypothèse LIBRE (lot 1 V5) · « Si…, alors…, parce que… »,
 * la variable testée, l'estimation d'équipe (impact, confiance, effort). La
 * complétude se lit en direct (règle du noyau `completudeHypothese`) · rien
 * n'est obligatoire sauf d'écrire quelque chose : « À formuler » est fait pour
 * les phrases incomplètes.
 *
 * Il ne décide rien · il appelle l'action passée (`creerHypotheseAction` ou
 * `completerHypotheseAction`, gardées côté serveur), affiche son refus tel quel
 * et ne dit « rangée » qu'après le oui du serveur. Pendant l'appel, le bouton
 * pressé garde le focus (`aria-disabled` + `aria-busy`, `pendantAction`).
 *
 * Réutilisable · Hypothèses (création, « Compléter la phrase »), détail d'une
 * pub de la Veille, fiche persona, et Apprentissages (lot 3).
 */

type Envoi = (saisie: SaisieHypotheseLibre, choix: string | null) => Promise<{ error?: string }>;

const CHAMP: CSSProperties = {
  width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14,
  background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0,
};
const ETIQUETTE: CSSProperties = { display: 'grid', gap: 4, fontSize: 12.5 };

export interface ChoixDepart {
  /** Le libellé du choix (« Accroche à tester »). */
  libelle: string;
  options: ReadonlyArray<{ valeur: string; libelle: string; depart: DepartHypothese }>;
}

export function FormulaireHypothese({ depart, estimation, envoyer, fermer, enregistrer = 'Ranger dans « À formuler »', reussite = 'Hypothèse rangée dans « À formuler »', note, choix }: {
  depart: DepartHypothese;
  estimation?: EstimationHypothese;
  envoyer: Envoi;
  /** Ferme le formulaire (Annuler, ou après le oui du serveur). */
  fermer: () => void;
  enregistrer?: string;
  reussite?: string;
  /** Une ligne sous le titre · d'où part l'hypothèse, ce que le geste fait en plus. */
  note?: ReactNode;
  /** Un choix de départ (l'accroche d'un persona) · le changer réécrit le « Si… ». */
  choix?: ChoixDepart;
}) {
  const id = useId();
  const router = useRouter();
  const { toast } = useSpatial();
  const [valeurChoix, setValeurChoix] = useState<string | null>(choix?.options[0]?.valeur ?? null);
  const [si, setSi] = useState(depart.parties.si);
  const [alors, setAlors] = useState(depart.parties.alors);
  const [parceQue, setParceQue] = useState(depart.parties.parceQue);
  const [variable, setVariable] = useState<string>(depart.variable ?? '');
  const [impact, setImpact] = useState(estimation?.impact ? String(estimation.impact) : '');
  const [confiance, setConfiance] = useState(estimation?.confiance ? String(estimation.confiance) : '');
  const [effort, setEffort] = useState(estimation?.effort ? String(estimation.effort) : '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const saisie: SaisieHypotheseLibre = { si, alors, parceQue, variable, impact, confiance, effort };
  const c = completudeHypothese({ si, alors, parceQue }, variable);
  const apercu = composerHypothese({ si, alors, parceQue });

  const choisir = (v: string) => {
    setValeurChoix(v);
    const o = choix?.options.find((x) => x.valeur === v);
    if (o) { setSi(o.depart.parties.si); if (o.depart.variable) setVariable(o.depart.variable); }
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (occupe) return;
    const v = validerSaisieHypothese(saisie);
    if (!v.ok) { setErreur(v.erreur); return; }
    setOccupe(true); setErreur(null);
    try {
      const r = await envoyer(saisie, valeurChoix);
      if (r.error) { setErreur(r.error); return; }
      toast(reussite);
      router.refresh();
      fermer();
    } catch {
      setErreur('Échec · vérifie ta connexion puis réessaie.');
    } finally {
      setOccupe(false);
    }
  };

  const partie = (nom: string, libelle: string, valeur: string, maj: (s: string) => void, aide: string) => (
    <label style={ETIQUETTE}>
      <span className="faint"><b>{libelle}</b> · {aide}</span>
      <textarea name={nom} value={valeur} onChange={(e) => maj(e.target.value)} rows={2} maxLength={LONGUEUR_PARTIE_MAX + 20} style={{ ...CHAMP, resize: 'vertical' }} />
    </label>
  );
  const noteEstimation = (nom: 'impact' | 'confiance' | 'effort', libelle: string, valeur: string, maj: (s: string) => void) => (
    <label style={{ ...ETIQUETTE, flex: '1 1 110px' }}>
      <span className="faint">{libelle}</span>
      <select name={nom} value={valeur} onChange={(e) => maj(e.target.value)} style={CHAMP}>
        <option value="">À estimer</option>
        {NOTES_ESTIMATION[nom].map((n, i) => <option key={n} value={String(i + 1)}>{n}</option>)}
      </select>
    </label>
  );

  const presse = pendantAction({ presse: occupe, occupe });
  const autre = pendantAction({ presse: false, occupe });
  return (
    <form onSubmit={soumettre} aria-describedby={`${id}-etat`} style={{ display: 'grid', gap: 10, maxHeight: '70vh', overflowY: 'auto', paddingRight: 2 }}>
      {note && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{note}</p>}
      {choix && choix.options.length > 0 && (
        <label style={ETIQUETTE}>
          <span className="faint">{choix.libelle}</span>
          <select value={valeurChoix ?? ''} onChange={(e) => choisir(e.target.value)} style={CHAMP}>
            {choix.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
          </select>
        </label>
      )}
      {partie('si', 'Si', si, setSi, 'ce qu’on change')}
      {partie('alors', 'alors', alors, setAlors, 'le résultat attendu, mesurable')}
      {partie('parceQue', 'parce que', parceQue, setParceQue, 'la raison, ce qu’on sait déjà')}
      <label style={ETIQUETTE}>
        <span className="faint">Variable testée · une seule à la fois</span>
        <select name="variable" value={variable} onChange={(e) => setVariable(e.target.value)} style={CHAMP}>
          <option value="">À choisir</option>
          {VARIABLES_HYPOTHESE.map((v) => <option key={v.cle} value={v.cle}>{v.libelle}</option>)}
        </select>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <legend className="faint" style={{ fontSize: 12.5, padding: 0, marginBottom: 4 }}>Priorité estimée par l’équipe · une estimation, pas une mesure</legend>
        {noteEstimation('impact', 'Impact', impact, setImpact)}
        {noteEstimation('confiance', 'Confiance', confiance, setConfiance)}
        {noteEstimation('effort', 'Effort', effort, setEffort)}
      </fieldset>
      <div id={`${id}-etat`} aria-live="polite" style={{ display: 'grid', gap: 4 }}>
        {apercu && <p style={{ margin: 0, fontSize: 13 }}><Hypothese texte={apercu} /></p>}
        <span className="faint" style={{ fontSize: 12 }} data-completude={c.complete ? 'complete' : 'incomplete'}>{c.resume}</span>
      </div>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--bad)' }}>{erreur}</p>}
      <div className="pbtns">
        <button className="btn" type="button" onClick={fermer} {...autre}>Annuler</button>
        <button className="btn pri" type="submit" {...presse} style={occupe ? FERME : undefined}>{occupe ? 'Enregistrement…' : enregistrer}</button>
      </div>
    </form>
  );
}

/**
 * Un bouton qui ouvre le formulaire en surcouche (`DialogueSpatial`) · le focus
 * revient au bouton à la fermeture. Fermé (avec sa raison au survol et lue par
 * le lecteur d'écran) quand l'action n'est pas ouverte à la personne.
 */
export function BoutonHypothese({ className, style, children, titre, envoyer, raison, ...form }: {
  className: string; style?: CSSProperties; children: ReactNode; titre: string;
  envoyer: Envoi | null; raison?: string | null;
} & Omit<Parameters<typeof FormulaireHypothese>[0], 'envoyer' | 'fermer'>) {
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const fermer = () => { setOuvert(false); setTimeout(() => bouton.current?.focus(), 0); };
  return (
    <>
      <button ref={bouton} className={className} type="button" style={envoyer ? style : { ...style, ...FERME }}
        aria-disabled={!envoyer || undefined} title={!envoyer ? raison ?? undefined : undefined} aria-haspopup="dialog"
        onClick={() => { if (envoyer) setOuvert(true); }}>
        {children}
      </button>
      {envoyer && (
        <DialogueSpatial titre={titre} ouvert={ouvert} fermer={fermer}>
          <FormulaireHypothese {...form} envoyer={envoyer} fermer={fermer} />
        </DialogueSpatial>
      )}
    </>
  );
}
