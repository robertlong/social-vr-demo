const zeroPos = new THREE.Vector3(0, 0, 0);
const zeroQuat = new THREE.Quaternion();
const oneScale = new THREE.Vector3(1, 1, 1);
const identity = new THREE.Matrix4();
identity.identity();

/**
With this patch you must make sure to follow these rules or very strange things will happen.
- If you modify an object's position, rotation, quaternion, or scale you MUST set matrixNeedsUpdate.
- If you modify an object's matrix
      you MUST decompose() back onto its position, quaternion and scale and
      you MUST set matrixWorldNeedsUpdate (or matrixNeedsUpdate, but the former is more correct).
      (applyMatrix() and updateMatrix() handle this for you)
- If you modify an object's matrixWorld
      you MUST make sure it has previously been modified so that it is not using its parent matrix as its own,
      you MUST update its local matrix,
      you MUST update its position/quaternion/scale, and
      you MUST set childrenNeedMatrixWorldUpdate.
      (setMatrixWorld() handles all of this for you)
- Before you read an object's matrix you MUST call updateMatrix() or updateMatrices().
- Before you read an object's matrixWorld you MUST call updateMatrices().
      (getWorldPosition, getWorldOrientation and getWorldScale handle this for you)
- Do not set matrixIsModified yourself; You could accidentally overwrite a shared parent matrixWorld.
- Note updateMatrix, updateMatrixWorld, updateWorldMatrix, updateMatrices, setMatrixWorld,
      matrixNeedsUpdate, matrixWorldNeedsUpdate, and matrixIsModified are all different things.
      Most already exist in ThreeJS but some have been added here.
      Double check you are using the one you intend to.
      Be on the lookout for compatibility issues with third party libraries.
*/

// Patch animation system
const bindingSetters = THREE.PropertyBinding.prototype.SetterByBindingTypeAndVersioning;
const Versioning = THREE.PropertyBinding.prototype.Versioning;

// For all binding types, monkey patch the setters that require world matrix
// updates to also flip matrixNeedsUpdate
for (let i = 0; i < bindingSetters.length; i++) {
  const setter = bindingSetters[i][Versioning.MatrixWorldNeedsUpdate];
  if (!setter) continue;

  bindingSetters[i][Versioning.MatrixWorldNeedsUpdate] = function() {
    const v = setter.apply(this, arguments);
    this.targetObject.matrixNeedsUpdate = true;
    return v;
  };
}

THREE.Object3D.prototype.getWorldPosition = function(target) {
  if (target === undefined) {
    console.warn("THREE.Object3D: .getWorldPosition() target is now required");
    target = new THREE.Vector3();
  }

  // New function, defined below (used instead of updateMatrixWorld)
  this.updateMatrices();

  return target.setFromMatrixPosition(this.matrixWorld);
};

THREE.Object3D.prototype.getWorldQuaternion = (function() {
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  return function getWorldQuaternion(target) {
    if (target === undefined) {
      console.warn("THREE.Object3D: .getWorldQuaternion() target is now required");
      target = new THREE.Quaternion();
    }

    // New function, defined below (used instead of updateMatrixWorld)
    this.updateMatrices();
    this.matrixWorld.decompose(position, target, scale);

    return target;
  };
})();

THREE.Object3D.getWorldScale = (function() {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();

  return function getWorldScale(target) {
    if (target === undefined) {
      console.warn("THREE.Object3D: .getWorldScale() target is now required");
      target = new THREE.Vector3();
    }

    // New function, defined below (used instead of updateMatrixWorld)
    this.updateMatrices();
    this.matrixWorld.decompose(position, quaternion, target);

    return target;
  };
})();

const handleMatrixModification = o => {
  if (!o.matrixIsModified) {
    o.matrixIsModified = true;

    if (o.cachedMatrixWorld) {
      o.cachedMatrixWorld.copy(o.matrixWorld);
      o.matrixWorld = o.cachedMatrixWorld;
    }
  }
};

const updateMatrix = THREE.Object3D.prototype.updateMatrix;
THREE.Object3D.prototype.updateMatrix = function() {
  updateMatrix.apply(this, arguments);
  handleMatrixModification(this);
};

const applyMatrix4 = THREE.Object3D.prototype.applyMatrix4;
THREE.Object3D.prototype.applyMatrix4 = function() {
  applyMatrix4.apply(this, arguments);
  handleMatrixModification(this);
};

// Updates this function to use updateMatrices(). In general our code should prefer calling updateMatrices() directly,
// patching this for compatibility upstream, namely with Box3.expandToObject and Object3D.attach
THREE.Object3D.prototype.updateWorldMatrix = function(updateParents, updateChildren) {
  this.updateMatrices(false, false, !updateParents);
  if (updateChildren) {
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].updateMatrixWorld(false, false);
    }
    if (this.childrenNeedMatrixWorldUpdate) this.childrenNeedMatrixWorldUpdate = false;
  }
};

