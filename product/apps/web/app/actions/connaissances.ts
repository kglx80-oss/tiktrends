'use server';

import { randomUUID } from 'node:crypto';
import {
  peutGererConnaissances, validerSaisie, creerConnaissance, nouvelleVersion, publierVersion,
  retirerConnaissance, vueConnaissance, apercuContextePlateforme, derniereVersion, changementPortee,
  type SaisieConnaissance, type VueConnaissance, type Connaissance, type Resultat, type PorteeConnaissance,
} from '@tiktrends/core';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import {
  listerConnaissances, lireUneConnaissance, ecrireConnaissance, usageConnaissances, type UsageVersion,
} from '../../lib/jarvis-connaissances';
import { logAndTranslate } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';

/**
 * Les gestes de l'écran Connaissances · réservés à l'ACCÈS TOTAL plateforme.
 *
 * Le garde lit le rôle d'ÉQUIPE de la session (`s.equipe`, posé par
 * `getSession` · fondateur ou ligne `platform_staff`), jamais le rôle d'espace :
 * un owner ou un admin d'espace client est refusé, parce qu'une inscription
 * libre crée un owner. Chaque geste relit la connaissance, applique la règle
 * pure du noyau, et n'écrit que si personne ne l'a modifiée entre-temps.
 *
 * Chaque action renvoie la vue à jour · l'écran suit sans attendre un
 * rafraîchissement de page.
 */

export interface VueAdminConnaissances {
  items: Array<VueConnaissance & { usage: Record<string, UsageVersion> }>;
  apercu: ReturnType<typeof apercuContextePlateforme>;
}

type Retour = { vue?: VueAdminConnaissances; error?: string; id?: string };

const REFUS = 'Réservé à l’équipe plateforme (Admin+ ou Admin) · un rôle d’espace, même propriétaire, ne suffit pas.';

async function garde(): Promise<{ auteur: string } | { error: string }> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  if (!peutGererConnaissances(s.equipe?.role)) return { error: REFUS };
  return { auteur: s.user.email };
}

async function vue(): Promise<VueAdminConnaissances> {
  const [liste, usage] = await Promise.all([listerConnaissances(), usageConnaissances()]);
  const items = liste.map((c) => {
    const v = vueConnaissance(c);
    const u: Record<string, UsageVersion> = {};
    for (const l of v.versions) { const x = usage.get(l.ref); if (x) u[l.ref] = x; }
    return { ...v, usage: u };
  });
  // Les plus récemment touchées d'abord · c'est sur elles qu'on revient.
  items.sort((a, b) => (b.versions[0]?.publieLe ?? b.versions[0]?.creeLe ?? '').localeCompare(a.versions[0]?.publieLe ?? a.versions[0]?.creeLe ?? ''));
  return { items, apercu: apercuContextePlateforme(liste) };
}

export async function chargerConnaissancesAction(): Promise<Retour> {
  const g = await garde();
  if ('error' in g) return { error: g.error };
  try { return { vue: await vue() }; } catch (e) {
    return { error: logAndTranslate('connaissances:lire', e, { subject: 'les connaissances' }) };
  }
}

/** Applique un geste du noyau sur la connaissance relue · refus net sur conflit d'écriture. */
async function modifier(id: string, geste: (c: Connaissance, auteur: string, maintenant: string) => Resultat<Connaissance>): Promise<Retour> {
  const g = await garde();
  if ('error' in g) return { error: g.error };
  try {
    const c = await lireUneConnaissance(id);
    if (!c) return { error: GUARD.notFound('cette connaissance') };
    const r = geste(c, g.auteur, new Date().toISOString());
    if (!r.ok) return { error: r.erreur, vue: await vue() };
    const ok = await ecrireConnaissance(r.valeur, c.rev);
    if (!ok) return { error: 'Quelqu’un a modifié cette connaissance au même moment · la vue est rechargée, refais ton geste.', vue: await vue() };
    return { vue: await vue(), id };
  } catch (e) {
    return { error: logAndTranslate('connaissances:ecrire', e, { subject: 'la connaissance' }) };
  }
}

