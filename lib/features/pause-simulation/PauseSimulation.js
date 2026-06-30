import {
  classes as domClasses
} from 'min-dom';

import {
  TOGGLE_MODE_EVENT,
  PLAY_SIMULATION_EVENT,
  PAUSE_SIMULATION_EVENT,
  RESET_SIMULATION_EVENT,
  SCOPE_CREATE_EVENT,
  TRACE_EVENT
} from '../../util/EventHelper';

import {
  PlayIcon,
  PauseIcon
} from '../../icons';


const PLAY_MARKUP = PlayIcon();
const PAUSE_MARKUP = PauseIcon();

const HIGH_PRIORITY = 1500;


export default function PauseSimulation(
    eventBus, tokenSimulationPalette,
    notifications, canvas) {

  this._eventBus = eventBus;
  this._tokenSimulationPalette = tokenSimulationPalette;
  this._notifications = notifications;

  this.canvasParent = canvas.getContainer().parentNode;

  this.isActive = false;
  this.isPaused = true;

  this._init();

  // unpause on simulation start
  eventBus.on(SCOPE_CREATE_EVENT, HIGH_PRIORITY, event => {
    this.activate();
    this.unpause();
  });

  eventBus.on([
    RESET_SIMULATION_EVENT,
    TOGGLE_MODE_EVENT
  ], () => {
    this.deactivate();
    this.pause();
  });

  eventBus.on(TRACE_EVENT, HIGH_PRIORITY, event => {
    this.unpause();
  });
}

PauseSimulation.prototype._init = function() {
  this.paletteEntry = null;
};

PauseSimulation.prototype.toggle = function() {
  if (this.isPaused) {
    this.unpause();
  } else {
    this.pause();
  }
};

PauseSimulation.prototype.pause = function() {
  if (!this.isActive) {
    return;
  }

  if (this.paletteEntry) {
    domClasses(this.paletteEntry).remove('active');
    this.paletteEntry.innerHTML = PLAY_MARKUP;
  }

  domClasses(this.canvasParent).add('paused');

  this._eventBus.fire(PAUSE_SIMULATION_EVENT);

  this._notifications.showNotification({
    text: 'Pause Simulation'
  });

  this.isPaused = true;
};

PauseSimulation.prototype.unpause = function() {

  if (!this.isActive || !this.isPaused) {
    return;
  }

  if (this.paletteEntry) {
    domClasses(this.paletteEntry).add('active');
    this.paletteEntry.innerHTML = PAUSE_MARKUP;
  }

  domClasses(this.canvasParent).remove('paused');

  this._eventBus.fire(PLAY_SIMULATION_EVENT);

  this._notifications.showNotification({
    text: 'Play Simulation'
  });

  this.isPaused = false;
};

PauseSimulation.prototype.activate = function() {
  this.isActive = true;

  if (this.paletteEntry) {
    domClasses(this.paletteEntry).remove('disabled');
  }
};

PauseSimulation.prototype.deactivate = function() {
  this.isActive = false;

  if (this.paletteEntry) {
    domClasses(this.paletteEntry).remove('active');
    domClasses(this.paletteEntry).add('disabled');
  }
};

PauseSimulation.$inject = [
  'eventBus',
  'tokenSimulationPalette',
  'notifications',
  'canvas'
];