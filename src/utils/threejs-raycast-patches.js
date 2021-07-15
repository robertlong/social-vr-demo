// Older Three.js Raycast API ignored invisible objects before
// but the newer one determines whther to ignore or not based on layers.
//
// Change
// https://github.com/mrdoob/three.js/commit/4ce5ba209c6d1712e3728726b0126c34c237a626#diff-e9ba2746300f68606637fd8769a722f23924e93ecb2aefead0163ba251d3e888
// Context
// https://github.com/mrdoob/three.js/issues/14700
//
// We Hubs currently rely on the older Raycast API.
// Switching to the new one for us requires a bunch of code change.
// We want to update our code later so we apply a monkeypatch to Three.js Raycast API so far.

function intersectObject(object, raycaster, intersects, recursive) {
  if (object.visible === false) {
    return;
  }

  object.raycast(raycaster, intersects);

  if (recursive === true) {
    const children = object.children;
    for (let i = 0, l = children.length; i < l; i++) {
      intersectObject(children[i], raycaster, intersects, true);
    }
  }
}

function ascSort(a, b) {
  return a.distance - b.distance;
}

THREE.Raycaster.prototype.intersectObject = function(object, recursive = false, intersects = []) {
  intersectObject(object, this, intersects, recursive);
  intersects.sort(ascSort);
  return intersects;
};

THREE.Raycaster.prototype.intersectObjects = function(objects, recursive = false, intersects = []) {
  for (let i = 0, l = objects.length; i < l; i++) {
    intersectObject(objects[i], this, intersects, recursive);
  }
  intersects.sort(ascSort);
  return intersects;
};
