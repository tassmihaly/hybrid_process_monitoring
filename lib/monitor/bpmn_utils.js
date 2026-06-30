
export function splitBpmnByPool(xmlDoc) {
  const serializer = new XMLSerializer();
  const participants = Array.from(xmlDoc.getElementsByTagName('bpmn:participant'));
  const processes = Array.from(xmlDoc.getElementsByTagName('bpmn:process'));

  if (participants.length === 0) {
    const processId = processes.length > 0 ? processes[0].getAttribute('id') : 'no_pool';
    const xmlStr = serializer.serializeToString(xmlDoc);
    return [ { id: processId, xml: xmlStr } ];
  }

  const processMap = {};
  processes.forEach(p => {
    const id = p.getAttribute('id');
    processMap[id] = p;
  });

  const results = [];

  for (const participant of participants) {
    const processRef = participant.getAttribute('processRef');
    const originalProcess = processMap[processRef];
    if (!originalProcess) continue;

    // Clone the process node (true for deep clone)
    const clonedProcess = originalProcess.cloneNode(true);

    // Create a new definitions wrapper in the same document context
    const newDefs = xmlDoc.implementation.createDocument('http://www.omg.org/spec/BPMN/20100524/MODEL', 'bpmn:definitions', null);

    const defsElement = newDefs.documentElement;
    defsElement.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
    defsElement.setAttribute('id', `Definitions_${processRef}`);
    defsElement.setAttribute('targetNamespace', 'http://bpmn.io/schema/bpmn');

    // Import the cloned process into the new document
    const importedProcess = newDefs.importNode(clonedProcess, true);
    defsElement.appendChild(importedProcess);

    // Serialize the new document
    const xmlStr = serializer.serializeToString(newDefs);
    results.push({ id: processRef, xml: xmlStr });
  }
  return results;
}

export async function convertBpmnToPetriNet(bpmnXml) {

  if (!globalThis.BpmnImporter || !globalThis.BpmnToPetriNetConverter) {
    await import('pm4js/dist/pm4js_latest');
  }

  const { BpmnImporter, BpmnToPetriNetConverter } = globalThis;

  let bpmnGraph = BpmnImporter.apply(bpmnXml);
  let acceptingPetriNet = BpmnToPetriNetConverter.apply(bpmnGraph);

  console.log(acceptingPetriNet);
  return acceptingPetriNet;
}

export class DeterministicFiniteAutomaton {
  constructor(data = {}) {
    this.id = data.id || null;
    this.current = data.current || null;
    this.states = Array.isArray(data.states) ? data.states.slice() : [];
    this.alphabet = Array.isArray(data.alphabet) ? data.alphabet.slice() : [];
    this.transition_function = data.transition_function ? { ...data.transition_function } : {};
    this.init_state = data.init_state || null;
    this.initial_states = Array.isArray(data.initial_states)
      ? data.initial_states.slice()
      : (this.init_state ? [ this.init_state ] : []);
    this.accept_states = Array.isArray(data.accept_states) ? data.accept_states.slice() : [];
    this.accepting_states = Array.isArray(data.accepting_states)
      ? data.accepting_states.slice()
      : this.accept_states.slice();
    this.error_states = Array.isArray(data.error_states) ? data.error_states.slice() : [];
    this.colors = data.colors ? { ...data.colors } : {};
  }

  static from(data) {
    if (data instanceof DeterministicFiniteAutomaton) {
      return new DeterministicFiniteAutomaton(data);
    }
    return new DeterministicFiniteAutomaton(data || {});
  }

  toObject() {
    return {
      id: this.id,
      current: this.current,
      states: this.states.slice(),
      alphabet: this.alphabet.slice(),
      transition_function: { ...this.transition_function },
      init_state: this.init_state,
      initial_states: this.initial_states.slice(),
      accept_states: this.accept_states.slice(),
      accepting_states: this.accepting_states.slice(),
      error_states: this.error_states.slice(),
      colors: { ...this.colors },
      globalColor: this.globalColor ? { ...this.globalColor } : {}
    };
  }

  add_process(processDfa) {
    return addProcess(this, processDfa);
  }

  add_constraint(constraintDfa) {
    return addConstraint(this, constraintDfa);
  }

  addGlobalColor() {
    return addGlobalColor(this);
  }
}

export const DFA = DeterministicFiniteAutomaton;

function addConstraintTransition(table, source, symbol, target) {
  if (!table[source]) {
    table[source] = new Set();
  }
  table[source].add(`${symbol}::${target}`);
}

