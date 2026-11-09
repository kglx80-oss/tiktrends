import type { GestesLecture, LecturePersona } from '@tiktrends/core';
import { Lien } from '../../communs';
import { GestesGroupe } from '../resultats/gestes-persona-client';

/**
 * « Dans les tests » d'une fiche de la marque (persona, offre · VB P06, M07) ·
 * PRÉSENTATIONNEL, tout est lu et calculé par la page :
 *
 *  · le compte (« N tests · N lots », `bilanTestsPersona`) ;
 *  · la lecture du groupe contre le reste de la marque (`lectureParGroupe` ·
 *    seuils mesurés du module, le silence s'affiche) ;
 *  · « Lots de test » · un lien vers la fiche de chaque lot qui cible ce groupe
 *    (`lotsDuGroupe`) ;
 *  · les gestes « Itérer » et « Créer une hypothèse » SEULEMENT quand le groupe
 *    se détache (`gestesLectureGroupe`) · les briques de la fiche d'un lot,
 *    réutilisées (`GestesGroupe`) · rien n'est écrit avant le clic.
 */

export interface DansLesTestsVue {
  tests: number;
  lots: number;
  lecture: LecturePersona | 'aucun';
  phrase: string;
  /** La règle dite sous la lecture · `null` quand la fiche la dit ailleurs (une fois pour toutes les offres). */
  regle: string | null;
  lotsDeTest: ReadonlyArray<{ id: string; href: string; libelle: string }>;
  /** Les gestes · `null` quand le groupe ne se détache pas · `silence` dit alors pourquoi. */
  gestes: GestesLecture | null;
  silence: string | null;
  /** « Créer une hypothèse » fermé (`accesHypothese`) · la raison écrite à côté. */
  raisonHypothese: string | null;
}

const TON: Record<LecturePersona | 'aucun', string> = {
  au_dessus: 'var(--good)', en_dessous: 'var(--bad)', dans_le_bruit: 'var(--fg2)', effectif: 'var(--fg3)', reference: 'var(--fg3)', trop_de_personas: 'var(--fg3)', aucun: 'var(--fg3)',
};

const MOTS = {
  persona: { aucun: 'Aucun test ne cible ce persona', compte: 'data-tests-persona', lecture: 'data-lecture-persona' },
  offre: { aucun: 'Aucun test ne diffuse cette offre', compte: 'data-tests-offre', lecture: 'data-lecture-offre' },
} as const;

const pl = (n: number, un: string) => `${n} ${un}${n > 1 ? 's' : ''}`;

export function DansLesTests({ t, groupe }: { t: DansLesTestsVue; groupe: 'persona' | 'offre' }) {
  const m = MOTS[groupe];
  return (
    <>
      <span style={{ fontSize: 13 }} {...{ [m.compte]: t.tests }}>{t.tests === 0 ? m.aucun : `${pl(t.tests, 'test')} · ${pl(t.lots, 'lot')}`}</span>
      <span {...{ [m.lecture]: t.lecture }} style={{ fontSize: 13, color: TON[t.lecture] }}>{t.phrase}</span>
      {t.lotsDeTest.length > 0 && (
        <nav aria-label="Lots de test" data-lots-de-test={groupe} style={{ display: 'grid', gap: 2 }}>
          <span className="lbl" style={{ margin: 0 }}>Lots de test</span>
          {t.lotsDeTest.map((l) => (
            <Lien key={l.id} href={l.href} data-lot-de-test={l.id} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 13 }}>{l.libelle}</Lien>
          ))}
        </nav>
      )}
      {t.gestes
        ? <GestesGroupe g={t.gestes} raisonHypothese={t.raisonHypothese} />
        : t.silence && <small className="faint" data-gestes-silence={groupe} style={{ fontSize: '11.5px' }}>{t.silence}</small>}
      {t.regle && <small className="faint" style={{ fontSize: 11 }}>{t.regle}</small>}
    </>
  );
}
