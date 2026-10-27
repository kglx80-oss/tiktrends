import { initialeNom, listePropre, morceauxTexte, policeTechnique } from '@tiktrends/core';
import { brandMediaPreview } from '../../../../../../lib/brand-media-url';
import { Identite } from '../../../../../../spatial/vues/marque/Identite';
import type { LigneKv } from '../../../../../../spatial/vues/marque/base';
import { chargerMarque, propsFavicon, propsSync } from '../donnees';

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
      vocabulaire={[pastilles('Mots à utiliser', listePropre(b.preferredWords, 10), 'g', 'Aucun'), pastilles('Mots à éviter', listePropre(b.avoidWords, 10), 'r', 'Aucun')]}
    />
  );
}