const CONSTRAINT_STATE_STATUSES = {
  'existence': {
    'existence_1': 'temporary_violated',
    'existence_2': 'satisfied'
  },
  'absence2': {
    'absence2_1': 'temporary_satisfied',
    'absence2_2': 'temporary_satisfied',
    'absence2_3': 'violated'
  },
  'choice': {
    'choice_1': 'temporary_violated',
    'choice_2': 'satisfied'
  },
  'exc-choice': {
    'exc-choice_1': 'temporary_violated',
    'exc-choice_2': 'temporary_satisfied',
    'exc-choice_3': 'temporary_satisfied',
    'exc-choice_4': 'violated'
  },
  'resp-existence': {
    'resp-existence_1': 'temporary_satisfied',
    'resp-existence_2': 'satisfied',
    'resp-existence_3': 'temporary_violated'
  },
  'coexistence': {
    'coexistence_1': 'temporary_satisfied',
    'coexistence_2': 'temporary_violated',
    'coexistence_3': 'temporary_violated',
    'coexistence_4': 'satisfied'
  },
  'response': {
    'response_1': 'temporary_satisfied',
    'response_2': 'temporary_violated'
  },
  'precedence': {
    'precedence_1': 'temporary_satisfied',
    'precedence_2': 'satisfied',
    'precedence_3': 'violated'
  },
  'succession': {
    'succession_1': 'temporary_violated',
    'succession_2': 'violated',
    'succession_3': 'temporary_violated',
    'succession_4': 'temporary_satisfied'
  },
  'alt-response': {
    'alt-response_1': 'temporary_satisfied',
    'alt-response_2': 'temporary_violated',
    'alt-response_3': 'violated'
  },
  'alt-precedence': {
    'alt-precedence_1': 'temporary_satisfied',
    'alt-precedence_2': 'temporary_satisfied',
    'alt-precedence_3': 'violated'
  },
  'alt-succession': {
    'alt_succession_1': 'temporary_satisfied',
    'alt_succession_2': 'violated',
    'alt_succession_3': 'temporary_violated'
  },
  'chain-response': {
    'chain-response_1': 'temporary_satisfied',
    'chain-response_2': 'temporary_violated',
    'chain-response_3': 'violated'
  },
  'chain-precedence': {
    'chain-precedence_1': 'temporary_satisfied',
    'chain-precedence_2': 'temporary_satisfied',
    'chain-precedence_3': 'violated'
  },
  'chain-succession': {
    'chain-succession_1': 'temporary_satisfied',
    'chain-succession_2': 'temporary_satisfied',
    'chain-succession_3': 'temporary_violated',
    'chain-succession_4': 'violated'
  },
  'not-coexistence': {
    'not-coexistence_1': 'temporary_satisfied',
    'not-coexistence_2': 'temporary_satisfied',
    'not-coexistence_3': 'temporary_satisfied',
    'not-coexistence_4': 'violated'
  },
  'neg-succession': {
    'neg-succession_1': 'temporary_satisfied',
    'neg-succession_2': 'temporary_satisfied',
    'neg-succession_3': 'violated'
  },
  'neg-chain-succession': {
    'neg-chain-succession_1': 'temporary_satisfied',
    'neg-chain-succession_2': 'temporary_satisfied',
    'neg-chain-succession_3': 'temporary_satisfied',
    'neg-chain-succession_4': 'temporary_satisfied',
    'neg-chain-succession_5': 'violated'
  }
};

function constraintDfaFromSpec(id, constraintType, states, alphabet, initial_states, accepting_states, transitionSetMap) {
  const transition_function = {};
  const acceptingSet = new Set(accepting_states);
  const typeStatuses = CONSTRAINT_STATE_STATUSES[constraintType] || {};
  const colors = {};

  states.forEach(state => {
    const transitions = transitionSetMap[state] || new Set();
    transition_function[state] = Array.from(transitions)
      .map(encoded => {
        const split = encoded.indexOf('::');
        return {
          symbol: encoded.slice(0, split),
          target: encoded.slice(split + 2)
        };
      })
      .sort((a, b) => {
        if (a.symbol === b.symbol) {
          return a.target.localeCompare(b.target);
        }
        return a.symbol.localeCompare(b.symbol);
      });

    colors[state] = {
      [id]: typeStatuses[state]
    };
  });

  return new DeterministicFiniteAutomaton({
    id,
    current: initial_states[0] || null,
    states,
    alphabet,
    transition_function,
    init_state: initial_states[0] || null,
    initial_states,
    accept_states: accepting_states,
    accepting_states,
    error_states: [],
    colors
  });
}

