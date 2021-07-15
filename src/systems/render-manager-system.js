// We disable batching manager because of some problems.
// BatchManagerSystem has some dependencies with our Three.js fork.
// Build errors with the upstreaming official Three.js.
// So replacing BatchManagerSystem with a stub so far.
// We may revert and update it when we will enable again.

export class BatchManagerSystem {
  constructor(/*scene, renderer*/) {}

  get batchingEnabled() {
    return false;
  }

  set batchingEnabled(enabled) {
    // Ignore
  }

  addObject(/*rootObject*/) {
    return 0;
  }

  removeObject(/*rootObject*/) {
    return;
  }

  tick(/*time*/) {
    return;
  }
}