/**
 * Une portée espace ou marque doit désigner un espace RÉEL, et une marque qui
 * appartient À CET espace · relu en base, jamais cru sur parole. Sans ça, une
 * portée « marque X de l'espace Y » forgée resterait invisible partout (aucune
 * marque ne correspond) ou, pire, viserait la marque d'un autre espace.
 */
async function porteeExiste(p: PorteeConnaissance): Promise<string | null> {
  if (p.niveau === 'plateforme' || !db) return null;
  if (p.niveau === 'espace') {
    const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.id, p.workspaceId)).limit(1);
    return w ? null : 'Cet espace n’existe pas.';
  }
  const [b] = await db.select({ ws: schema.brands.workspaceId }).from(schema.brands).where(eq(schema.brands.id, p.brandId)).limit(1);
  return b && b.ws === p.workspaceId ? null : 'Cette marque n’appartient pas à l’espace choisi.';
}

export async function creerConnaissanceAction(input: SaisieConnaissance & { publier?: boolean }): Promise<Retour> {
  const g = await garde();
  if ('error' in g) return { error: g.error };
  const v = validerSaisie(input);
  if (!v.ok) return { error: v.erreur };
  try {
    const refus = await porteeExiste(v.valeur.portee);
    if (refus) return { error: refus };
    const maintenant = new Date().toISOString();
    let c = creerConnaissance(randomUUID(), v.valeur, g.auteur, maintenant);
    if (input.publier) {
      const p = publierVersion(c, 1, g.auteur, maintenant);
      if (p.ok) c = p.valeur;
    }
    if (!(await ecrireConnaissance(c, null))) return { error: 'Enregistrement impossible · réessaie.' };
    return { vue: await vue(), id: c.id };
  } catch (e) {
    return { error: logAndTranslate('connaissances:creer', e, { subject: 'la connaissance' }) };
  }
}

export async function nouvelleVersionAction(input: { id: string; base: number; saisie: SaisieConnaissance; publier?: boolean; confirmerPortee?: boolean }): Promise<Retour> {
  // Le garde d'abord · un refus ne doit rien dire de la validité de la saisie.
  const g = await garde();
  if ('error' in g) return { error: g.error };
  const v = validerSaisie(input.saisie);
  if (!v.ok) return { error: v.erreur };
  const refus = await porteeExiste(v.valeur.portee).catch(() => 'Portée illisible · réessaie.');
  if (refus) return { error: refus };
  return modifier(input.id, (c, auteur, maintenant) => {
    // Élargir ou déplacer la portée expose le texte à d'autres lecteurs · le
    // serveur exige la confirmation que l'écran a demandée.
    const avant = derniereVersion(c)?.portee;
    const ch = avant ? changementPortee(avant, v.valeur.portee) : null;
    if (ch && !input.confirmerPortee) {
      return { ok: false, erreur: ch === 'elargie' ? 'Cette version élargit la portée · confirme-le avant d’enregistrer.' : 'Cette version déplace la portée · confirme-le avant d’enregistrer.' };
    }
    const r = nouvelleVersion(c, v.valeur, input.base, auteur, maintenant);
    if (!r.ok || !input.publier) return r;
    return publierVersion(r.valeur, r.valeur.versions.length ? Math.max(...r.valeur.versions.map((x) => x.n)) : 1, auteur, maintenant);
  });
}

export async function publierConnaissanceAction(input: { id: string; n: number }): Promise<Retour> {
  return modifier(input.id, (c, auteur, maintenant) => publierVersion(c, input.n, auteur, maintenant));
}

export async function retirerConnaissanceAction(input: { id: string }): Promise<Retour> {
  return modifier(input.id, (c, auteur, maintenant) => retirerConnaissance(c, auteur, maintenant));
}
