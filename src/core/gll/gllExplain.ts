/**
 * Literature, theory texts and step explanations for the GLL simulator.
 */

import { GLLAction, GLLResult, formatSlot, formatGSSNode, formatDescriptor, gssNodeName } from './gllParser';
import { formatBSRElement } from './bsr';

export interface GLLReference {
  authorYear: string;
  citation: string;
  url: string;
  sections: string;
  topicCz?: string;
  topicEn?: string;
}

export const GLL_PRIMARY_REFERENCES: GLLReference[] = [
  {
    authorYear: 'Scott & Johnstone (2010)',
    citation: 'Scott, E., Johnstone, A.: GLL Parsing. Electronic Notes in Theoretical Computer Science 253(7), 177–189 (2010). Proceedings of LDTA 2009.',
    url: 'https://doi.org/10.1016/j.entcs.2010.08.041',
    sections: 'descriptors (L, u, i), the sets R, U and P, the GSS, add / create / pop, test(x, A, α) with FIRST and FOLLOW; the recogniser',
    topicCz: 'GLL',
    topicEn: 'GLL'
  },
  {
    authorYear: 'Scott & Johnstone (2013)',
    citation: 'Scott, E., Johnstone, A.: GLL parse-tree generation. Science of Computer Programming 78(10), 1828–1844 (2013).',
    url: 'https://doi.org/10.1016/j.scico.2012.03.005',
    sections: 'GSS nodes (L, i) with grammar slots, base node u₀ = (L₀, 0); binarised SPPF with symbol, intermediate and packed nodes (getNodeT, getNodeP)',
    topicCz: 'GSS se sloty, binarizovaný SPPF',
    topicEn: 'slot GSS, binarised SPPF'
  },
  {
    authorYear: 'Scott, Johnstone & van Binsbergen (2019)',
    citation: 'Scott, E., Johnstone, A., van Binsbergen, L.T.: Derivation representation using binary subtree sets. Science of Computer Programming 175, 63–84 (2019).',
    url: 'https://doi.org/10.1016/j.scico.2019.01.008',
    sections: 'BSR elements (X ::= α, i, k, j) and (α, i, k, j); bsrAdd; derivations embedded in a BSR set; extractSPPF; GLL with bsrAdd instead of getNodeT/getNodeP (§5.5)',
    topicCz: 'množiny BSR',
    topicEn: 'BSR sets'
  },
  {
    authorYear: 'Johnstone (2023)',
    citation: 'Johnstone, A.: A Reference GLL Implementation. Proceedings of the 16th ACM SIGPLAN International Conference on Software Language Engineering (SLE ’23), 43–55 (2023).',
    url: 'https://doi.org/10.1145/3623476.3623521',
    sections: 'a reference implementation of GLL: descriptors, the GSS, call and return, the pop set',
    topicCz: 'referenční GLL',
    topicEn: 'reference GLL'
  },
  {
    authorYear: 'Vo et al. (2026)',
    citation: 'Vo, H., Liyanage, D., Kang, H.J., Rubin, S., Gopinath, R.: An Empirical Comparison of General Context-Free Parsers. arXiv:2606.08465 (2026).',
    url: 'https://arxiv.org/abs/2606.08465',
    sections: 'CYK, Valiant, Earley, GLL, RNGLR and BRNGLR measured on the same grammars, with LL(1) and LR(1) baselines',
    topicCz: 'srovnání obecných analyzátorů',
    topicEn: 'comparison of general parsers'
  },
  {
    authorYear: 'Tomita (1986)',
    citation: 'Tomita, M.: Efficient Parsing for Natural Language: A Fast Algorithm for Practical Systems. Kluwer Academic Publishers, Boston (1986).',
    url: 'https://doi.org/10.1007/978-1-4757-1885-0',
    sections: 'the shared-packed forest: one node per symbol and part shared by all trees, packed alternatives where the derivation is ambiguous',
    topicCz: 'sdílený zabalený les',
    topicEn: 'shared packed forest'
  }
];

