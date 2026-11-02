import { decisionLogoServi } from '@tiktrends/core';
import { storageFromEnv, objectKeyFromUrl, privateObjectUrl, verifierEmpreinteObjetEspace } from '@tiktrends/integrations';
import { gardeSources } from '../../../../../../../lib/studios/sources/acces';
import { fichierAServirPour } from '../../../../../../../lib/studios/produit/vue';
import { octetsDataUri } from '../../../../../../../lib/studios/produit/catalogue';
import { reponseLogoRefuse } from '../../../../../../../lib/media-reponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aperçu d'une photo produit ou d'un logo du catalogue d'un projet · la page
 * ne transporte qu'une adresse courte, jamais la data URI (même raison que
 * `/api/asset/[id]`). Garde studio relue, projet dans la portée, fichier du
 * catalogue de la marque DU PROJET ; sinon 404 neutre.
 *
 * Une photo distante n'est pas téléchargée par le serveur : redirection vers
 * son adresse publique (https seulement), comme les écrans existants.
 *
 * ── Logo de la charte AVEC empreinte (importé, `brands.logo_empreintes_json`) ──
 *
 * Jugé comme à l'export et sur la route média de la marque · `HEAD` signé avec
 * `If-Match` (`verifierEmpreinteObjetEspace`, aucun octet lu), décision du
 * noyau (`decisionLogoServi`) · intact ⇒ la redirection signée d'avant ;
 * remplacé ⇒ 409 « Logo à réimporter », disparu ⇒ 404, stockage injoignable
 * ou non configuré ⇒ 502 (`refusLogoHttp`, le même refus que
 * `/api/brands/[id]/media`) · jamais une redirection vers les nouveaux octets.
 * L'éditeur montre alors le cadre nommé du calque (`ImageCalque`), pas une image
 * cassée. Une photo produit et un logo SANS empreinte (ancien, externe) ne
 * passent pas par là · strictement comme avant.
 *
 * Requêtes au stockage par affichage, MESURÉES sur le faux S3 qui honore
 * `If-Match` (`test/studios-apercu-catalogue-logo-db.test.ts`) :
 *
 *   | fichier servi                | requêtes serveur → stockage | réponse             |
 *   | ---------------------------- | --------------------------- | ------------------- |
 *   | logo à empreinte, intact     | 1 HEAD If-Match (200)       | 302 signée          |
 *   | logo à empreinte, remplacé   | 1 HEAD If-Match (412)       | 409, sans Location  |
 *   | logo à empreinte, disparu    | 1 HEAD If-Match (404)       | 404                 |
 *   | stockage injoignable         | 1 HEAD If-Match (5xx)       | 502                 |
 *   | logo SANS empreinte          | 0 (comme avant)             | 302 signée          |
 *   | photo produit                | 0 (comme avant)             | 302 signée          |
 *
 * Au plus UN `HEAD` ajouté par affichage, aucun octet lu par le serveur.
 *
 * Fenêtre restante · l'objet pourrait être remplacé entre le `HEAD` et la
 * lecture du navigateur par l'adresse signée (≤ sa durée de validité). Elle ne
 * touche que l'AFFICHAGE · l'export et les générations relisent les octets
 * eux-mêmes avec `If-Match` (`lecteurCatalogueUnique`), sans fenêtre.
 */
const TYPES_IMAGE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const g = await gardeSources('studio.read');
  if (!g.ok) return new Response('introuvable', { status: 404 });
  const { id, assetId } = await ctx.params;
  const f = await fichierAServirPour(g.ctx, id, assetId, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
  if (!f.ok) return new Response('introuvable', { status: 404 });
  const d = octetsDataUri(f.url);
  if (d) {
    if (!TYPES_IMAGE.has(d.mime)) return new Response('introuvable', { status: 404 });
    return new Response(new Uint8Array(d.octets), {
      status: 200,
      headers: { 'content-type': d.mime === 'image/jpg' ? 'image/jpeg' : d.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
    });
  }
  if (!/^https:\/\//i.test(f.url)) return new Response('introuvable', { status: 404 });
  const cfg = storageFromEnv();
  if (f.empreinte) {
    const jugement = decisionLogoServi({ empreinte: f.empreinte, verification: cfg ? await verifierEmpreinteObjetEspace(cfg, f.url, g.ctx.workspaceId, f.empreinte) : null });
    if (!jugement.servir) return reponseLogoRefuse(jugement);
  }
  const interne = cfg && objectKeyFromUrl(cfg, f.url) !== null;
  const url = interne ? privateObjectUrl(cfg!, f.url, g.ctx.workspaceId) : f.url;
  if (!url) return new Response("introuvable", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } });
}
