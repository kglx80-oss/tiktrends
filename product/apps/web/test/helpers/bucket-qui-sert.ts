/**
 * `fetch` d'un bucket qui sert ces octets pour tout objet · `HEAD` (taille),
 * `GET` (le fichier, Range ignoré · le lecteur borne lui-même), `DELETE`.
 * Pour les témoins d'un enregistrement réussi : `registerUploadedAssetAction`
 * relit l'objet déposé (`lireDebutObjetEspace`) avant d'écrire la ligne.
 */
export function bucketQuiSert(octets: Uint8Array) {
  return async (_u: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const methode = init?.method ?? 'GET';
    if (methode === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(octets.length) } });
    if (methode === 'DELETE') return new Response(null, { status: 204 });
    return new Response(new Uint8Array(octets), { status: 200 });
  };
}