export function buildConstraintDFA(constraint, multiProcessAlphabet) {
  const id = String(constraint.id);
  const source = String(constraint.sourceRef);
  const target = String(constraint.targetRef);
  const type = String(constraint.constraintType);
  const alphabet = uniqueSorted(asArray(multiProcessAlphabet));

  const build = (states, initial_states, accepting_states, addTransitions) => {
    const transitionSetMap = {};
    states.forEach(state => {
      transitionSetMap[state] = new Set();
    });

    alphabet.forEach(activity => addTransitions(activity, (from, to) => {
      addConstraintTransition(transitionSetMap, from, activity, to);
    }));

    return constraintDfaFromSpec(id, type, states, alphabet, initial_states, accepting_states, transitionSetMap);
  };

  switch (type) {
  case 'existence':
    return build([ 'existence_1', 'existence_2' ], [ 'existence_1' ], [ 'existence_2' ], (activity, add) => {
      add('existence_1', activity === source ? 'existence_2' : 'existence_1');
      add('existence_2', 'existence_2');
    });
  case 'absence2':
    return build([ 'absence2_1', 'absence2_2', 'absence2_3' ], [ 'absence2_1' ], [ 'absence2_1', 'absence2_2' ], (activity, add) => {
      if (activity === source) {
        add('absence2_1', 'absence2_2');
        add('absence2_2', 'absence2_3');
      } else {
        add('absence2_1', 'absence2_1');
        add('absence2_2', 'absence2_2');
      }
      add('absence2_3', 'absence2_3');
    });
  case 'choice':
    return build([ 'choice_1', 'choice_2' ], [ 'choice_1' ], [ 'choice_2' ], (activity, add) => {
      add('choice_1', (activity === source || activity === target) ? 'choice_2' : 'choice_1');
      add('choice_2', 'choice_2');
    });
  case 'exc-choice':
    return build([ 'exc-choice_1', 'exc-choice_2', 'exc-choice_3', 'exc-choice_4' ], [ 'exc-choice_1' ], [ 'exc-choice_2', 'exc-choice_3' ], (activity, add) => {
      if (activity === target && activity !== source) add('exc-choice_1', 'exc-choice_2');
      if (activity === source && activity !== target) add('exc-choice_1', 'exc-choice_3');
      if (activity === source && activity === target) add('exc-choice_1', 'exc-choice_4');
      if (activity !== source && activity !== target) add('exc-choice_1', 'exc-choice_1');
      if (activity === source) add('exc-choice_2', 'exc-choice_4');
      if (activity === target) add('exc-choice_3', 'exc-choice_4');
      if (activity !== source) add('exc-choice_2', 'exc-choice_2');
      if (activity !== target) add('exc-choice_3', 'exc-choice_3');
      add('exc-choice_4', 'exc-choice_4');
    });
  case 'resp-existence':
    return build([ 'resp-existence_1', 'resp-existence_2', 'resp-existence_3' ], [ 'resp-existence_1' ], [ 'resp-existence_1', 'resp-existence_2' ], (activity, add) => {
      if (activity === target) {
        add('resp-existence_1', 'resp-existence_2');
        add('resp-existence_3', 'resp-existence_2');
      }
      if (activity === source && activity !== target) add('resp-existence_1', 'resp-existence_3');
      if (activity !== source && activity !== target) add('resp-existence_1', 'resp-existence_1');
      if (activity !== target) add('resp-existence_3', 'resp-existence_3');
      add('resp-existence_2', 'resp-existence_2');
    });
  case 'coexistence':
    return build([ 'coexistence_1', 'coexistence_2', 'coexistence_3', 'coexistence_4' ], [ 'coexistence_1' ], [ 'coexistence_1', 'coexistence_4' ], (activity, add) => {
      if (activity !== target && activity !== source) add('coexistence_1', 'coexistence_1');
      if (activity === target && activity !== source) add('coexistence_1', 'coexistence_2');
      if (activity === source && activity !== target) add('coexistence_1', 'coexistence_3');
      if (activity === source && activity === target) add('coexistence_1', 'coexistence_4');
      if (activity !== source) add('coexistence_2', 'coexistence_2');
      if (activity !== target) add('coexistence_3', 'coexistence_3');
      if (activity === source) add('coexistence_2', 'coexistence_4');
      if (activity === target) add('coexistence_3', 'coexistence_4');
      add('coexistence_4', 'coexistence_4');
    });
  case 'response':
    return build([ 'response_1', 'response_2' ], [ 'response_1' ], [ 'response_1' ], (activity, add) => {
      if (activity === target || activity !== source) add('response_1', 'response_1');
      if (activity === source && activity !== target) add('response_1', 'response_2');
      if (activity !== target) add('response_2', 'response_2');
      if (activity === target) add('response_2', 'response_1');
    });
  case 'precedence':
    return build([ 'precedence_1', 'precedence_2', 'precedence_3' ], [ 'precedence_1' ], [ 'precedence_1', 'precedence_2' ], (activity, add) => {
      if (activity === target && activity !== source) add('precedence_1', 'precedence_3');
      if (activity === source) add('precedence_1', 'precedence_2');
      if (activity !== source && activity !== target) add('precedence_1', 'precedence_1');
      add('precedence_2', 'precedence_2');
      add('precedence_3', 'precedence_3');
    });
  case 'succession':
    return build([ 'succession_1', 'succession_2', 'succession_3', 'succession_4' ], [ 'succession_1' ], [ 'succession_4' ], (activity, add) => {
      if (activity !== target && activity !== source) add('succession_1', 'succession_1');
      if (activity === target && activity !== source) add('succession_1', 'succession_2');
      if (activity === source && activity !== target) add('succession_1', 'succession_3');
      if (activity === source && activity === target) add('succession_1', 'succession_4');
      if (activity === target) add('succession_3', 'succession_4');
      if (activity === source && activity !== target) add('succession_4', 'succession_3');
      if (activity === target || activity !== source) add('succession_4', 'succession_4');
      if (activity !== target) add('succession_3', 'succession_3');
      add('succession_2', 'succession_2');
    });
  case 'alt-response':
    return build([ 'alt-response_1', 'alt-response_2', 'alt-response_3' ], [ 'alt-response_1' ], [ 'alt-response_1' ], (activity, add) => {
      if (activity === source) add('alt-response_1', 'alt-response_2');
      if (activity === source && activity !== target) add('alt-response_2', 'alt-response_3');
      if (activity === target && activity !== source) add('alt-response_2', 'alt-response_1');
      if (activity !== source) add('alt-response_1', 'alt-response_1');
      if ((activity === source && activity === target) || (activity !== source && activity !== target)) add('alt-response_2', 'alt-response_2');
      add('alt-response_3', 'alt-response_3');
    });
  case 'alt-precedence':
    return build([ 'alt-precedence_1', 'alt-precedence_2', 'alt-precedence_3' ], [ 'alt-precedence_1' ], [ 'alt-precedence_1', 'alt-precedence_2' ], (activity, add) => {
      if ((activity === source && activity === target) || (activity !== source && activity !== target)) add('alt-precedence_1', 'alt-precedence_1');
      if (activity === source && activity !== target) add('alt-precedence_1', 'alt-precedence_2');
      if (activity === target && activity !== source) add('alt-precedence_1', 'alt-precedence_3');
      if (activity === target) add('alt-precedence_2', 'alt-precedence_1');
      if (activity !== target) add('alt-precedence_2', 'alt-precedence_2');
      add('alt-precedence_3', 'alt-precedence_3');
    });
  case 'alt-succession':
    return build([ 'alt_succession_1', 'alt_succession_2', 'alt_succession_3' ], [ 'alt_succession_1' ], [ 'alt_succession_1' ], (activity, add) => {
      if (activity !== source && activity !== target) {
        add('alt_succession_1', 'alt_succession_1');
        add('alt_succession_3', 'alt_succession_3');
      }
      if (activity === target) add('alt_succession_1', 'alt_succession_2');
      if (activity === source) add('alt_succession_3', 'alt_succession_2');
      if (activity === source && activity !== target) add('alt_succession_1', 'alt_succession_3');
      if (activity === target && activity !== source) add('alt_succession_3', 'alt_succession_1');
      add('alt_succession_2', 'alt_succession_2');
    });
  case 'chain-response':
    return build([ 'chain-response_1', 'chain-response_2', 'chain-response_3' ], [ 'chain-response_1' ], [ 'chain-response_1' ], (activity, add) => {
      if (activity === source) add('chain-response_1', 'chain-response_2');
      if (activity !== target) add('chain-response_2', 'chain-response_3');
      if (activity === target && activity !== source) add('chain-response_2', 'chain-response_1');
      if (activity !== source) add('chain-response_1', 'chain-response_1');
      if (activity === source && activity === target) add('chain-response_2', 'chain-response_2');
      add('chain-response_3', 'chain-response_3');
    });
  case 'chain-precedence':
    return build([ 'chain-precedence_1', 'chain-precedence_2', 'chain-precedence_3' ], [ 'chain-precedence_1' ], [ 'chain-precedence_1', 'chain-precedence_2' ], (activity, add) => {
      if (activity !== source) add('chain-precedence_1', 'chain-precedence_2');
      if (activity === target) add('chain-precedence_2', 'chain-precedence_3');
      if (activity === source && activity !== target) add('chain-precedence_2', 'chain-precedence_1');
      if (activity === source) add('chain-precedence_1', 'chain-precedence_1');
      if (activity !== source && activity !== target) add('chain-precedence_2', 'chain-precedence_2');
      add('chain-precedence_3', 'chain-precedence_3');
    });
  case 'chain-succession':
    return build([ 'chain-succession_1', 'chain-succession_2', 'chain-succession_3', 'chain-succession_4' ], [ 'chain-succession_1' ], [ 'chain-succession_1', 'chain-succession_2' ], (activity, add) => {
      if (activity !== source) add('chain-succession_1', 'chain-succession_2');
      if (activity === source) add('chain-succession_1', 'chain-succession_3');
      if (activity !== target) add('chain-succession_3', 'chain-succession_4');
      if (activity === target) add('chain-succession_2', 'chain-succession_4');
      if (activity === source && activity !== target) add('chain-succession_2', 'chain-succession_3');
      if (activity === target && activity !== source) add('chain-succession_3', 'chain-succession_2');
      if (activity !== source && activity !== target) add('chain-succession_2', 'chain-succession_2');
      if (activity === source && activity === target) add('chain-succession_3', 'chain-succession_3');
      add('chain-succession_4', 'chain-succession_4');
    });
  case 'not-coexistence':
    return build([ 'not-coexistence_1', 'not-coexistence_2', 'not-coexistence_3', 'not-coexistence_4' ], [ 'not-coexistence_1' ], [ 'not-coexistence_1', 'not-coexistence_2', 'not-coexistence_3' ], (activity, add) => {
      if (activity === target && activity !== source) add('not-coexistence_1', 'not-coexistence_2');
      if (activity === source && activity !== target) add('not-coexistence_1', 'not-coexistence_3');
      if (activity === source && activity === target) add('not-coexistence_1', 'not-coexistence_4');
      if (activity === source) add('not-coexistence_2', 'not-coexistence_4');
      if (activity === target) add('not-coexistence_3', 'not-coexistence_4');
      if (activity !== source) add('not-coexistence_2', 'not-coexistence_2');
      if (activity !== target) add('not-coexistence_3', 'not-coexistence_3');
      if (activity !== source && activity !== target) add('not-coexistence_1', 'not-coexistence_1');
      add('not-coexistence_4', 'not-coexistence_4');
    });
  case 'neg-succession':
    return build([ 'neg-succession_1', 'neg-succession_2', 'neg-succession_3' ], [ 'neg-succession_1' ], [ 'neg-succession_1', 'neg-succession_2' ], (activity, add) => {
      if (activity === source && activity !== target) add('neg-succession_1', 'neg-succession_2');
      if (activity === source && activity === target) add('neg-succession_1', 'neg-succession_3');
      if (activity === target) add('neg-succession_2', 'neg-succession_3');
      if (activity !== source) add('neg-succession_1', 'neg-succession_1');
      if (activity !== target) add('neg-succession_2', 'neg-succession_2');
      add('neg-succession_3', 'neg-succession_3');
    });
  case 'neg-chain-succession':
    return build([ 'neg-chain-succession_1', 'neg-chain-succession_2', 'neg-chain-succession_3', 'neg-chain-succession_4', 'neg-chain-succession_5' ], [ 'neg-chain-succession_1' ], [ 'neg-chain-succession_1', 'neg-chain-succession_2', 'neg-chain-succession_3', 'neg-chain-succession_4' ], (activity, add) => {
      if (activity !== source && activity !== target) add('neg-chain-succession_1', 'neg-chain-succession_1');
      if (activity === source && activity !== target) add('neg-chain-succession_3', 'neg-chain-succession_3');
      if (activity === target && activity !== source) add('neg-chain-succession_2', 'neg-chain-succession_2');
      if (activity !== source && activity === target) add('neg-chain-succession_1', 'neg-chain-succession_2');
      if (activity !== source && activity !== target) add('neg-chain-succession_2', 'neg-chain-succession_1');
      if (activity === source && activity !== target) add('neg-chain-succession_1', 'neg-chain-succession_3');
      if (activity !== source && activity !== target) add('neg-chain-succession_3', 'neg-chain-succession_1');
      if (activity === target && activity === source) add('neg-chain-succession_1', 'neg-chain-succession_4');
      if (activity !== source && activity !== target) add('neg-chain-succession_4', 'neg-chain-succession_1');
      if (activity === source && activity !== target) add('neg-chain-succession_2', 'neg-chain-succession_3');
      if (activity === source && activity === target) add('neg-chain-succession_2', 'neg-chain-succession_4');

      if (activity === target) add('neg-chain-succession_3', 'neg-chain-succession_5');
      if (activity === source || activity === target) add('neg-chain-succession_4', 'neg-chain-succession_5');

      add('neg-chain-succession_5', 'neg-chain-succession_5');
    });
  default:
    throw new Error(`Unknown constraint type: ${type}`);
  }
}