export const GLL_THEORY_GUIDE = {
  cz: {
    title: 'Jak funguje GLL (zobecněná analýza LL)',
    overview:
      'GLL je rekurzivní sestup zobecněný na libovolnou bezkontextovou gramatiku: víceznačnou, s levou rekurzí i s ε-pravidly. Místo volání procedur si pamatuje deskriptory a místo zásobníku volání graf GSS, který sdílí společné části všech zásobníků. Odvození ukládá jako množinu BSR, ze které lze vyčíst všechny derivační stromy.',
    sections: [
      {
        heading: '1. Sloty a deskriptory',
        content: `Slot X ::= α · β je pravidlo s tečkou: α už je rozpoznané, β zbývá (jako položka LR(0)).
Deskriptor (L, u, i) říká: pokračuj ve slotu L na pozici i vstupu, a až pravidlo skončí, vrať se do uzlu u grafu GSS.
R = deskriptory, které ještě čekají na zpracování; U = všechny deskriptory, které kdy vznikly. add(L, u, i) vloží deskriptor do R, jen když ještě není v U — proto algoritmus skončí.`
      },
      {
        heading: '2. Zpracování deskriptoru',
        content: `Terminál za tečkou se porovná se vstupem (srovnání): shoduje-li se, tečka se posune a pokračuje se, jinak deskriptor končí.
Neterminál Y za tečkou se „zavolá“: create(X ::= α Y · β, u, i) vytvoří (nebo najde) uzel v = (X ::= α Y · β, i) s hranou v → u a pro každé pravidlo Y ::= γ přidá deskriptor (Y ::= · γ, v, i).
Konec pravidla (tečka na konci) je návrat: pop(u, j).`
      },
      {
        heading: '3. GSS, pop a množina P',
        content: `Uzel GSS (L, i) je volání neterminálu na pozici i, které se vrací do slotu L; hrany vedou k volajícím. Dvě volání téhož neterminálu na téže pozici se stejným návratovým slotem sdílejí jeden uzel.
pop(u, j): pravidlo volané v uzlu u = (L, i) skončilo na pozici j. Pro každou hranu u → v vznikne deskriptor (L, v, j) a (u, j) se uloží do množiny P.
Přibude-li k uzlu hrana později, create projde P a novému volajícímu předá i dřívější návraty. Díky tomu levá rekurze (E ::= E + E) nezacyklí: druhé volání E na stejné pozici přidá jen hranu.`
      },
      {
        heading: '4. Množina BSR',
        content: `Prvek (X ::= α, i, k, j) říká, že pravidlo X ::= α odvodí úsek w[i..j) a jeho poslední symbol začíná na pozici k (pivot). Prvek (α, i, k, j) totéž pro předponu α pravé strany (|α| ≥ 2). ε-pravidlo dává (X ::= ε, i, i, i).
bsrAdd(X ::= α · β, i, k, j) přidá prvek pravidla, je-li β prázdné, a prvek řetězce, je-li |α| > 1.
Slovo patří do L(G), právě když množina obsahuje (S ::= α, 0, k, n). Stromy se z ní čtou shora: prvek pravidla se rozdělí v pivotu na předponu a poslední symbol.`
      },
      {
        heading: '5. Test výhledu',
        content: `Původní GLL před započetím alternativy Y ::= γ (a před voláním neterminálu uprostřed pravidla) testuje aktuální symbol a: test(a, Y, γ) platí, když a ∈ FIRST(γ), nebo γ ⇒* ε a a ∈ FOLLOW(Y). Je to jen zrychlení — bez něj vznikne víc deskriptorů, ale výsledek je stejný (přepínač „test výhledu“).`
      },
      {
        heading: '6. Složitost a srovnání',
        content: `GLL pracuje v čase O(n³) pro libovolnou gramatiku (deskriptorů je O(n²) na slot, pop prochází hrany). Na gramatikách LL(1) se chová jako rekurzivní sestup. Oproti GLR (zdola nahoru, zásobník stavů LR automatu) jde shora dolů po pravidlech gramatiky — proto se trasování dobře čte. Earley, GLR i GLL mají stejný výsledek: sdílený zabalený les všech stromů.`
      }
    ]
  },
  en: {
    title: 'How GLL (generalised LL) works',
    overview:
      'GLL is recursive descent generalised to any context-free grammar: ambiguous, left-recursive, with ε-rules. Instead of calling procedures it keeps descriptors, and instead of a call stack a graph-structured stack (GSS) that shares the common parts of all stacks. The derivations are stored as a BSR set, from which every derivation tree can be read.',
    sections: [
      {
        heading: '1. Slots and descriptors',
        content: `A slot X ::= α · β is a rule with a dot: α has been recognised, β remains (like an LR(0) item).
A descriptor (L, u, i) says: continue at slot L at input position i, and when the rule ends, return to the GSS node u.
R = descriptors still to be processed; U = all descriptors ever created. add(L, u, i) puts a descriptor into R only if it is not in U yet — that is why the algorithm terminates.`
      },
      {
        heading: '2. Processing a descriptor',
        content: `A terminal after the dot is compared with the input: if it matches, the dot moves on, otherwise the descriptor ends.
A non-terminal Y after the dot is "called": create(X ::= α Y · β, u, i) makes (or finds) the node v = (X ::= α Y · β, i) with an edge v → u and adds a descriptor (Y ::= · γ, v, i) for every rule Y ::= γ.
The end of a rule (dot at the end) is a return: pop(u, j).`
      },
      {
        heading: '3. The GSS, pop and the set P',
        content: `A GSS node (L, i) is a call of a non-terminal at position i that returns to slot L; its edges lead to the callers. Two calls of the same non-terminal at the same position with the same return slot share one node.
pop(u, j): the rule called in node u = (L, i) ended at position j. Every edge u → v gives a descriptor (L, v, j), and (u, j) is stored in the set P.
When an edge is added to a node later, create goes through P and passes the earlier returns to the new caller. This is why left recursion (E ::= E + E) does not loop: the second call of E at the same position only adds an edge.`
      },
      {
        heading: '4. The BSR set',
        content: `An element (X ::= α, i, k, j) says that the rule X ::= α derives w[i..j) and its last symbol starts at position k (the pivot). An element (α, i, k, j) says the same of a prefix α of a right-hand side (|α| ≥ 2). An ε-rule gives (X ::= ε, i, i, i).
bsrAdd(X ::= α · β, i, k, j) adds the rule element when β is empty and the string element when |α| > 1.
The word is in L(G) iff the set contains (S ::= α, 0, k, n). Trees are read from it top-down: a rule element is split at its pivot into the prefix and the last symbol.`
      },
      {
        heading: '5. The look-ahead test',
        content: `The original GLL tests the current symbol a before starting an alternative Y ::= γ (and before calling a non-terminal in the middle of a rule): test(a, Y, γ) holds when a ∈ FIRST(γ), or γ ⇒* ε and a ∈ FOLLOW(Y). It only saves work — without it more descriptors are created, the result is the same (switch "look-ahead test").`
      },
      {
        heading: '6. Complexity and comparison',
        content: `GLL runs in O(n³) time on any grammar (O(n²) descriptors per slot, pop walks the edges). On LL(1) grammars it behaves like recursive descent. Unlike GLR (bottom-up, a stack of LR automaton states) it works top-down along the rules of the grammar, which makes its trace easy to read. Earley, GLR and GLL have the same result: the shared packed forest of all trees.`
      }
    ]
  }
};

