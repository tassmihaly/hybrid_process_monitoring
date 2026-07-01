
import inherits from 'inherits-browser';
import ConstraintFlowState from './ConstraintFlowState';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

export default function ConstraintRules(eventBus, elementRegistry) {
  console.log('ConstraintRules loaded');
  RuleProvider.call(this, eventBus);
  this._elementRegistry = elementRegistry;
}

inherits(ConstraintRules, RuleProvider);

ConstraintRules.$inject = [ 'eventBus', 'elementRegistry' ];


ConstraintRules.prototype.init = function() {

  const getElementType = (element) => {
    return element && (element.type || element.$type) || '';
  };

  const isTaskOrActivity = (element) => {
    const type = getElementType(element);

    return !!(type && (
      type.includes('Activity') || type.includes('Task')
    ));
  };

  const getParticipant = (element) => {
    let current = element;

    while (current) {
      if (getElementType(current) === 'bpmn:Participant') {
        return current;
      }

      // Works for both diagram elements (parent) and moddle elements ($parent).
      current = current.parent || current.$parent || null;
    }

    return null;
  };

  const canConnectConstraintFlow = (source, target) => {
    if (!isTaskOrActivity(source) || !isTaskOrActivity(target)) {
      return false;
    }

    const sourcePool = getParticipant(source);
    const targetPool = getParticipant(target);

    // Constraint flows are only valid across different pools.
    if (!(sourcePool && targetPool && sourcePool.id !== targetPool.id)) {
      return false;
    }

    return {
      type: 'constraint:ConstraintFlow'
    };
  };

  this.addRule('connection.start', 1500, (context) => {
    if (ConstraintFlowState.constraintFlowType) {
      const { source } = context;
      return isTaskOrActivity(source);
    }
  });

  this.addRule('connection.create', 1500, (context) => {
    if (ConstraintFlowState.constraintFlowType) {
      const { source, target } = context;
      return canConnectConstraintFlow(source, target);
    }
  });

  this.addRule('connection.reconnect', 1500, (context) => {
    const { connection, source, target } = context;
    const isConstraintFlow =
      connection && connection.businessObject && connection.businessObject.$type === 'constraint:ConstraintFlow';

    if (isConstraintFlow) {
      // Keep constraint flows as constraint flows on reconnect.
      return canConnectConstraintFlow(source, target);
    }
  });

};