export function buildConstraintDFAs(constraints, multiProcessAlphabet) {
  const list = asArray(constraints);
  return list.map(constraint => buildConstraintDFA(constraint, multiProcessAlphabet));
}

export function convertPetriNetToReachabilityGraph(petriNet) {

  if (!petriNet || !petriNet.im || !petriNet.fm || !petriNet.net) {
    throw new Error('convertPetriNetToReachabilityGraph expects a pm4js AcceptingPetriNet with net/im/fm');
  }

  const acceptingPetriNet = petriNet;

  const isVisibleTransition = transition => transition && transition.label !== null && transition.label !== undefined;

  const markingKey = marking => marking.toString();

  const closureKey = closure => {
    const keys = Array.from(closure.keys()).sort();
    return `(${keys.join('|')})`;
  };

  const epsilonClosure = seedMarkings => {
    const closure = new Map();
    const queue = [];

    seedMarkings.forEach(marking => {
      const key = markingKey(marking);
      if (!closure.has(key)) {
        closure.set(key, marking);
        queue.push(marking);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift();
      const enabled = current.getEnabledTransitions();

      enabled.forEach(transition => {
        if (isVisibleTransition(transition)) {
          return;
        }

        const nextMarking = current.execute(transition);
        const nextKey = markingKey(nextMarking);

        if (!closure.has(nextKey)) {
          closure.set(nextKey, nextMarking);
          queue.push(nextMarking);
        }
      });
    }

    return closure;
  };

  const initialClosure = epsilonClosure([ acceptingPetriNet.im.copy() ]);
  const initialState = closureKey(initialClosure);

  const queue = [ initialClosure ];
  const seen = new Set([ initialState ]);

  const states = [];
  const alphabet = new Set();
  const acceptStates = new Set();
  const transitionFunction = {};

  while (queue.length > 0) {
    const currentClosure = queue.shift();
    const currentState = closureKey(currentClosure);

    states.push(currentState);
    transitionFunction[currentState] = [];

    const hasFinalMarking = Array.from(currentClosure.values()).some(marking => marking.equals(acceptingPetriNet.fm));
    if (hasFinalMarking) {
      acceptStates.add(currentState);
    }

    const groupedNext = new Map();

    currentClosure.forEach(marking => {
      const enabled = marking.getEnabledTransitions();

      enabled.forEach(transition => {
        if (!isVisibleTransition(transition)) {
          return;
        }

        const symbol = transition.name;
        alphabet.add(symbol);

        const nextMarking = marking.execute(transition);

        if (!groupedNext.has(symbol)) {
          groupedNext.set(symbol, []);
        }
        groupedNext.get(symbol).push(nextMarking);
      });
    });

    groupedNext.forEach((seedMarkings, symbol) => {
      const nextClosure = epsilonClosure(seedMarkings);
      const nextState = closureKey(nextClosure);

      transitionFunction[currentState].push({
        symbol,
        target: nextState
      });

      if (!seen.has(nextState)) {
        seen.add(nextState);
        queue.push(nextClosure);
      }
    });

    transitionFunction[currentState].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  return new DeterministicFiniteAutomaton({
    current: initialState,
    states,
    alphabet: Array.from(alphabet).sort(),
    transition_function: transitionFunction,
    init_state: initialState,
    initial_states: [ initialState ],
    accept_states: Array.from(acceptStates),
    accepting_states: Array.from(acceptStates),
    error_states: [],
    colors: {}
  });
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [ value ];
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(v => String(v)))).sort();
}

function toCompositeState(parts) {
  return JSON.stringify(parts.map(part => String(part)));
}

function fromCompositeState(state) {
  if (Array.isArray(state)) {
    return state.map(part => String(part));
  }

  if (typeof state === 'string') {
    try {
      const parsed = JSON.parse(state);
      if (Array.isArray(parsed)) {
        return parsed.map(part => String(part));
      }
    } catch (err) {
      // Not a JSON encoded composite state.
    }
    return [ state ];
  }

  return [ String(state) ];
}

function normalizeTransitions(rawTransitions) {
  const transitionMap = {};

  if (!rawTransitions || typeof rawTransitions !== 'object') {
    return transitionMap;
  }

  Object.keys(rawTransitions).forEach(state => {
    const transitions = asArray(rawTransitions[state]);
    const normalized = [];

    transitions.forEach(entry => {
      if (!entry) {
        return;
      }

      if (Array.isArray(entry) && entry.length >= 2) {
        normalized.push({
          symbol: String(entry[0]),
          target: String(entry[1])
        });
        return;
      }

      if (typeof entry === 'object' && entry.symbol !== undefined && entry.target !== undefined) {
        normalized.push({
          symbol: String(entry.symbol),
          target: String(entry.target)
        });
      }
    });

    transitionMap[String(state)] = normalized;
  });

  return transitionMap;
}

function normalizeColors(rawColors) {
  const colorMap = {};

  if (!rawColors || typeof rawColors !== 'object') {
    return colorMap;
  }

  Object.keys(rawColors).forEach(state => {
    const colorValue = rawColors[state];

    if (Array.isArray(colorValue)) {
      colorMap[String(state)] = colorValue
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({ ...entry }));
      return;
    }

    if (colorValue && typeof colorValue === 'object') {
      colorMap[String(state)] = { ...colorValue };
      return;
    }

    colorMap[String(state)] = colorValue;
  });

  return colorMap;
}

