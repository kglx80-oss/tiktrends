import 'server-only';
import { bilanLogosCharte, logosAVerifier, type BilanLogosCharte, type VerificationEmpreinte } from '@tiktrends/core';
import { storageFromEnv, verifierEmpreinteObjetEspace } from '@tiktrends/integrations';

/**
 * Au rendu de la fiche Identité · l'état de chaque logo de la charte (noyau
 * `bilanLogosCharte`, même décision que `/api/brands/[id]/media`).
 *
 *  · seul un logo AVEC empreinte part au stockage (`logosAVerifier`) · `HEAD`
 *    signé avec `If-Match` (`verifierEmpreinteObjetEspace`), aucun octet lu,
 *    rien n'est écrit ;
 *  · en parallèle borné (`PARALLELE`), chaque requête à délai court
 *    (`DELAI_MS`), l'ensemble sous un budget (`BUDGET_MS`) · une requête qui
 *    ne peut plus partir dans le budget n'est pas lancée et son logo est
 *    « indisponible » (jamais « à réimporter ») ;
 *  · stockage non configuré · aucune requête, les logos à empreinte sont
 *    « indisponibles ».
 *
 * Les bornes · non mesurées en production (la session n'atteint pas le
 * stockage OVH). Une charte compte au plus 20 logos (`saveBrandDAAction`) ·
 * au pire 6 vagues de 4, et le budget plafonne l'attente de la page à ≈ 3 s
 * quoi qu'il arrive · un stockage plus lent que 1,5 s par `HEAD` se lit
 * « indisponible », jamais « à réimporter ». À resserrer une fois la latence
 * réelle d'un `HEAD` mesurée sur le VPS.
 */
export const VERIFICATION_LOGOS_RENDU = { PARALLELE: 4, DELAI_MS: 1_500, BUDGET_MS: 3_000 } as const;

export async function etatLogosCharte(b: {
  workspaceId: string; logoUrl: string | null; logos: readonly string[] | null; logoEmpreintes: unknown;
}, bornes: { PARALLELE: number; DELAI_MS: number; BUDGET_MS: number } = VERIFICATION_LOGOS_RENDU, verifier?: VerifierLogo): Promise<BilanLogosCharte> {
  const logos = b.logos ?? [];
  const aVerifier = logosAVerifier(b.logoEmpreintes, [b.logoUrl, ...logos]);
  const verifications = new Map<string, VerificationEmpreinte | null>();
  const cfg = aVerifier.length && !verifier ? storageFromEnv() : null;
  const v: VerifierLogo | null = verifier ?? (cfg ? (url, empreinte, delaiMs) => verifierEmpreinteObjetEspace(cfg, url, b.workspaceId, empreinte, delaiMs) : null);
  if (v) {
    const debut = Date.now();
    let i = 0;
    const ouvrier = async () => {
      while (i < aVerifier.length) {
        const l = aVerifier[i++]!;
        const reste = bornes.BUDGET_MS - (Date.now() - debut);
        if (reste <= 0) continue;
        verifications.set(l.url, await v(l.url, l.empreinte, Math.min(bornes.DELAI_MS, reste)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(bornes.PARALLELE, aVerifier.length) }, ouvrier));
  }
  return bilanLogosCharte({ logos, defaut: b.logoUrl, empreintes: b.logoEmpreintes, verifications });
}

/** Le logo PAR DÉFAUT seulement · ce que montrent la vue d'ensemble, la coquille et l'accueil (un `HEAD` au plus, aucun sans empreinte). */
export function etatLogoParDefaut(b: { workspaceId: string; logoUrl: string | null; logoEmpreintes: unknown }): Promise<BilanLogosCharte> {
  return etatLogosCharte({ workspaceId: b.workspaceId, logoUrl: b.logoUrl, logos: [], logoEmpreintes: b.logoEmpreintes });
}

/** Vérifie qu'un logo à empreinte est toujours l'objet de son import · `null` quand rien n'a pu partir (stockage non configuré). */
export type VerifierLogo = (url: string, empreinte: string, delaiMs?: number) => Promise<VerificationEmpreinte | null>;

/**
 * Un vérificateur qui ne part qu'UNE fois par adresse pendant une lecture ·
 * le parcours image relit la consigne retenue (`resoudreReferencesImage`) et
 * les logos liés au brief (annonce « à réimporter ») · un logo cité par les
 * deux n'entraîne qu'un `HEAD`. Sans stockage configuré · aucune requête.
 */
export function verificateurUnique(workspaceId: string): VerifierLogo {
  const vus = new Map<string, Promise<VerificationEmpreinte | null>>();
  return (url, empreinte, delaiMs) => {
    const cle = `${empreinte} ${url}`;
    const deja = vus.get(cle);
    if (deja) return deja;
    const cfg = storageFromEnv();
    const p = cfg ? verifierEmpreinteObjetEspace(cfg, url, workspaceId, empreinte, delaiMs) : Promise.resolve(null);
    vus.set(cle, p);
    return p;
  };
}