const reasonText = (reason: string, cz: boolean) =>
  ({
    start: cz ? 'start' : 'start',
    call: cz ? 'alternativa volaného neterminálu' : 'alternative of the called non-terminal',
    pop: cz ? 'návrat (pop)' : 'return (pop)',
    contingent: cz ? 'dřívější návrat z P' : 'earlier return from P'
  }[reason] ?? reason);

/** One line of explanation for an action of a step. */
export function describeGLLAction(a: GLLAction, r: GLLResult, cz: boolean): string {
  const node = gssNodeName;
  const nodeFull = (id: number) => `${node(id)} = ${formatGSSNode(r.gssNodes[id])}`;
  switch (a.type) {
    case 'match':
      return cz
        ? `Srovnání: a${sub(a.position)} = '${a.terminal}', tečka se posune → ${formatSlot(a.slot)}, pozice ${a.position + 1}.`
        : `Match: a${sub(a.position)} = '${a.terminal}', the dot moves → ${formatSlot(a.slot)}, position ${a.position + 1}.`;
    case 'mismatch':
      return cz
        ? `Za tečkou je terminál '${a.expected}', na vstupu je '${a.found}': deskriptor končí bez výsledku.`
        : `The terminal '${a.expected}' is after the dot but the input has '${a.found}': the descriptor ends without a result.`;
    case 'testFail':
      return cz
        ? `test('${a.lookahead}', ${a.slot.production.lhs}, ${a.slot.production.rhs.slice(a.slot.dot).join(' ')}) neplatí: '${a.lookahead}' nezačíná zbytek pravidla ani nenásleduje ${a.slot.production.lhs}, neterminál se nevolá.`
        : `test('${a.lookahead}', ${a.slot.production.lhs}, ${a.slot.production.rhs.slice(a.slot.dot).join(' ')}) fails: '${a.lookahead}' neither starts the rest of the rule nor follows ${a.slot.production.lhs}, no call.`;
    case 'selectFail':
      return cz
        ? `Alternativa ${a.slot.production.lhs} ::= ${a.slot.production.rhs.join(' ') || 'ε'} se nezačne: test('${a.lookahead}', …) neplatí.`
        : `The alternative ${a.slot.production.lhs} ::= ${a.slot.production.rhs.join(' ') || 'ε'} is not started: test('${a.lookahead}', …) fails.`;
    case 'bsrAdd':
      return `bsrAdd(${formatSlot(a.slot)}, ${a.element.i}, ${a.element.k}, ${a.element.j}) → ${formatBSRElement(a.element)}${a.isNew ? '' : cz ? ' (už v množině)' : ' (already in the set)'}`;
    case 'create': {
      const nt = a.slot.production.rhs[a.slot.dot - 1];
      const head = cz
        ? `create: volání ${nt} na pozici ${a.position} s návratem do ${formatSlot(a.slot)} — uzel ${nodeFull(a.node)} ${a.nodeIsNew ? 'je nový' : 'už existuje (sdílené volání)'}`
        : `create: call of ${nt} at position ${a.position} returning to ${formatSlot(a.slot)} — node ${nodeFull(a.node)} ${a.nodeIsNew ? 'is new' : 'exists already (shared call)'}`;
      const edge = cz
        ? a.edgeIsNew ? `, nová hrana ${node(a.node)} → ${node(a.caller)}.` : `, hrana ${node(a.node)} → ${node(a.caller)} už je.`
        : a.edgeIsNew ? `, new edge ${node(a.node)} → ${node(a.caller)}.` : `, the edge ${node(a.node)} → ${node(a.caller)} exists already.`;
      return head + edge;
    }
    case 'contingent':
      return cz
        ? `(${node(a.node)}, ${a.position}) ∈ P: ${node(a.node)} se už vrátil na pozici ${a.position}, nový volající ${node(a.caller)} dostane tento návrat.`
        : `(${node(a.node)}, ${a.position}) ∈ P: ${node(a.node)} has already returned at position ${a.position}, the new caller ${node(a.caller)} gets this return.`;
    case 'add': {
      const d = r.descriptors[a.descriptor];
      return cz
        ? `add ${formatDescriptor(d)} (${reasonText(a.reason, cz)})${a.isNew ? ' → do R' : ' — už je v U, nepřidá se'}`
        : `add ${formatDescriptor(d)} (${reasonText(a.reason, cz)})${a.isNew ? ' → into R' : ' — already in U, not added'}`;
    }
    case 'pop':
      if (a.base) {
        return a.position === r.tokens.length
          ? (cz ? `pop(u₀, ${a.position}): pravidlo startovacího symbolu skončilo na konci vstupu — celé slovo je odvozeno.` : `pop(u₀, ${a.position}): a rule of the start symbol ended at the end of the input — the whole word is derived.`)
          : (cz ? `pop(u₀, ${a.position}): pravidlo startovacího symbolu skončilo na pozici ${a.position}, před koncem vstupu; nic dalšího se neděje.` : `pop(u₀, ${a.position}): a rule of the start symbol ended at position ${a.position}, before the end of the input; nothing more happens.`);
      }
      return cz
        ? `pop(${node(a.node)}, ${a.position}): volání v ${nodeFull(a.node)} skončilo na pozici ${a.position}${a.inPAlready ? ' (návrat už je v P)' : `; (${node(a.node)}, ${a.position}) se uloží do P`}, návrat po každé hraně z ${node(a.node)}.`
        : `pop(${node(a.node)}, ${a.position}): the call in ${nodeFull(a.node)} ended at position ${a.position}${a.inPAlready ? ' (the return is in P already)' : `; (${node(a.node)}, ${a.position}) is stored in P`}, return along every edge of ${node(a.node)}.`;
  }
}

export function sub(n: number): string {
  return String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
}