function toColorFragments(colorValue) {
  if (!colorValue) {
    return [];
  }

  if (Array.isArray(colorValue)) {
    return colorValue
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({ ...entry }));
  }

  if (typeof colorValue === 'object') {
    return [{ ...colorValue }];
  }

  return [];
}

function mergeStateColors(left, right) {
  const merged = [ ...toColorFragments(left), ...toColorFragments(right) ];
  return merged.length > 0 ? merged : null;
}

function normalizeDfa(dfa) {
  const normalizedTransitions = normalizeTransitions(dfa?.transition_function || dfa?.transitionFunction || {});
  const normalizedColors = normalizeColors(dfa?.colors || {});

  const states = new Set(asArray(dfa?.states).map(state => String(state)));
  const alphabet = new Set(asArray(dfa?.alphabet).map(sym => String(sym)));

  Object.keys(normalizedTransitions).forEach(state => {
    states.add(state);
    normalizedTransitions[state].forEach(({ symbol, target }) => {
      alphabet.add(symbol);
      states.add(target);
    });
  });

  const initialStates = new Set(asArray(dfa?.initial_states ?? dfa?.init_state).map(state => String(state)));
  const acceptingStates = new Set(asArray(dfa?.accepting_states ?? dfa?.accept_states).map(state => String(state)));
  const errorStates = new Set(asArray(dfa?.error_states).map(state => String(state)));

  return {
    states,
    alphabet,
    transitionFunction: normalizedTransitions,
    initialStates,
    acceptingStates,
    errorStates,
    colors: normalizedColors
  };
}

