import {
  domify,
  classes as domClasses,
  event as domEvent,
  query as domQuery
} from 'min-dom';

import {
  TOGGLE_MODE_EVENT,
  COLOR_MODE_CHANGED_EVENT
} from '../../../util/EventHelper';

import {
  ToggleOffIcon,
  ToggleOnIcon
} from '../../../icons';

import { test } from '../../../monitor/bpmn_dfa';

export default function ToggleMode(
    eventBus, canvas, selection,
    contextPad, bpmnjs) {

  this._eventBus = eventBus;
  this._canvas = canvas;
  this._selection = selection;
  this._contextPad = contextPad;
  this._bpmnjs = bpmnjs;
  this._active = false;
  this._useGlobalColorMode = false;
  this._bpmnjs.__useGlobalColorMode = this._useGlobalColorMode;

  eventBus.on('import.parse.start', () => {

    if (this._active) {
      this.toggleMode(false);

      eventBus.once('import.done', () => {
        this.toggleMode(true);
      });
    }
  });

  eventBus.on('diagram.init', () => {
    this._canvasParent = this._canvas.getContainer().parentNode;
    this._palette = domQuery('.djs-palette', this._canvas.getContainer());

    this._init();
  });
}

ToggleMode.prototype._init = function() {
  this._container = domify(`
    <div class="bts-toggle-mode">
      Simulation & Monitor <span class="bts-toggle">${ ToggleOffIcon() }</span>
    </div>
  `);

  this._colorModeContainer = domify(`
    <div class="bts-color-mode" title="Toggle Local/Global constraint coloring">
      Color: Local <span class="bts-toggle">${ ToggleOffIcon() }</span>
    </div>
  `);

  domEvent.bind(this._container, 'click', () => this.toggleMode());
  domEvent.bind(this._colorModeContainer, 'click', () => this.toggleColorMode());

  this._canvas.getContainer().appendChild(this._container);
  this._canvas.getContainer().appendChild(this._colorModeContainer);

  // Ensure monitor logic receives a deterministic default mode.
  this._eventBus.fire(COLOR_MODE_CHANGED_EVENT, {
    useGlobalColorMode: this._useGlobalColorMode
  });
};

ToggleMode.prototype.toggleColorMode = function(useGlobalColorMode = !this._useGlobalColorMode) {
  if (useGlobalColorMode === this._useGlobalColorMode) {
    return;
  }

  if (useGlobalColorMode) {
    this._colorModeContainer.innerHTML = `Color: Global <span class="bts-toggle">${ ToggleOnIcon() }</span>`;
    domClasses(this._colorModeContainer).add('active');
  } else {
    this._colorModeContainer.innerHTML = `Color: Local <span class="bts-toggle">${ ToggleOffIcon() }</span>`;
    domClasses(this._colorModeContainer).remove('active');
  }

  this._eventBus.fire(COLOR_MODE_CHANGED_EVENT, {
    useGlobalColorMode
  });

  this._bpmnjs.__useGlobalColorMode = useGlobalColorMode;
  this._useGlobalColorMode = useGlobalColorMode;
};

ToggleMode.prototype.toggleMode = function(active = !this._active) {

  if (active === this._active) {
    return;
  }

  if (active) {
    this._container.innerHTML = `Simulation & Monitor <span class="bts-toggle">${ ToggleOnIcon() }</span>`;

    domClasses(this._canvasParent).add('simulation');
    domClasses(this._palette).add('hidden');

    if (this._bpmnjs.getDefinitions) {
      test(this._bpmnjs);
    }

  } else {
    this._container.innerHTML = `Simulation & Monitor <span class="bts-toggle">${ ToggleOffIcon() }</span>`;
    domClasses(this._canvasParent).remove('simulation');
    domClasses(this._palette).remove('hidden');

    const elements = this._selection.get();

    if (elements.length === 1) {
      this._contextPad.open(elements[0]);
    }
  }

  this._eventBus.fire(TOGGLE_MODE_EVENT, {
    active
  });

  this._active = active;
};

ToggleMode.$inject = [
  'eventBus',
  'canvas',
  'selection',
  'contextPad',
  'bpmnjs'
];