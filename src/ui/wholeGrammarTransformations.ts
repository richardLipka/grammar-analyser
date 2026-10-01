import { Grammar } from '../core/ast/grammar';
import {
  TransformationResult,
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftFactorGrammar,
  leftCornerTransform,
  rightFactorGrammar,
  convertToChomsky,
  convertToGreibach
} from '../core/processor/grammarProcessor';
import { transformToLL1 } from '../core/processor/ll1Transformer';
import { TRANSLATIONS } from '../i18n/translations';

type Texts = (typeof TRANSLATIONS)['cz'];

/** Transformations of the whole grammar (menu under the editor and buttons on the Transformations tab). */
export const WHOLE_GRAMMAR_TRANSFORMATIONS: {
  id: string;
  fn: (g: Grammar) => TransformationResult;
  label: (t: Texts) => string;
  hint: (t: Texts) => string;
  accent?: boolean;
}[] = [
  { id: 'reduce', fn: reduceGrammar, label: t => t.btnReduce, hint: t => t.hintReduce },
  { id: 'eps', fn: removeEpsilonRules, label: t => t.btnRemoveEps, hint: t => t.hintEps },
  { id: 'units', fn: removeUnitRules, label: t => t.btnRemoveUnits, hint: t => t.hintUnits },
  { id: 'leftrec', fn: removeLeftRecursion, label: t => t.btnRemoveLeftRec, hint: t => t.hintLeftRec },
  { id: 'leftcorner', fn: leftCornerTransform, label: t => t.btnLeftCorner, hint: t => t.hintLeftCorner },
  { id: 'factor', fn: leftFactorGrammar, label: t => t.btnLeftFactor, hint: t => t.hintLeftFactor },
  { id: 'rightfactor', fn: rightFactorGrammar, label: t => t.btnRightFactor, hint: t => t.hintRightFactor },
  { id: 'cnf', fn: convertToChomsky, label: t => t.btnCNF, hint: t => t.hintCNF, accent: true },
  { id: 'gnf', fn: convertToGreibach, label: t => t.btnGNF, hint: t => t.hintGNF, accent: true },
  { id: 'll1', fn: transformToLL1, label: t => t.btnLL1, hint: t => t.hintLL1, accent: true }
];