function dfaFromInternal(internal) {
  const states = uniqueSorted(Array.from(internal.states));
  const alphabet = uniqueSorted(Array.from(internal.alphabet));
  const initialStates = uniqueSorted(Array.from(internal.initialStates));
  const acceptingStates = uniqueSorted(Array.from(internal.acceptingStates));
  const errorStates = uniqueSorted(Array.from(internal.errorStates));

  const transitionFunction = {};
  states.forEach(state => {
    const transitions = asArray(internal.transitionFunction[state]);
    transitionFunction[state] = transitions
      .map(t => ({ symbol: String(t.symbol), target: String(t.target) }))
      .sort((a, b) => {
        if (a.symbol === b.symbol) {
          return a.target.localeCompare(b.target);
        }
        return a.symbol.localeCompare(b.symbol);
      });
  });

  const colors = normalizeColors(internal.colors || {});

  return new DeterministicFiniteAutomaton({
    current: initialStates[0] || null,
    states,
    alphabet,
    transition_function: transitionFunction,
    init_state: initialStates[0] || null,
    accept_states: acceptingStates,
    initial_states: initialStates,
    accepting_states: acceptingStates,
    error_states: errorStates,
    colors
  });
}

export function addProcess(baseDfa, processDfa) {
  const base = normalizeDfa(baseDfa || {});
  const process = normalizeDfa(processDfa || {});

  // If base DFA is empty, bootstrap from process DFA and encode as 1-component composite states.
  if (base.states.size === 0) {
    const bootstrap = {
      states: new Set(),
      alphabet: new Set(process.alphabet),
      transitionFunction: {},
      initialStates: new Set(),
      acceptingStates: new Set(),
      errorStates: new Set(),
      colors: {}
    };

    process.states.forEach(state => {
      const composite = toCompositeState([ state ]);
      bootstrap.states.add(composite);

      const transitions = asArray(process.transitionFunction[state]);
      bootstrap.transitionFunction[composite] = transitions.map(({ symbol, target }) => ({
        symbol,
        target: toCompositeState([ target ])
      }));

      const stateColor = mergeStateColors(null, process.colors[state]);
      if (stateColor) {
        bootstrap.colors[composite] = stateColor;
      }
    });

    process.initialStates.forEach(state => {
      bootstrap.initialStates.add(toCompositeState([ state ]));
    });

    process.acceptingStates.forEach(state => {
      bootstrap.acceptingStates.add(toCompositeState([ state ]));
    });

    process.errorStates.forEach(state => {
      bootstrap.errorStates.add(toCompositeState([ state ]));
    });

    return dfaFromInternal(bootstrap);
  }

  const combined = {
    states: new Set(),
    alphabet: new Set([ ...base.alphabet, ...process.alphabet ]),
    transitionFunction: {},
    initialStates: new Set(),
    acceptingStates: new Set(),
    errorStates: new Set(),
    colors: {}
  };

  base.initialStates.forEach(baseInit => {
    process.initialStates.forEach(processInit => {
      const next = toCompositeState([ ...fromCompositeState(baseInit), processInit ]);
      combined.initialStates.add(next);
    });
  });

  base.acceptingStates.forEach(baseAccept => {
    process.acceptingStates.forEach(processAccept => {
      const next = toCompositeState([ ...fromCompositeState(baseAccept), processAccept ]);
      combined.acceptingStates.add(next);
    });
  });

  base.states.forEach(baseState => {
    process.states.forEach(processState => {
      const baseParts = fromCompositeState(baseState);
      const current = toCompositeState([ ...baseParts, processState ]);

      combined.states.add(current);
      combined.transitionFunction[current] = combined.transitionFunction[current] || [];

      const stateColor = mergeStateColors(base.colors[baseState], process.colors[processState]);
      if (stateColor) {
        combined.colors[current] = stateColor;
      }

      if (base.errorStates.has(baseState) || process.errorStates.has(processState)) {
        combined.errorStates.add(current);
      }

      asArray(base.transitionFunction[baseState]).forEach(({ symbol, target }) => {
        const targetState = toCompositeState([ ...fromCompositeState(target), processState ]);
        combined.transitionFunction[current].push({ symbol, target: targetState });
      });

      asArray(process.transitionFunction[processState]).forEach(({ symbol, target }) => {
        const targetState = toCompositeState([ ...baseParts, target ]);
        combined.transitionFunction[current].push({ symbol, target: targetState });
      });
    });
  });

  return dfaFromInternal(combined);
}