// By the end of this function this.matrix reflects the updated local matrix
// and this.matrixWorld reflects the updated world matrix, taking into account
// parent matrices.
//
// forceLocalUpdate - Forces the local matrix to be updated regardless of if it has not
// been marked dirty.
//
// forceWorldUpdate - Forces the world matrix to be updated regardless of if the local matrix
// has been updated since the last update.
//
// skipParents - unless true, all parent matricies are updated before updating this object's
// local and world matrix.
//
THREE.Object3D.prototype.updateMatrices = function(forceLocalUpdate, forceWorldUpdate, skipParents) {
  if (!this.hasHadFirstMatrixUpdate) {
    if (
      !this.position.equals(zeroPos) ||
      !this.quaternion.equals(zeroQuat) ||
      !this.scale.equals(oneScale) ||
      !this.matrix.equals(identity)
    ) {
      // Only update the matrix the first time if its non-identity, this way
      // this.matrixIsModified will remain false until the default
      // identity matrix is updated.
      this.updateMatrix();
    }

    this.hasHadFirstMatrixUpdate = true;
    this.matrixWorldNeedsUpdate = true;
    this.cachedMatrixWorld = this.matrixWorld;
  } else if (this.matrixNeedsUpdate || this.matrixAutoUpdate || forceLocalUpdate) {
    // updateMatrix() sets matrixWorldNeedsUpdate = true
    this.updateMatrix();
    if (this.matrixNeedsUpdate) this.matrixNeedsUpdate = false;
  }

  if (!skipParents && this.parent) {
    this.parent.updateMatrices(false, forceWorldUpdate, false);
    this.matrixWorldNeedsUpdate = this.matrixWorldNeedsUpdate || this.parent.childrenNeedMatrixWorldUpdate;
  }

  if (this.matrixWorldNeedsUpdate || forceWorldUpdate) {
    if (this.parent === null) {
      this.matrixWorld.copy(this.matrix);
    } else {
      // If the matrix is unmodified, it is the identity matrix,
      // and hence we can use the parent's world matrix directly.
      //
      // Note this assumes all callers will either not pass skipParents=true
      // *or* will update the parent themselves beforehand as is done in
      // updateMatrixWorld.
      if (!this.matrixIsModified) {
        this.matrixWorld = this.parent.matrixWorld;
      } else {
        // Once matrixIsModified === true, this.matrixWorld has been updated to be a local
        // copy, not a reference to this.parent.matrixWorld (see updateMatrix/applyMatrix)
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
    }

    this.childrenNeedMatrixWorldUpdate = true;
    this.matrixWorldNeedsUpdate = false;
  }
};

// Computes this object's matrices and then the recursively computes the matrices of all the children.
//
// forceWorldUpdate - If true and the object is visible, will force the world matrix to be updated for
// this node and all of its children.
//
// includeInvisible - If true, does not ignore non-visible objects.
THREE.Object3D.prototype.updateMatrixWorld = function(forceWorldUpdate, includeInvisible) {
  if (!this.visible && !includeInvisible) return;

  // Do not recurse upwards, since this is recursing downwards
  this.updateMatrices(false, forceWorldUpdate, true);

  const children = this.children;
  const forceChildrenWorldUpdate = this.childrenNeedMatrixWorldUpdate || forceWorldUpdate;

  for (let i = 0, l = children.length; i < l; i++) {
    children[i].updateMatrixWorld(forceChildrenWorldUpdate, includeInvisible);
  }

  if (this.childrenNeedMatrixWorldUpdate) this.childrenNeedMatrixWorldUpdate = false;
};

// Updates this function to use updateMatrices() to avoid extra matrix computations
THREE.Object3D.prototype.lookAt = (function() {
  // This method does not support objects having non-uniformly-scaled parent(s)

  const q1 = new THREE.Quaternion();
  const m1 = new THREE.Matrix4();
  const target = new THREE.Vector3();
  const position = new THREE.Vector3();

  return function lookAt(x, y, z) {
    if (x.isVector3) {
      target.copy(x);
    } else {
      target.set(x, y, z);
    }

    const parent = this.parent;

    if (parent) {
      parent.updateMatrices();
    }
    this.updateMatrices(); // hubs change

    position.setFromMatrixPosition(this.matrixWorld);

    if (this.isCamera || this.isLight) {
      m1.lookAt(position, target, this.up);
    } else {
      m1.lookAt(target, position, this.up);
    }

    this.quaternion.setFromRotationMatrix(m1);

    if (parent) {
      m1.extractRotation(parent.matrixWorld);
      q1.setFromRotationMatrix(m1);
      this.quaternion.premultiply(q1.invert());
    }
    this.matrixNeedsUpdate = true;
  };
})();
