'use client';

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { lignesConfigurationMarque, type EtapeConfigurationMarque } from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';
import { Anneau, Ic, Lien } from '../../communs';

/**
 * Les briques INTERACTIVES des rubriques Marque et Réglages · chacune appelle
 * une action serveur EXISTANTE (passée en props par la page) et ne dit « c'est
 * fait » qu'une fois l'action revenue sans erreur. Un module client n'exporte
 * que des composants (garde `spatial-fondation`).
 */

/** Le champ de saisie de la maquette (`#invmail`, `#rin`) · styles en ligne repris tels quels. */
const STYLE_CHAMP_SPATIAL: CSSProperties = { flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: '#fff', font: '500 13px var(--sf)', outline: 0 };

/* ───────────────────────── Dialogue ───────────────────────── */

/**
 * La surcouche de la maquette (`#paywin` · `.paywrap > .paybox.glass`). Rendue
 * seulement ouverte · le balisage de l'écran, comparé à la maquette, n'en
 * contient rien tant qu'on ne l'a pas demandée.
 */
export function DialogueSpatial({ titre, ouvert, fermer, children }: { titre: string; ouvert: boolean; fermer: () => void; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!ouvert) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ouvert, fermer]);
  if (!ouvert) return null;
  return (
    <div className="paywrap" onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div className="paybox glass" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{titre}</h2>
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Bouton → action serveur ───────────────────────── */

type ActionFormulaire = (fd: FormData) => Promise<void>;

/**
 * Un bouton de la maquette qui déclenche une action serveur à formulaire
 * (celles qui redirigent · génération du profil, abonnement, révocation). Les
 * champs cachés partent avec. Désactivé (avec sa raison) quand l'action manque.
 */
export function BoutonServeur({ action, champs = {}, className, style, children, raison, attente, ...a11y }: {
  action: ActionFormulaire | null; champs?: Record<string, string>; className: string; style?: CSSProperties; children: ReactNode;
  /** Pourquoi le bouton est désactivé (infobulle). */ raison?: string | null;
  /** Le libellé pendant l'appel. */ attente?: string;
  'aria-label'?: string;
}) {
  const [encours, demarrer] = useTransition();
  const clic = () => {
    if (!action || encours) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) fd.set(k, v);
    demarrer(async () => { await action(fd); });
  };
  return (
    <button className={className} type="button" style={style} onClick={clic} disabled={!action || encours} title={!action ? raison ?? undefined : undefined} aria-busy={encours || undefined} {...a11y}>
      {encours && attente ? attente : children}
    </button>
  );
}

/**
 * Un bouton qui appelle une action serveur « à objet » (`{ error }` en retour) ·
 * la réussite ne s'annonce qu'au retour, avec le message RÉEL, puis la page se
 * relit. `succes` est le texte affiché quand l'action n'a pas d'erreur.
 */