export function addConstraint(hybridDfa, constraintDfa) {
  const hybrid = normalizeDfa(hybridDfa || {});
  const constraint = normalizeDfa(constraintDfa || {});

  if (hybrid.states.size === 0 || constraint.states.size === 0) {
    return dfaFromInternal(hybrid);
  }

  const currentElements = fromCompositeState(Array.from(hybrid.states)[0]).length;

  const combined = {
    states: new Set(),
    alphabet: new Set([ ...hybrid.alphabet, ...constraint.alphabet ]),
    transitionFunction: {},
    initialStates: new Set(),
    acceptingStates: new Set(),
    errorStates: new Set(),
    colors: {}
  };

  const workQueue = [];
  const visited = new Set();

  constraint.initialStates.forEach(constraintInit => {
    hybrid.initialStates.forEach(hybridInit => {
      const seed = toCompositeState([ ...fromCompositeState(hybridInit), constraintInit ]);
      combined.states.add(seed);
      combined.initialStates.add(seed);
      workQueue.push(seed);
    });
  });

  while (workQueue.length > 0) {
    const state = workQueue.shift();
    if (visited.has(state)) {
      continue;
    }
    visited.add(state);

    const parts = fromCompositeState(state);
    const hybridParts = parts.slice(0, currentElements);
    const constraintState = parts[parts.length - 1];
    const hybridState = toCompositeState(hybridParts);

    const stateColor = mergeStateColors(hybrid.colors[hybridState], constraint.colors[constraintState]);
    if (stateColor) {
      combined.colors[state] = stateColor;
    }

    if (hybrid.errorStates.has(hybridState)) {
      combined.errorStates.add(state);
    }

    const transHybrid = asArray(hybrid.transitionFunction[hybridState]);
    const transConstraint = asArray(constraint.transitionFunction[constraintState]);

    const nextTransitions = [];

    transHybrid.forEach(({ symbol, target }) => {
      let matched = false;

      transConstraint.forEach(({ symbol: cSymbol, target: cTarget }) => {
        if (symbol !== cSymbol) {
          return;
        }

        matched = true;
        const targetState = toCompositeState([ ...fromCompositeState(target), cTarget ]);
        nextTransitions.push({ symbol, target: targetState });
      });

      if (!matched) {
        const targetState = toCompositeState([ ...fromCompositeState(target), constraintState ]);
        nextTransitions.push({ symbol, target: targetState });
      }
    });

    if (transConstraint.length === 0) {
      transHybrid.forEach(({ symbol, target }) => {
        const targetState = toCompositeState([ ...fromCompositeState(target), constraintState ]);
        nextTransitions.push({ symbol, target: targetState });
      });
    }

    combined.transitionFunction[state] = nextTransitions;

    nextTransitions.forEach(({ target }) => {
      if (!combined.states.has(target)) {
        combined.states.add(target);
      }
      if (!visited.has(target)) {
        workQueue.push(target);
      }
    });

    if (hybrid.acceptingStates.has(hybridState)) {
      combined.acceptingStates.add(state);
    }
  }

  return dfaFromInternal(combined);
}

