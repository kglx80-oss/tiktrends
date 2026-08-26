import { LEGAL } from '../../../lib/legal';
import { LegalDoc, LSection, LRow } from '../../../components/LegalDoc';

export const dynamic = 'force-dynamic';

export default function MentionsLegales() {
  return (
    <LegalDoc title="Mentions légales" subtitle={`Dernière mise à jour : ${LEGAL.updatedAt}`}>
      <LSection h="Éditeur du site">
        <div style={{ marginTop: 6 }}>
          <LRow k="Dénomination sociale" v={LEGAL.legalName} />
          <LRow k="Forme juridique" v={LEGAL.form} />
          <LRow k="Capital social" v={LEGAL.capital} />
          <LRow k="SIREN" v={LEGAL.siren} />
          <LRow k="SIRET (siège)" v={LEGAL.siret} />
          <LRow k="RCS" v={LEGAL.rcsCity} />
          <LRow k="Code APE / NAF" v={LEGAL.ape} />
          <LRow k="N° TVA intracommunautaire" v={LEGAL.vatNumber} />
          <LRow k="Siège social" v={LEGAL.address} />
          <LRow k="Directeur de la publication" v={LEGAL.president} />
          <LRow k="Contact" v={LEGAL.email} />
        </div>
      </LSection>

      <LSection h="Hébergeur">
        <p style={{ margin: 0 }}>
          {LEGAL.host.name} · {LEGAL.host.address} · <a href={LEGAL.host.url} style={{ color: 'var(--accent-strong)' }} target="_blank" rel="noreferrer">{LEGAL.host.url}</a>.
        </p>
      </LSection>

      <LSection h="Propriété intellectuelle">
        <p style={{ margin: 0 }}>
          L'ensemble des contenus du site {LEGAL.siteUrl} (marque, logo, textes, interface, code) est protégé par le droit
          de la propriété intellectuelle et reste la propriété de {LEGAL.legalName}, sauf mention contraire. Toute
          reproduction ou réutilisation sans autorisation est interdite.
        </p>
      </LSection>

      <LSection h="Responsabilité">
        <p style={{ margin: 0 }}>
          {LEGAL.legalName} s'efforce d'assurer l'exactitude des informations diffusées sur le site, sans garantie
          d'exhaustivité. La responsabilité de l'éditeur ne saurait être engagée en cas d'indisponibilité temporaire du
          service ou d'usage non conforme par l'utilisateur.
        </p>
      </LSection>

      <LSection h="Contact">
        <p style={{ margin: 0 }}>Pour toute question : {LEGAL.email}.</p>
      </LSection>
    </LegalDoc>
  );
}