export function BoutonAppel<A>({ appel, argument, succes, className, style, children, raison, attente }: {
  appel: ((a: A) => Promise<{ error?: string }>) | null; argument: A; succes: string; className: string; style?: CSSProperties; children: ReactNode; raison?: string | null; attente?: string;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [encours, demarrer] = useTransition();
  const clic = () => {
    if (!appel || encours) return;
    demarrer(async () => {
      const r = await appel(argument).catch(() => ({ error: 'L’action a échoué. Réessaie.' }));
      if (r?.error) { toast(r.error); return; }
      toast(succes);
      router.refresh();
    });
  };
  return (
    <button className={className} type="button" style={style} onClick={clic} disabled={!appel || encours} title={!appel ? raison ?? undefined : undefined} aria-busy={encours || undefined}>
      {encours && attente ? attente : children}
    </button>
  );
}

/* ───────────────────────── Retour d'une redirection ───────────────────────── */

/**
 * Le message d'une action serveur qui a redirigé (`?ok=` / `?e=`) · annoncé UNE
 * fois par le toast de la coquille. Le texte vient de la page (règle du noyau).
 */
export function AnnonceRetour({ messages }: { messages: Record<string, string> }) {
  const { toast } = useSpatial();
  const params = useSearchParams();
  const fait = useRef<string | null>(null);
  const cle = `${params?.get('ok') ?? ''}|${params?.get('e') ?? ''}`;
  useEffect(() => {
    if (fait.current === cle) return;
    fait.current = cle;
    const m = messages[`e:${params?.get('e') ?? ''}`] ?? messages[`ok:${params?.get('ok') ?? ''}`];
    if (m) toast(m);
  }, [cle, messages, params, toast]);
  return null;
}

/* ───────────────────────── Carte « Finis de configurer » ───────────────────────── */

export function CarteConfiguration({ marque, etapes, faites, total, part, questionnaire }: {
  marque: string; etapes: EtapeConfigurationMarque[]; faites: number; total: number; part: number; questionnaire: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const lignes = lignesConfigurationMarque(etapes, ouvert);
  return (
    <section className="tile cfgc inm">
      <div className="cfgh">
        <Anneau part={part} taille={64} libelle={`${faites}/${total}`} classe="g" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="ob3k" style={{ marginBottom: 4 }}>Configuration · {part} %</span>
          <h2>Finis de configurer {marque}</h2>
          <p>Jarvis n’invente rien : plus la configuration est complète, plus ses propositions sont justes.</p>
        </div>
        <div className="kc">
          {questionnaire
            ? <Lien className="btn sm" href={questionnaire}><Ic n="spark" />Questionnaire</Lien>
            : <button className="btn sm" type="button" disabled title="Le questionnaire n’est pas ouvert à ton rôle"><Ic n="spark" />Questionnaire</button>}
        </div>
      </div>
      <div className="cfgl">
        {lignes.map((l) => (
          <div className={`cfgi ${l.faite ? 'ok' : ''}`} key={l.cle}>
            <span className="cfgb">{l.faite ? <Ic n="check" /> : null}</span>
            <div><strong>{l.titre}</strong>{!l.faite && l.detail ? <small>{l.detail}</small> : null}</div>
            {!l.faite && l.href ? <Lien className={`btn sm ${l.principale ? 'pri' : ''}`} href={l.href}>{l.action}</Lien> : null}
          </div>
        ))}
      </div>
      <button type="button" className="cfgm" onClick={() => setOuvert((o) => !o)}>{ouvert ? 'Masquer les étapes terminées' : `Voir les ${total} étapes`}</button>
    </section>
  );
}

/* ───────────────────────── Compléter un champ de la fiche ───────────────────────── */

/**
 * « Compléter » une ligne de la fiche · une surcouche avec le champ, envoyée à
 * `updateBrandAction` (l'action existante de la fiche V5). Les AUTRES champs
 * partent tels quels, en caché · rien n'est écrasé.
 */
export function CompleterChamp({ action, valeurs, champ, titre, saisie, aide }: {
  action: ActionFormulaire | null; valeurs: Record<string, string>; champ: string; titre: string; saisie: 'texte' | 'virgules' | 'lignes'; aide: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="btn sm" type="button" onClick={() => setOuvert(true)} disabled={!action} title={!action ? 'Réservé aux administrateurs de l’espace' : undefined}>Compléter</button>
      <DialogueSpatial titre={titre} ouvert={ouvert} fermer={() => setOuvert(false)}>
        {action && (
          <form action={action} style={{ display: 'grid', gap: 12 }}>
            {Object.entries(valeurs).filter(([k]) => k !== champ).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>{aide}</p>
            {saisie === 'texte'
              ? <textarea name={champ} defaultValue={valeurs[champ] ?? ''} rows={4} autoFocus style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
              : saisie === 'lignes'
                ? <textarea name={champ} defaultValue={valeurs[champ] ?? ''} rows={5} autoFocus placeholder="Une marque par ligne" style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
                : <input name={champ} defaultValue={valeurs[champ] ?? ''} autoFocus placeholder="Séparés par des virgules" style={STYLE_CHAMP_SPATIAL} />}
            <div className="pbtns"><button className="btn" type="button" onClick={() => setOuvert(false)}>Annuler</button><button className="btn pri" type="submit">Enregistrer</button></div>
          </form>
        )}
      </DialogueSpatial>
    </>
  );
}

/* ───────────────────────── Ajouter des assets ───────────────────────── */

const lireFichier = (f: File) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error); r.readAsDataURL(f); });

