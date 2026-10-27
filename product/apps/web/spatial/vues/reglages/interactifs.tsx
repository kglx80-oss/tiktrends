'use client';

import { useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * Les briques INTERACTIVES des Réglages · elles appellent les actions serveur
 * EXISTANTES (connexions, invitations, Stripe) passées en props, et n'annoncent
 * une réussite qu'au retour sans erreur. Un module client n'exporte que des
 * composants (garde `spatial-fondation`).
 */

const CHAMP: CSSProperties = { flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: '#fff', font: '500 13px var(--sf)', outline: 0 };

type Resultat = { ok?: true; error?: string };

/** Copier un lien (invitation) · le presse-papiers du navigateur, rien côté serveur. */
export function CopierLien({ lien, className = 'btn sm', children }: { lien: string; className?: string; children: ReactNode }) {
  const { toast } = useSpatial();
  return (
    <button className={className} type="button" onClick={() => {
      void navigator.clipboard?.writeText(lien).then(() => toast('Lien d’invitation copié')).catch(() => toast('Copie impossible · sélectionne le lien à la main.'));
    }}>{children}</button>
  );
}

/**
 * Une carte de la maquette (`div.bcard`) qui mène quelque part · la fiche d'une
 * marque, ou la création réelle d'une marque. Garde la balise de la maquette.
 */
export function CarteNavigable({ href, style, role = 'link', children }: { href: string; style?: CSSProperties; role?: 'link' | 'button'; children: ReactNode }) {
  const router = useRouter();
  const aller = () => router.push(href);
  return (
    <div className="bcard" role={role} tabIndex={0} style={style} onClick={aller} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aller(); } }}>{children}</div>
  );
}

/* ───────────────────────── Connexions ───────────────────────── */

export interface ActionsConnexionMeta {
  oauth: boolean;
  connecter: (i: { adAccountId: string; token: string }) => Promise<{ ok?: true; accountName?: string; error?: string }>;
  synchroniser: () => Promise<Resultat & { insights?: unknown }>;
  deconnecter: () => Promise<Resultat>;
  choisirCompte: (id: string) => Promise<{ ok?: true; accountName?: string; error?: string }>;
  comptes: ReadonlyArray<{ id: string; name: string }>;
  compte: string | null;
}

export interface ActionsConnexionShopify {
  oauth: boolean;
  connecter: (i: { domain: string; token: string }) => Promise<{ ok?: true; shopName?: string; error?: string }>;
  synchroniser: () => Promise<Resultat & { insights?: unknown }>;
  deconnecter: () => Promise<Resultat>;
  domaine: string | null;
}

export interface ActionsConnexionDrive {
  /** L'adresse OAuth réelle (`/api/oauth/google`) · `null` quand Google n'est pas configuré. */
  connexion: string | null;
  synchroniser: () => Promise<{ ok?: true; added?: number; error?: string }>;
  deconnecter: () => Promise<Resultat>;
  dossier: string | null;
}

/**
 * Les boutons d'une carte de connexion (`.cx .kc`) · branchés sur les actions
 * de `app/actions/connections.ts` et `app/actions/drive.ts`. Sans marque active
 * (les connexions sont par marque), tout est fermé avec la raison.
 */
