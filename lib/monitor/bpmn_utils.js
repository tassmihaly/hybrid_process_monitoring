
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

  return {
    current: initialState,
    states,
    alphabet: Array.from(alphabet).sort(),
    transition_function: transitionFunction,
    init_state: initialState,
    accept_states: Array.from(acceptStates),
    colors: {}
  };
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

function normalizeDfa(dfa) {
  const normalizedTransitions = normalizeTransitions(dfa?.transition_function || dfa?.transitionFunction || {});

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
    errorStates
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

  return {
    current: initialStates[0] || null,
    states,
    alphabet,
    transition_function: transitionFunction,
    init_state: initialStates[0] || null,
    accept_states: acceptingStates,
    initial_states: initialStates,
    accepting_states: acceptingStates,
    error_states: errorStates,
    colors: {}
  };
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
      errorStates: new Set()
    };

    process.states.forEach(state => {
      const composite = toCompositeState([ state ]);
      bootstrap.states.add(composite);

      const transitions = asArray(process.transitionFunction[state]);
      bootstrap.transitionFunction[composite] = transitions.map(({ symbol, target }) => ({
        symbol,
        target: toCompositeState([ target ])
      }));
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
    errorStates: new Set()
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
    errorStates: new Set()
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