export function add_process(baseDfa, processDfa) {
  return addProcess(baseDfa, processDfa);
}

export function add_constraint(hybridDfa, constraintDfa) {
  return addConstraint(hybridDfa, constraintDfa);
}

export function mergeDFAs(processDfas = [], constraintDfas = []) {
  if (!Array.isArray(processDfas) || processDfas.length === 0) {
    throw new Error('mergeDFAs expects at least one process DFA');
  }

  let merged = null;

  processDfas.forEach(processDfa => {
    merged = addProcess(merged, processDfa);
  });

  asArray(constraintDfas).forEach(constraintDfa => {
    merged = addConstraint(merged, constraintDfa);
  });

  return merged;
}

function reverseTransitionGraph(states, transitionFunction) {
  const reversed = {};

  asArray(states).forEach(state => {
    const key = String(state);
    reversed[key] = reversed[key] || [];
  });

  Object.keys(transitionFunction || {}).forEach(source => {
    const sourceKey = String(source);
    reversed[sourceKey] = reversed[sourceKey] || [];

    asArray(transitionFunction[source]).forEach(edge => {
      if (!edge || edge.target === undefined) {
        return;
      }

      const targetKey = String(edge.target);
      reversed[targetKey] = reversed[targetKey] || [];
      reversed[targetKey].push(sourceKey);
    });
  });

  Object.keys(reversed).forEach(state => {
    reversed[state] = uniqueSorted(reversed[state]);
  });

  return reversed;
}

function reachabilityFromSeeds(adjacency, seeds) {
  const visited = new Set();
  const queue = uniqueSorted(asArray(seeds).map(state => String(state)));

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    asArray(adjacency[current]).forEach(next => {
      const nextState = String(next);
      if (!visited.has(nextState)) {
        queue.push(nextState);
      }
    });
  }

  return uniqueSorted(Array.from(visited));
}

export function addGlobalColor(dfa) {
  const globalColor = {};
  const normalized = normalizeDfa(dfa || {});
  const statesToIterate = Array.from(normalized.states);
  const acceptingSet = normalized.acceptingStates;

  const extractStatuses = (stateColor) => {
    if (!stateColor) {
      return [];
    }

    const fragments = Array.isArray(stateColor) ? stateColor : [ stateColor ];

    return fragments
      .filter(fragment => fragment && typeof fragment === 'object')
      .flatMap(fragment => Object.values(fragment).map(status => String(status)));
  };

  const satisfiedStatuses = new Set([ 'satisfied', 'temporary_satisfied' ]);

  const satFinal = [];
  const violFinal = [];

  statesToIterate.forEach(state => {

    if (!acceptingSet.has(state)) {
      return;
    }

    const statuses = extractStatuses(normalized.colors[state]);

    const allConstraintsSatisfied = statuses.every(status => satisfiedStatuses.has(status));

    if (allConstraintsSatisfied) {
      satFinal.push(state);
    } else {
      violFinal.push(state);
    }
  });

  const finalStates = {
    SatFinal: uniqueSorted(satFinal),
    ViolFinal: uniqueSorted(violFinal)
  };

  const reversedGraph = reverseTransitionGraph(normalized.states, normalized.transitionFunction);

  const reachability = {
    FromSatFinal: reachabilityFromSeeds(reversedGraph, finalStates.SatFinal),
    FromViolFinal: reachabilityFromSeeds(reversedGraph, finalStates.ViolFinal)
  };

  const fromSatFinalSet = new Set(reachability.FromSatFinal);
  const fromViolFinalSet = new Set(reachability.FromViolFinal);
  const satFinalSet = new Set(finalStates.SatFinal);
  const violFinalSet = new Set(finalStates.ViolFinal);

  for (const state of normalized.states) {
    if (fromSatFinalSet.has(state) && !fromViolFinalSet.has(state)) {
      globalColor[state] = { 'global': 'satisfied' };
    }
    else if (fromViolFinalSet.has(state) && !fromSatFinalSet.has(state)) {
      globalColor[state] = { 'global': 'violated' };
    }
    else if (satFinalSet.has(state)) {
      globalColor[state] = { 'global': 'temporary_satisfied' };
    }
    else if (violFinalSet.has(state)) {
      globalColor[state] = { 'global': 'temporary_violated' };
    }
    else {
      globalColor[state] = { 'global': 'inconclusive' };
    }
  }

  if (dfa && typeof dfa === 'object') {
    dfa.globalColor = globalColor;
  }

  return dfa;
}


