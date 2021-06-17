import { SHAPE, FIT } from "three-ammo/constants";

function exceedsDensityThreshold(count, subtree) {
  const bounds = subtree.boundingData;
  const triangleThreshold = 1000;
  const minimumVolume = 0.1;
  const minimumTriangles = 100;
  const dx = bounds[3] - bounds[0];
  const dy = bounds[4] - bounds[1];
  const dz = bounds[5] - bounds[2];
  const volume = dx * dy * dz;

  if (volume < minimumVolume) {
    return false;
  }

  if (count < minimumTriangles) {
    return false;
  }

  return count / volume > triangleThreshold;
}

function isHighDensity(subtree) {
  if (subtree.continueGeneration) {
    subtree.continueGeneration();
  }
  if (subtree.count) {
    const result = exceedsDensityThreshold(subtree.count, subtree);
    return result === true ? true : subtree.count;
  } else {
    const leftResult = isHighDensity(subtree.left);
    if (leftResult === true) return true;
    const rightResult = isHighDensity(subtree.right);
    if (rightResult === true) return true;

    const count = leftResult + rightResult;
    const result = exceedsDensityThreshold(count, subtree);
    return result === true ? true : count;
  }
}

function isGeometryHighDensity(geo) {
  const bvh = geo.boundsTree;
  const roots = bvh._roots;
  for (let i = 0; i < roots.length; ++i) {
    return isHighDensity(roots[i]) === true;
  }
  return false;
}

export const traverseMeshesAndAddShapes = (function() {
  const shapePrefix = "shape-helper__";
  const shapes = [];
  return function(el) {
    const meshRoot = el.object3DMap.mesh;
    while (shapes.length > 0) {
      const { id, entity } = shapes.pop();
      entity.removeAttribute(id);
    }

    console.group("traverseMeshesAndAddShapes");

    if (document.querySelector(["[shape-helper__trimesh]", "[shape-helper__heightfield]"])) {
      console.log("heightfield or trimesh found on scene");
    } else {
      console.log("collision not found in scene");

      let isHighDensity = false;
      meshRoot.traverse(o => {
        if (
          o.isMesh &&
          (!THREE.Sky || o.__proto__ != THREE.Sky.prototype) &&
          !o.name.startsWith("Floor_Plan") &&
          !o.name.startsWith("Ground_Plane") &&
          o.geometry.boundsTree
        ) {
          if (isGeometryHighDensity(o.geometry)) {
            isHighDensity = true;
            return;
          }
        }
      });

      let navMesh = null;

      if (isHighDensity) {
        console.log("mesh contains high triangle density region");
        navMesh = document.querySelector("[nav-mesh]");
      }

      if (navMesh) {
        console.log(`mesh density exceeded, using floor plan only`);
        navMesh.setAttribute(shapePrefix + "floorPlan", {
          type: SHAPE.MESH,
          margin: 0.01,
          fit: FIT.ALL,
          includeInvisible: true
        });
        shapes.push({ id: shapePrefix + "floorPlan", entity: navMesh });
      } else if (!isHighDensity) {
        el.setAttribute(shapePrefix + "environment", {
          type: SHAPE.MESH,
          margin: 0.01,
          fit: FIT.ALL
        });
        shapes.push({ id: shapePrefix + "environment", entity: el });
        console.log("adding mesh shape for all visible meshes");
      } else {
        el.setAttribute(shapePrefix + "defaultFloor", {
          type: SHAPE.BOX,
          margin: 0.01,
          halfExtents: { x: 4000, y: 0.5, z: 4000 },
          offset: { x: 0, y: -0.5, z: 0 },
          fit: FIT.MANUAL
        });
        shapes.push({ id: shapePrefix + "defaultFloor", entity: el });
        console.log("adding default floor collision");
      }
    }
    console.groupEnd();
  };
})();
