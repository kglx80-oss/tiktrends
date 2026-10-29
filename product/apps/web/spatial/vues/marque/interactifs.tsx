'use client';

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FORMATS_LOGO, charteAvecLogoImporte, lienAnnonceurVeille, lignesConfigurationMarque, refusAdresseLogo, refusFichierLogo, type EtapeConfigurationMarque } from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';
import { Anneau, Ic, Lien } from '../../communs';

/**
 * Les briques INTERACTIVES des rubriques Marque et Réglages · chacune appelle
 * une action serveur EXISTANTE (passée en props par la page) et ne dit « c'est
 * fait » qu'une fois l'action revenue sans erreur. Un module client n'exporte
 * que des composants (garde `spatial-fondation`).
 */

/** Le champ de saisie de la maquette (`#invmail`, `#rin`) · styles en ligne repris tels quels. */
const STYLE_CHAMP_SPATIAL: CSSProperties = { flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0 };

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
export function CompleterChamp({ action, valeurs, champ, titre, saisie, aide, libelle = 'Compléter' }: {
  action: ActionFormulaire | null; valeurs: Record<string, string>; champ: string; titre: string; saisie: 'ligne' | 'texte' | 'virgules' | 'lignes'; aide: string;
  /** Le libellé du bouton · « Modifier » pour une valeur déjà remplie. */
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="btn sm" type="button" onClick={() => setOuvert(true)} disabled={!action} title={!action ? 'Réservé aux administrateurs de l’espace' : undefined} aria-label={`${libelle} · ${titre}`}>{libelle}</button>
      <DialogueSpatial titre={titre} ouvert={ouvert} fermer={() => setOuvert(false)}>
        {action && (
          <form action={action} style={{ display: 'grid', gap: 12 }}>
            {Object.entries(valeurs).filter(([k]) => k !== champ).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>{aide}</p>
            {saisie === 'texte'
              ? <textarea name={champ} defaultValue={valeurs[champ] ?? ''} rows={4} autoFocus style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
              : saisie === 'lignes'
                ? <textarea name={champ} defaultValue={valeurs[champ] ?? ''} rows={5} autoFocus placeholder="Une marque par ligne" style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
                : saisie === 'ligne'
                  ? <input name={champ} defaultValue={valeurs[champ] ?? ''} autoFocus required={champ === 'name'} style={STYLE_CHAMP_SPATIAL} />
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

/* ───────────────────────── Logos de la charte ───────────────────────── */

/**
 * Les logos de la charte (repris de l'éditeur V5 `BrandGuidelines`) · ajouter
 * un logo par son adresse, choisir celui par défaut, en retirer un. Enregistré
 * par `saveBrandDAAction` avec les couleurs et polices ACTUELLES (rien d'autre
 * ne change). L'import d'un FICHIER vit sur la carte du logo (`ImportLogo`).
 */
export function LogosCharte({ brandId, logos, defaut, apercus, couleurs, polices, enregistrer }: {
  brandId: string; logos: readonly string[]; defaut: string | null;
  /** L'adresse d'affichage (proxy) de chaque logo connu. */
  apercus: Record<string, string>;
  couleurs: readonly string[]; polices: readonly string[];
  enregistrer: ((i: { brandId: string; logoUrl: string; logos: string[]; colors: string[]; fonts: string[] }) => Promise<{ ok?: true; error?: string }>) | null;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [brouillon, setBrouillon] = useState('');
  const [encours, demarrer] = useTransition();
  const sauver = (logoUrl: string, liste: string[], succes: string) => {
    if (!enregistrer || encours) return;
    demarrer(async () => {
      const r = await enregistrer({ brandId, logoUrl, logos: liste, colors: [...couleurs], fonts: [...polices] }).catch(() => ({ error: 'L’enregistrement a échoué. Réessaie.' }));
      if (r.error) { toast(r.error); return; }
      toast(succes);
      setBrouillon('');
      router.refresh();
    });
  };
  const ferme = !enregistrer ? 'Réservé aux administrateurs de l’espace' : undefined;
  const ajout = brouillon.trim();
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {logos.length === 0
        ? <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>Aucun logo dans la charte · « Récupérer la charte » le lit sur le site, ou ajoute son adresse.</p>
        : (
          <div className="nprefs">
            {logos.map((u) => (
              <div className="npr" key={u}>
                <span className="applogo" style={{ width: 42, height: 42, overflow: 'hidden' }}>{apercus[u] ? <img src={apercus[u]} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} /> : <Ic n="img" />}</span>
                <div><strong style={{ overflowWrap: 'anywhere' }}>{u.replace(/^https?:\/\//, '')}</strong><small>{u === defaut ? 'Logo par défaut' : 'Variante'}</small></div>
                {u === defaut
                  ? <span className="pill g"><Ic n="check" />Par défaut</span>
                  : <button className="btn sm" type="button" disabled={!!ferme || encours} title={ferme} onClick={() => sauver(u, [...logos], 'Logo par défaut enregistré')}>Par défaut</button>}
                <button className="btn sm icon" type="button" aria-label={`Retirer le logo ${u}`} disabled={!!ferme || encours} title={ferme}
                  onClick={() => sauver(u === defaut ? (logos.find((x) => x !== u) ?? '') : (defaut ?? ''), logos.filter((x) => x !== u), 'Logo retiré de la charte')}><Ic n="x" /></button>
              </div>
            ))}
          </div>
        )}
      <form style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} onSubmit={(e) => {
        e.preventDefault();
        // Même règle que le serveur (`saveBrandDAAction`) · dite avant l'envoi.
        const refus = refusAdresseLogo(ajout);
        if (refus) { toast(refus); return; }
        if (logos.includes(ajout)) { toast('Ce logo est déjà dans la charte'); return; }
        sauver(defaut || ajout, [...logos, ajout], 'Logo ajouté à la charte');
      }}>
        <input value={brouillon} onChange={(e) => setBrouillon(e.target.value)} placeholder="https://…/logo.png" aria-label="Adresse d’un logo" disabled={!!ferme} style={STYLE_CHAMP_SPATIAL} />
        <button className="btn sm" type="submit" disabled={!!ferme || encours || !ajout} title={ferme}><Ic n="plus" />Ajouter</button>
      </form>
    </div>
  );
}

/* ───────────────────────── Style visuel · correction ───────────────────────── */

export interface ChampStyleVisuel { nom: string; libelle: string; valeur: string; exemple: string }

/**
 * « Corriger » le style déduit du site · `saveBrandVisualDaAction` (aucun
 * crédit, ta version prime sur celle de l'agent). Une surcouche, comme
 * « Compléter ».
 */
export function CorrigerStyle({ action, brandId, champs }: { action: ActionFormulaire | null; brandId: string; champs: readonly ChampStyleVisuel[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="btn sm" type="button" onClick={() => setOuvert(true)} disabled={!action} title={!action ? 'Réservé aux administrateurs de l’espace' : undefined}>Corriger</button>
      <DialogueSpatial titre="Corriger le style déduit" ouvert={ouvert} fermer={() => setOuvert(false)}>
        {action && (
          <form action={action} style={{ display: 'grid', gap: 10 }}>
            <input type="hidden" name="brandId" value={brandId} />
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Ta version prime sur celle de l’agent · aucun crédit. Sépare les éléments « à éviter » par une virgule ou un retour à la ligne.</p>
            {champs.map((c) => (
              <label key={c.nom} style={{ display: 'grid', gap: 4 }}>
                <span className="lbl" style={{ margin: 0 }}>{c.libelle}</span>
                <textarea name={c.nom} defaultValue={c.valeur} rows={2} placeholder={c.exemple} style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
              </label>
            ))}
            <div className="pbtns"><button className="btn" type="button" onClick={() => setOuvert(false)}>Annuler</button><button className="btn pri" type="submit">Enregistrer le style</button></div>
          </form>
        )}
      </DialogueSpatial>
    </>
  );
}

/* ───────────────────────── Supprimer (confirmé) ───────────────────────── */

/**
 * Un bouton de suppression d'une action serveur à formulaire EXISTANTE
 * (marque, persona, scénario, produit) · confirmé avant l'envoi, comme l'écran
 * V5 (`ConfirmButton`). Le serveur garde ses refus (ex. marque qui porte un
 * historique Studios).
 */
export function SupprimerConfirme({ action, champs, confirmation, className = 'btn sm icon', libelle, children }: {
  action: ActionFormulaire | null; champs: Record<string, string>; confirmation: string; className?: string; libelle: string; children: ReactNode;
}) {
  const [encours, demarrer] = useTransition();
  return (
    <button className={className} type="button" aria-label={libelle} disabled={!action || encours} title={!action ? 'Réservé aux administrateurs de l’espace' : undefined}
      onClick={() => {
        if (!action || encours || !window.confirm(confirmation)) return;
        const fd = new FormData();
        for (const [k, v] of Object.entries(champs)) fd.set(k, v);
        demarrer(async () => { await action(fd); });
      }}>{children}</button>
  );
}

/* ───────────────────────── Boutique Shopify de la marque ───────────────────────── */

/**
 * Brancher (ou changer) la boutique Shopify de la marque par son domaine ·
 * `syncShopifyProductsAction` importe produits, images et prix (repris de
 * l'écran V5 `ShopifyConnect`, aucune installation). Le résultat RÉEL est dit.
 */
export function BoutiqueShopify({ brandId, domaine, synchroniser }: {
  brandId: string; domaine: string | null;
  synchroniser: ((i: { brandId: string; domain?: string }) => Promise<{ imported?: number; updated?: number; error?: string }>) | null;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [valeur, setValeur] = useState(domaine ?? '');
  const [encours, demarrer] = useTransition();
  return (
    <form style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} onSubmit={(e) => {
      e.preventDefault();
      if (!synchroniser || encours) return;
      demarrer(async () => {
        const r = await synchroniser({ brandId, domain: valeur.trim() || undefined }).catch(() => ({ error: 'La synchronisation a échoué. Réessaie.' } as { imported?: number; updated?: number; error?: string }));
        if (r.error) { toast(r.error); return; }
        toast(`Boutique synchronisée · ${r.imported ?? 0} produit${(r.imported ?? 0) > 1 ? 's' : ''} ajouté${(r.imported ?? 0) > 1 ? 's' : ''}, ${r.updated ?? 0} mis à jour`);
        router.refresh();
      });
    }}>
      <input value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder="ta-boutique.com ou ta-boutique.myshopify.com" aria-label="Domaine de la boutique Shopify" disabled={!synchroniser || encours} style={STYLE_CHAMP_SPATIAL} />
      <button className="btn sm pri" type="submit" disabled={!synchroniser || encours} title={!synchroniser ? 'Réservé aux administrateurs de l’espace' : undefined}><Ic n="loop" />{encours ? 'Synchronisation…' : domaine ? 'Synchroniser' : 'Connecter'}</button>
    </form>
  );
}

/* ───────────────────────── Concurrents · pistes de Jarvis ───────────────────────── */

/**
 * « Trouver mes concurrents avec Jarvis » (repris de l'écran V5
 * `ConcurrentSourcing`) · `proposerConcurrents` (appel IA payant, prix sur le
 * bouton, barrière `guardedAnthropic`) propose des pistes NON vérifiées ;
 * rien n'est ajouté sans sélection explicite (`ajouterConcurrents`, gratuit,
 * additif).
 */
export function SourcingConcurrents({ brandId, prix, proposer, ajouter, raison }: {
  brandId: string; prix: string;
  proposer: ((brandId: string, contexte: string) => Promise<{ names: string[] } | { error: string }>) | null;
  ajouter: ((brandId: string, selection: string[]) => Promise<{ ok: true } | { error: string }>) | null;
  raison: string | null;
}) {
  const router = useRouter();
  const [contexte, setContexte] = useState('');
  const [pistes, setPistes] = useState<string[]>([]);
  const [choix, setChoix] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [encours, demarrer] = useTransition();
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <textarea value={contexte} onChange={(e) => { setContexte(e.target.value); setPistes([]); setChoix([]); setMessage(''); }} maxLength={1200} rows={3} disabled={encours}
        aria-label="Quel type de concurrent recherches-tu ?" placeholder="Ex. soins capillaires naturels, cible 25-40 ans, prix moyen" style={{ ...STYLE_CHAMP_SPATIAL, resize: 'vertical' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button className="btn sm pri" type="button" disabled={!proposer || encours} title={!proposer ? raison ?? undefined : undefined} onClick={() => demarrer(async () => {
          if (!proposer) return;
          setMessage('');
          try {
            const r = await proposer(brandId, contexte);
            if ('error' in r) { setMessage(r.error); return; }
            setPistes(r.names); setChoix([]);
            setMessage(r.names.length ? 'Pistes non vérifiées : consulte leurs annonces, puis sélectionne les marques pertinentes.' : 'Aucune nouvelle piste proposée. Précise ton marché ou ajoute un concurrent à la main.');
          } catch { setMessage('Réponse interrompue. Vérifie ton solde avant de réessayer : l’appel a pu être facturé.'); }
        })}><Ic n="spark" />{encours ? 'Jarvis travaille…' : `Proposer des concurrents · ${prix}`}</button>
        <span className="faint" style={{ fontSize: 12 }}>{proposer ? 'Un clic lance un appel IA. Aucun ajout automatique.' : raison}</span>
      </div>
      {message && <p role="status" className="muted" style={{ fontSize: 13, margin: 0 }}>{message}</p>}
      {pistes.length > 0 && (
        <div className="nprefs">
          {pistes.map((n) => (
            <label className="npr" key={n} style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={choix.includes(n)} disabled={encours} onChange={(e) => setChoix((c) => (e.target.checked ? [...c, n] : c.filter((x) => x !== n)))} />
              <div><strong style={{ overflowWrap: 'anywhere' }}>{n}</strong><small>Piste non vérifiée</small></div>
              <a className="btn sm" href={lienAnnonceurVeille({ advertiserName: n, platform: 'meta' }, '') ?? '/veille'} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Voir ses annonces</a>
            </label>
          ))}
          <button className="btn sm" type="button" disabled={!ajouter || encours || choix.length === 0} onClick={() => demarrer(async () => {
            if (!ajouter) return;
            try {
              const r = await ajouter(brandId, choix);
              if ('error' in r) { setMessage(r.error); return; }
              setPistes([]); setChoix([]); setMessage('Sélection ajoutée. Tes concurrents existants sont conservés.'); router.refresh();
            } catch { setMessage('Ajout non confirmé. Recharge la fiche avant de réessayer.'); }
          })}><Ic n="plus" />Ajouter la sélection · sans appel IA</button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Importer un fichier de logo ───────────────────────── */

/**
 * Le dépôt direct dans le bucket de l'espace (adresse présignée) · même envoi
 * que la Bibliothèque, avec le `Content-Type` retenu et SIGNÉ par le serveur.
 */
async function deposerDansLeBucket(url: string, f: File, contentType: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: f });
    return r.ok;
  } catch { return false; }
}

export interface ImportLogoActions {
  /** `presignAssetUploadAction` · le dépôt du fichier dans le bucket de l'espace. */
  preparer: (i: { filename: string; contentType: string; sizeBytes: number }) => Promise<{ uploadUrl?: string; publicUrl?: string; contentType?: string; error?: string }>;
  /** `saveBrandDAAction` · la charte, couleurs et polices renvoyées telles quelles. */
  enregistrer: (i: { brandId: string; logoUrl: string; logos: string[]; colors: string[]; fonts: string[] }) => Promise<{ ok?: true; error?: string }>;
}

/**
 * « Importer » de la carte du logo (`favCard`) · le fichier choisi est déposé
 * dans le bucket de l'espace (`presignAssetUploadAction`), puis devient le logo
 * par défaut de la charte (`saveBrandDAAction`, règle `charteAvecLogoImporte`) ·
 * les logos déjà là restent en variantes. La réussite ne se dit qu'après le oui
 * du serveur. Fermé, avec sa raison, sans droit ou sans stockage.
 */
export function ImportLogo({ brandId, logos, defaut, couleurs, polices, actions, raison }: {
  brandId: string; logos: readonly string[]; defaut: string | null; couleurs: readonly string[]; polices: readonly string[];
  actions: ImportLogoActions | null; raison: string | null;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [encours, demarrer] = useTransition();
  const ferme = !actions || !!raison;
  const choisir = (f: File | undefined) => {
    if (ferme || encours || !f) return;
    const refus = refusFichierLogo({ type: f.type, taille: f.size });
    if (refus) { toast(refus); return; }
    demarrer(async () => {
      const pre = await actions!.preparer({ filename: f.name, contentType: f.type, sizeBytes: f.size }).catch(() => ({ error: 'Le téléversement a échoué. Réessaie.' } as { uploadUrl?: string; publicUrl?: string; contentType?: string; error?: string }));
      if (pre.error || !pre.uploadUrl || !pre.publicUrl || !pre.contentType) { toast(pre.error ?? 'Le téléversement a échoué. Réessaie.'); return; }
      if (!(await deposerDansLeBucket(pre.uploadUrl, f, pre.contentType))) { toast('Le fichier n’a pas pu être envoyé · rien n’a changé dans la charte. Réessaie.'); return; }
      const charte = charteAvecLogoImporte({ logos, defaut }, pre.publicUrl);
      const r = await actions!.enregistrer({ brandId, ...charte, colors: [...couleurs], fonts: [...polices] }).catch(() => ({ error: 'L’enregistrement a échoué. Réessaie.' }));
      if (r.error) { toast(r.error); return; }
      toast('Logo importé · il devient le logo par défaut de la charte');
      router.refresh();
    });
  };
  return (
    <label className="btn sm" aria-disabled={ferme || undefined} aria-busy={encours || undefined} title={ferme ? raison ?? 'Réservé aux administrateurs de l’espace' : 'Importer un fichier de logo (png, jpg, webp)'}>
      <Ic n="down" />{encours ? 'Import…' : 'Importer'}<input type="file" accept={FORMATS_LOGO.join(',')} hidden disabled={ferme || encours} onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}