export function BoutonsConnexion({ cle, nom, connecte, raison, meta, shopify, drive }: {
  cle: 'meta' | 'shopify' | 'gdrive' | 'dropbox'; nom: string; connecte: boolean; raison: string | null;
  meta?: ActionsConnexionMeta; shopify?: ActionsConnexionShopify; drive?: ActionsConnexionDrive;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [encours, demarrer] = useTransition();
  const [dialogue, setDialogue] = useState(false);
  const appeler = (f: () => Promise<{ error?: string }>, succes: (r: Record<string, unknown>) => string) => demarrer(async () => {
    const r = await f().catch(() => ({ error: 'L’action a échoué. Réessaie.' }));
    if (r.error) { toast(r.error); return; }
    toast(succes(r as Record<string, unknown>));
    setDialogue(false);
    router.refresh();
  });
  const ferme = raison ?? (cle === 'dropbox' ? 'Connecteur Dropbox pas encore disponible' : null);
  const sync = cle === 'meta' ? meta?.synchroniser : cle === 'shopify' ? shopify?.synchroniser : drive?.synchroniser;
  const deco = cle === 'meta' ? meta?.deconnecter : cle === 'shopify' ? shopify?.deconnecter : drive?.deconnecter;

  if (!connecte) {
    if (ferme) return <div className="kc" style={{ marginTop: 'auto' }}><button className="btn pri" type="button" disabled title={ferme}>Connecter {nom}</button></div>;
    if (cle === 'meta' && meta?.oauth) return <div className="kc" style={{ marginTop: 'auto' }}><a className="btn pri" href="/api/oauth/meta">Connecter {nom}</a></div>;
    if (cle === 'gdrive') return <div className="kc" style={{ marginTop: 'auto' }}>{drive?.connexion ? <a className="btn pri" href={drive.connexion}>Connecter {nom}</a> : <button className="btn pri" type="button" disabled title="Google Drive n’est pas configuré sur le serveur">Connecter {nom}</button>}</div>;
  }

  return (
    <div className="kc" style={{ marginTop: 'auto' }}>
      {connecte ? (
        <>
          {cle === 'gdrive'
            ? <a className="btn sm" href="/assets">Gérer</a>
            : <button className="btn sm" type="button" onClick={() => setDialogue(true)} disabled={!!ferme} title={ferme ?? undefined}>Gérer</button>}
          <button className="btn sm" type="button" disabled={!!ferme || !sync || encours} title={ferme ?? undefined} onClick={() => sync && appeler(sync, (r) => (cle === 'gdrive' && typeof r.added === 'number' ? `${nom} synchronisé · ${r.added} nouveau${(r.added as number) > 1 ? 'x' : ''} fichier${(r.added as number) > 1 ? 's' : ''}` : `${nom} synchronisé`))}><Ic n="loop" />{encours ? 'Synchronisation…' : 'Synchroniser'}</button>
          <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} disabled={!!ferme || !deco || encours} title={ferme ?? undefined} onClick={() => deco && appeler(deco, () => `${nom} déconnecté`)}>Déconnecter</button>
        </>
      ) : (
        <button className="btn pri" type="button" onClick={() => setDialogue(true)}>Connecter {nom}</button>
      )}
      <DialogueSpatial titre={connecte ? nom : `Connecter ${nom}`} ouvert={dialogue} fermer={() => setDialogue(false)}>
        {cle === 'meta' && meta && (connecte ? <GererMeta meta={meta} appeler={appeler} /> : <FormMeta meta={meta} appeler={appeler} />)}
        {cle === 'shopify' && shopify && (connecte
          ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>Boutique {shopify.domaine ?? 'connectée'} · accès en lecture seule. Synchronise pour remonter les ventes, ou déconnecte depuis la carte.</p>
          : <FormShopify shopify={shopify} appeler={appeler} />)}
        <div className="pbtns"><button className="btn" type="button" onClick={() => setDialogue(false)}>Fermer</button></div>
      </DialogueSpatial>
    </div>
  );
}

type Appeler = (f: () => Promise<{ error?: string }>, succes: (r: Record<string, unknown>) => string) => void;

function FormMeta({ meta, appeler }: { meta: ActionsConnexionMeta; appeler: Appeler }) {
  const [compte, setCompte] = useState('');
  const [jeton, setJeton] = useState('');
  return (
    <form style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); appeler(() => meta.connecter({ adAccountId: compte.trim(), token: jeton.trim() }), (r) => `Meta Ads connecté${r.accountName ? ` · ${r.accountName}` : ''}`); }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>TikTrends lit tes résultats en lecture seule. Colle l’identifiant du compte publicitaire et un jeton d’accès Meta Marketing.</p>
      <input value={compte} onChange={(e) => setCompte(e.target.value)} placeholder="act_1234567890" aria-label="Compte publicitaire" required style={CHAMP} />
      <input value={jeton} onChange={(e) => setJeton(e.target.value)} type="password" autoComplete="off" placeholder="Jeton d’accès" aria-label="Jeton d’accès" required style={CHAMP} />
      <button className="btn pri" type="submit">Autoriser l’accès</button>
    </form>
  );
}

