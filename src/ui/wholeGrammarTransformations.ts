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
  convertToGreibach,
  disambiguateDanglingElse,
  stratifyPrecedence,
  splitNonTerminalLRContext,
  convertLeftLinearToRightLinear,
  attemptResolveLRConflicts
} from '../core/processor/grammarProcessor';
import { transformToLL1, transformToLL1Steps } from '../core/processor/ll1Transformer';
import { Job, JobControl } from '../core/jobs/job';
import { TRANSLATIONS } from '../i18n/translations';

type Texts = (typeof TRANSLATIONS)['cz'];

/** Transformations of the whole grammar (menu under the editor and buttons on the Transformations tab). */
export const WHOLE_GRAMMAR_TRANSFORMATIONS: {
  id: string;
  category?: 'clean' | 'll' | 'lr' | 'normal';
  fn: (g: Grammar) => TransformationResult;
  /** The same as a job that may take long (run in slices, the user is asked after 30 s) */
  job?: (g: Grammar, control: JobControl) => Job<TransformationResult>;
  label: (t: Texts) => string;
  hint: (t: Texts) => string;
  accent?: boolean;
}[] = [
  { id: 'reduce', fn: reduceGrammar, label: t => t.btnReduce, hint: t => t.hintReduce, category: 'clean' },
  { id: 'eps', fn: removeEpsilonRules, label: t => t.btnRemoveEps, hint: t => t.hintEps, category: 'clean' },
  { id: 'units', fn: removeUnitRules, label: t => t.btnRemoveUnits, hint: t => t.hintUnits, category: 'clean' },
  { id: 'leftrec', fn: removeLeftRecursion, label: t => t.btnRemoveLeftRec, hint: t => t.hintLeftRec, category: 'll' },
  { id: 'leftcorner', fn: leftCornerTransform, label: t => t.btnLeftCorner, hint: t => t.hintLeftCorner, category: 'll' },
  { id: 'factor', fn: leftFactorGrammar, label: t => t.btnLeftFactor, hint: t => t.hintLeftFactor, category: 'll' },
  { id: 'rightfactor', fn: rightFactorGrammar, label: t => t.btnRightFactor, hint: t => t.hintRightFactor, category: 'll' },
  { id: 'leftToRightLinear', fn: convertLeftLinearToRightLinear, label: t => t.btnLeftToRightLinear, hint: t => t.hintLeftToRightLinear, category: 'll' },
  { id: 'danglingElse', fn: disambiguateDanglingElse, label: t => t.btnDanglingElse, hint: t => t.hintDanglingElse, category: 'lr' },
  { id: 'precedenceStrat', fn: stratifyPrecedence, label: t => t.btnPrecedenceStrat, hint: t => t.hintPrecedenceStrat, category: 'lr' },
  { id: 'splitLRContext', fn: splitNonTerminalLRContext, label: t => t.btnSplitLRContext, hint: t => t.hintSplitLRContext, category: 'lr' },
  { id: 'cnf', fn: convertToChomsky, label: t => t.btnCNF, hint: t => t.hintCNF, accent: true, category: 'normal' },
  { id: 'gnf', fn: convertToGreibach, label: t => t.btnGNF, hint: t => t.hintGNF, accent: true, category: 'normal' },
  { id: 'll1', fn: transformToLL1, job: transformToLL1Steps, label: t => t.btnLL1, hint: t => t.hintLL1, accent: true, category: 'll' },
  { id: 'lr', fn: attemptResolveLRConflicts, label: t => t.btnLR, hint: t => t.hintLR, accent: true, category: 'lr' }
];

