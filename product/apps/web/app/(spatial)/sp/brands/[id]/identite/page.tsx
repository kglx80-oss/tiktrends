import { champsModifiablesMarque, costFor, initialeNom, listePropre, morceauxTexte, policeTechnique, styleVisuelMarque, type DaVisuelleMarque } from '@tiktrends/core';
import { deleteBrandAction, updateBrandAction } from '../../../../../actions/brands';
import { extractBrandVisualDaAction, saveBrandDAAction, saveBrandVisualDaAction } from '../../../../../actions/brand-detail';
import { ajouterConcurrents, proposerConcurrents } from '../../../../../actions/competitor';
import { brandMediaPreview } from '../../../../../../lib/brand-media-url';
import { Identite } from '../../../../../../spatial/vues/marque/Identite';
import type { LigneKv } from '../../../../../../spatial/vues/marque/base';
import { chargerMarque, propsFavicon, propsSync, valeursFiche } from '../donnees';

export const dynamic = 'force-dynamic';

const options = (dt: string, xs: string[], videTexte: string): LigneKv =>
  xs.length ? { dt, dd: { type: 'options', options: xs.map((texte) => ({ texte, on: true })) } } : { dt, dd: { type: 'vide', texte: videTexte } };
const texte = (dt: string, t: string | null | undefined, videTexte: string): LigneKv =>
  t && t.trim() ? { dt, dd: { type: 'texte', texte: t.trim() } } : { dt, dd: { type: 'vide', texte: videTexte } };
const pastilles = (dt: string, xs: string[], classe: 'g' | 'r', videTexte: string): LigneKv =>
  xs.length ? { dt, dd: { type: 'pastilles', classe, pastilles: xs } } : { dt, dd: { type: 'vide', texte: videTexte } };

export default async function IdentiteSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { b } = c;
  const secteur = listePropre([b.category, b.industry], 3);
  const tags = listePropre(b.industryTags, 8);
  const langues = listePropre(b.languages, 6);
  const polices = (b.fonts ?? []).filter((f) => f && !policeTechnique(f));
  const ton = morceauxTexte(b.tone, 6);
  // Gestes de la fiche V5 (vague 2) · mêmes actions, mêmes gardes serveur (admin, marque de l'espace).
  const valeurs = valeursFiche(b);
  const style = styleVisuelMarque(b.brandKit as DaVisuelleMarque | null);
  const raisonStyle = !c.aiReady ? 'IA non configurée sur le serveur' : null;
  const logos = [...new Set([b.logoUrl, ...(b.logos ?? [])].filter((u): u is string => !!u))];

  return (
    <Identite
      sousNav={c.sousNav} brandId={b.id} favicon={propsFavicon(c)} sync={propsSync(c)}
      identite={{
        complet: !!(c.domaine && secteur.length && tags.length && langues.length && b.logoUrl),
        lignes: [
          { dt: 'Nom', dd: { type: 'texte', texte: b.name } },
          texte('Site officiel', c.domaine, 'Non renseigné'),
          options('Secteur', secteur, 'Non renseigné'),
          options('Tags', tags, 'Aucun tag'),
          options('Langues', langues, 'Non renseignées'),
          { dt: 'Logo', dd: { type: 'logo', image: b.logoUrl ? brandMediaPreview(b.id, b.logoUrl) : null, initiale: initialeNom(b.name), legende: b.logoUrl ? 'Logo enregistré dans la charte' : 'Aucun logo · l’initiale le remplace' } },
        ],
      }}
      couleurs={listePropre(b.colors, 8).map((code) => ({ code }))}
      typo={[texte('Police principale', polices[0], 'Non renseignée'), texte('Police secondaire', polices[1], 'Non renseignée')]}
      ton={{
        complet: !!(ton.length && b.audience?.trim() && b.usp?.trim()),
        lignes: [options('Ton', ton, 'Non renseigné'), texte('Audience', b.audience, 'Non renseignée'), texte('Promesse', b.usp, 'Non renseignée')],
      }}
      gestion={{
        nom: b.name,
        champs: champsModifiablesMarque(valeurs),
        edition: { action: updateBrandAction, valeurs },
        style: {
          lignes: style.lignes, champs: style.champs,
          analyser: raisonStyle ? null : extractBrandVisualDaAction, cout: c.unlimited ? null : costFor('brief'), raison: raisonStyle,
          corriger: saveBrandVisualDaAction,
        },
        logos: {
          logos, defaut: b.logoUrl ?? null, apercus: Object.fromEntries(logos.map((u) => [u, brandMediaPreview(b.id, u)])),
          couleurs: b.colors ?? [], polices: b.fonts ?? [], enregistrer: saveBrandDAAction,
        },
        // Même prix que l'écran V5 (`costFor('brief')`), annoncé sur le bouton.
        sourcing: {
          prix: c.unlimited ? '0 crédit débité · coût fournisseur sous plafond' : `${costFor('brief')} crédits`,
          proposer: c.aiReady ? proposerConcurrents : null, ajouter: ajouterConcurrents,
          raison: c.aiReady ? null : 'Jarvis n’est pas disponible actuellement',
        },
        supprimer: deleteBrandAction,
        retours: c.retours,
      }}
      vocabulaire={[pastilles('Mots à utiliser', listePropre(b.preferredWords, 10), 'g', 'Aucun'), pastilles('Mots à éviter', listePropre(b.avoidWords, 10), 'r', 'Aucun')]}
    />
  );
}