function GererMeta({ meta, appeler }: { meta: ActionsConnexionMeta; appeler: Appeler }) {
  return (
    <div className="nprefs">
      {meta.comptes.length === 0 && <div className="npr"><div><strong>{meta.compte ?? 'Compte publicitaire'}</strong><small>Compte Meta Ads de la marque</small></div></div>}
      {meta.comptes.map((c) => (
        <div className="npr" key={c.id}>
          <div><strong>{c.name}</strong><small>{c.id}</small></div>
          {c.id === meta.compte
            ? <span className="pill g"><Ic n="check" />Utilisé</span>
            : <button className="btn sm" type="button" onClick={() => appeler(() => meta.choisirCompte(c.id), (r) => `Compte choisi${r.accountName ? ` · ${r.accountName}` : ''}`)}>Utiliser</button>}
        </div>
      ))}
    </div>
  );
}

function FormShopify({ shopify, appeler }: { shopify: ActionsConnexionShopify; appeler: Appeler }) {
  const [domaine, setDomaine] = useState('');
  const [jeton, setJeton] = useState('');
  return (
    <form style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); appeler(() => shopify.connecter({ domain: domaine.trim(), token: jeton.trim() }), (r) => `Shopify connecté${r.shopName ? ` · ${r.shopName}` : ''}`); }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Le domaine de ta boutique (ta-marque.myshopify.com). {shopify.oauth ? 'Connexion en un clic, ou avec un jeton Admin API.' : 'Colle un jeton Admin API en lecture.'}</p>
      <input value={domaine} onChange={(e) => setDomaine(e.target.value)} placeholder="ta-marque.myshopify.com" aria-label="Domaine Shopify" required style={CHAMP} />
      {shopify.oauth && <button className="btn" type="button" disabled={!domaine.trim()} onClick={() => { window.location.href = `/api/oauth/shopify?shop=${encodeURIComponent(domaine.trim())}`; }}>Connexion en un clic</button>}
      <input value={jeton} onChange={(e) => setJeton(e.target.value)} type="password" autoComplete="off" placeholder="Jeton Admin API (shpat_…)" aria-label="Jeton Admin API" style={CHAMP} />
      <button className="btn pri" type="submit" disabled={!jeton.trim()}>Connecter avec le jeton</button>
    </form>
  );
}

/* ───────────────────────── Recharges ───────────────────────── */

export interface PackVue { key: string; credits: string; prix: string; economie: string | null; equivalence: string; nouveauSolde: string }

/**
 * Le choix d'un pack (`.packs[role=radiogroup]`) et la barre d'achat · l'achat
 * part sur `createTopupCheckoutAction` (paiement Stripe hébergé). Fermé, avec
 * sa raison, sans paiement configuré ou pour un non-propriétaire.
 */
export function RechargeCredits({ packs, acheter, raison }: { packs: readonly PackVue[]; acheter: ((fd: FormData) => Promise<void>) | null; raison: string | null }) {
  const [choisi, setChoisi] = useState(packs[1]?.key ?? packs[0]?.key ?? '');
  const [encours, demarrer] = useTransition();
  const pk = packs.find((p) => p.key === choisi) ?? packs[0];
  return (
    <>
      <div className="packs" role="radiogroup" aria-label="Pack de crédits">
        {packs.map((x) => (
          <button key={x.key} type="button" className="tile pack" role="radio" aria-checked={x.key === choisi} onClick={() => setChoisi(x.key)}>
            <span className="pk-r"><i /></span><b>+{x.credits}</b><small>crédits</small><span className="pk-p">{x.prix}</span>
            {x.economie && <span className="pill g">{x.economie}</span>}
            <span className="faint" style={{ fontSize: '11.5px' }}>{x.equivalence}</span>
          </button>
        ))}
      </div>
      {pk && (
        <div className="tile buybar">
          <div><strong>+{pk.credits} crédits · {pk.prix}</strong><p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>{acheter ? `Nouveau solde : ${pk.nouveauSolde} crédits · ajoutés après le paiement` : raison}</p></div>
          <button className="btn pri" type="button" id="buy" disabled={!acheter || encours} title={!acheter ? raison ?? undefined : undefined}
            onClick={() => { if (!acheter) return; const fd = new FormData(); fd.set('pack', pk.key); demarrer(async () => { await acheter(fd); }); }}>
            <Ic n="card" />{encours ? 'Redirection…' : 'Acheter'}
          </button>
        </div>
      )}
    </>
  );
}
