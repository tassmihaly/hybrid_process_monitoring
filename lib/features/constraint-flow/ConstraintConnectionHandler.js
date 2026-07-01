import ConstraintFlowState from './ConstraintFlowState';

export default function ConstraintConnectionHandler(eventBus, moddle, elementFactory, bpmnRules) {

  let reconnectConstraintConnection = null;

  const debug = (...args) => {
    if (typeof window !== 'undefined' && window.__constraintFlowDebug) {
      console.debug('[ConstraintConnectionHandler]', ...args);
    }
  };

  const getElementType = (element) => {
    return element && (element.type || (element.businessObject && element.businessObject.$type) || element.$type) || '';
  };

  const isTaskOrActivity = (element) => {
    const type = getElementType(element);

    return !!(type && (type.includes('Activity') || type.includes('Task')));
  };

  const getParticipant = (element) => {
    let current = element;

    while (current) {
      if (getElementType(current) === 'bpmn:Participant') {
        return current;
      }

      current = current.parent || current.$parent || null;
    }

    return null;
  };

  const canReconnectConstraintFlow = (source, target) => {
    if (!isTaskOrActivity(source) || !isTaskOrActivity(target)) {
      return false;
    }

    const sourcePool = getParticipant(source);
    const targetPool = getParticipant(target);

    if (!(sourcePool && targetPool && sourcePool.id !== targetPool.id)) {
      return false;
    }

    return {
      type: 'constraint:ConstraintFlow'
    };
  };

  // bpmn-js reconnect replacement uses bpmnRules.canConnect directly.
  // Preserve custom type for already existing constraint flows.
  if (bpmnRules && !bpmnRules.__constraintFlowCanConnectPatched) {
    const originalCanConnect = bpmnRules.canConnect.bind(bpmnRules);

    bpmnRules.canConnect = function(source, target, connection) {
      // During reconnect replacement bpmn-js may call canConnect(source, target)
      // without passing the connection, so we keep a short-lived reconnect reference.
      const reconnectConnection = connection || reconnectConstraintConnection;
      const isConstraintFlow = getElementType(reconnectConnection) === 'constraint:ConstraintFlow';

      if (isConstraintFlow) {
        const result = canReconnectConstraintFlow(source, target);

        debug('forcing canConnect result for constraint reconnect', {
          sourceType: getElementType(source),
          targetType: getElementType(target),
          result
        });

        return result;
      }

      return originalCanConnect(source, target, connection);
    };

    bpmnRules.__constraintFlowCanConnectPatched = true;
  }

  eventBus.on('commandStack.connection.reconnect.preExecute', 2000, function(event) {
    const { connection } = event.context;

    if (getElementType(connection) === 'constraint:ConstraintFlow') {
      reconnectConstraintConnection = connection;
      debug('tracked constraint reconnect preExecute', { id: connection && connection.id });
    }
  });

  const clearReconnectConstraintConnection = function(event) {
    if (!reconnectConstraintConnection) {
      return;
    }

    const contextConnection = event && event.context && event.context.connection;
    const sameConnection = !contextConnection || contextConnection === reconnectConstraintConnection;

    if (sameConnection) {
      debug('clearing tracked constraint reconnect', {
        id: reconnectConstraintConnection && reconnectConstraintConnection.id,
        finalType: contextConnection ? getElementType(contextConnection) : null
      });
      reconnectConstraintConnection = null;
    }
  };

  eventBus.on('commandStack.connection.reconnect.postExecute', clearReconnectConstraintConnection);
  eventBus.on('commandStack.connection.reconnect.reverted', clearReconnectConstraintConnection);
  eventBus.on('commandStack.connection.reconnect.rejected', clearReconnectConstraintConnection);

  const originalCreateConnection = elementFactory.createConnection;
  elementFactory.createConnection = function(attrs, ...rest) {
    if (ConstraintFlowState.constraintFlowType && !attrs.type) {
      attrs.type = 'constraint:ConstraintFlow';
    }
    return originalCreateConnection.call(this, attrs, ...rest);
  };

  eventBus.on('commandStack.connection.create.preExecute', function(event) {

    const context = event.context;
    const { source, target, connection } = context;

    // Check for our custom flag
    if (ConstraintFlowState.constraintFlowType) {
      connection.businessObject = moddle.create('constraint:ConstraintFlow', {
        id: connection.id,
        constraintType: ConstraintFlowState.constraintFlowType,
        sourceRef: source.businessObject,
        targetRef: target.businessObject,
      });
      connection.type = 'constraint:ConstraintFlow';
      ConstraintFlowState.constraintFlowType = null;
    }
  });

  eventBus.on('connect.ended', function() {
    ConstraintFlowState.constraintFlowType = null;
  });

  eventBus.on('connect.canceled', function() {
    ConstraintFlowState.constraintFlowType = null;
  });
}

ConstraintConnectionHandler.$inject = [ 'eventBus', 'moddle', 'elementFactory', 'bpmnRules' ];