/**
 * La case « Ajouter » des assets (`label.asadd`) · téléverse les images choisies
 * dans la Bibliothèque de la marque ACTIVE (`uploadImageAssetsAction`). Fermée
 * (avec sa raison) quand la marque affichée n'est pas l'active.
 */
export function AjoutAssets({ televerser, raison }: {
  televerser: ((i: { items: Array<{ name: string; dataUri: string }> }) => Promise<{ ok?: true; count?: number; error?: string }>) | null; raison: string | null;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [encours, demarrer] = useTransition();
  const choisir = (fs: FileList | null) => {
    if (!televerser || !fs || fs.length === 0) return;
    demarrer(async () => {
      const items = await Promise.all([...fs].filter((f) => f.type.startsWith('image/')).map(async (f) => ({ name: f.name, dataUri: await lireFichier(f) })));
      if (!items.length) { toast('Formats acceptés : jpg, png, webp.'); return; }
      const r: { count?: number; error?: string } = await televerser({ items }).catch(() => ({ error: 'Le téléversement a échoué. Réessaie.' }));
      if (r.error) { toast(r.error); return; }
      const n = r.count ?? items.length;
      toast(`${n} image${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} à la Bibliothèque`);
      router.refresh();
    });
  };
  return (
    <label className="asadd" title={televerser ? 'Ajouter des images à la Bibliothèque de la marque' : raison ?? undefined} aria-disabled={!televerser || undefined} aria-busy={encours || undefined}>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={!televerser || encours} onChange={(e) => { choisir(e.target.files); e.target.value = ''; }} />
      <Ic n="plus" s={false} /><span>{encours ? 'Envoi…' : 'Ajouter'}</span>
    </label>
  );
}

/* ───────────────────────── Formulaire en surcouche ───────────────────────── */

export interface ChampSurcouche { nom: string; libelle: string; requis?: boolean; long?: boolean; aide?: string }

/**
 * Un bouton de la maquette qui ouvre un formulaire branché sur une action
 * serveur EXISTANTE (ajout d'un persona, d'un produit, d'un scénario).
 */
export function FormulaireSurcouche({ action, cache, champs, titre, intro, envoyer, className, style, children, raison, href }: {
  action: ActionFormulaire | null; cache: Record<string, string>; champs: ChampSurcouche[]; titre: string; intro?: string; envoyer: string;
  className: string; style?: CSSProperties; children: ReactNode; raison?: string | null;
  /** La maquette pose un lien (`a.btn`) · on garde la balise. */ href?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ouvrir = (e: React.MouseEvent) => { e.preventDefault(); if (action) setOuvert(true); };
  return (
    <>
      {href
        ? <a className={className} href={href} style={style} onClick={ouvrir} aria-disabled={!action || undefined} title={!action ? raison ?? undefined : undefined}>{children}</a>
        : <button className={className} type="button" style={style} onClick={ouvrir} disabled={!action} title={!action ? raison ?? undefined : undefined}>{children}</button>}
      <DialogueSpatial titre={titre} ouvert={ouvert} fermer={() => setOuvert(false)}>
        {action && (
          <form action={action} style={{ display: 'grid', gap: 10 }}>
            {Object.entries(cache).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {intro && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{intro}</p>}
            {champs.map((c, i) => (
              <label key={c.nom} style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                <span className="faint">{c.libelle}{c.aide ? ` · ${c.aide}` : ''}</span>
                {c.long
                  ? <textarea name={c.nom} required={c.requis} rows={3} autoFocus={i === 0} style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
                  : <input name={c.nom} required={c.requis} autoFocus={i === 0} style={STYLE_CHAMP_SPATIAL} />}
              </label>
            ))}
            <div className="pbtns"><button className="btn" type="button" onClick={() => setOuvert(false)}>Annuler</button><button className="btn pri" type="submit">{envoyer}</button></div>
          </form>
        )}
      </DialogueSpatial>
    </>
  );
}
