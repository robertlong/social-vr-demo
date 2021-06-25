import { forEachMaterial } from "../utils/material-utils";
import { showHoverEffect } from "../utils/permissions-utils";
import { mapMaterials } from "../utils/material-utils";
import mediaHighlightFrag from "../materials/media-highlight-frag.glsl";

const interactorOneTransform = [];
const interactorTwoTransform = [];

const validMaterials = ["MeshStandardMaterial", "MeshBasicMaterial", "MeshPhongMaterial"];

function injectCustomShaderChunks(scene, obj) {
  const vertexRegex = /\bskinning_vertex\b/;
  const fragRegex = /\bgl_FragColor\b/;

  const modifiedMaterials = [];
  const batchManagerSystem = scene.systems["hubs-systems"].batchManagerSystem;

  obj.traverse(object => {
    if (!object.material) return;

    object.material = mapMaterials(object, material => {
      if (!validMaterials.includes(material.type)) {
        return material;
      }

      if (material.hubs_InjectedCustomShaderChunks) {
        modifiedMaterials.push(material);
        return material;
      }

      // HACK, this routine inadvertently leaves the A-Frame shaders wired to the old, dark
      // material, so maps cannot be updated at runtime. This breaks UI elements who have
      // hover/toggle state, so for now just skip these while we figure out a more correct
      // solution.
      if (
        object.el.classList.contains("ui") ||
        object.el.classList.contains("hud") ||
        object.el.getAttribute("text-button")
      )
        return material;

      // Used when the object is batched
      if (batchManagerSystem.batchingEnabled) {
        batchManagerSystem.meshToEl.set(object, obj.el);
      }

      const newMaterial = material.clone();

      newMaterial.hubs_IsFrozen = { value: false };
      newMaterial.hubs_EnableSweepingEffect = { value: false };
      newMaterial.hubs_SweepParams = { value: [0, 0] };
      newMaterial.hubs_InteractorOnePos = { value: [0, 0, 0] };
      newMaterial.hubs_InteractorTwoPos = { value: [0, 0, 0] };
      newMaterial.hubs_HighlightInteractorOne = { value: false };
      newMaterial.hubs_HighlightInteractorTwo = { value: false };
      newMaterial.hubs_Time = { value: 0 };

      modifiedMaterials.push(newMaterial);

      // This will not run if the object is never rendered unbatched, since its unbatched shader will never be compiled
      newMaterial.onBeforeCompile = (shader, renderer) => {
        if (!vertexRegex.test(shader.vertexShader)) return;

        if (material.onBeforeCompile) {
          material.onBeforeCompile(shader, renderer);
        }

        shader.uniforms.hubs_IsFrozen = newMaterial.hubs_IsFrozen;
        shader.uniforms.hubs_EnableSweepingEffect = newMaterial.hubs_EnableSweepingEffect;
        shader.uniforms.hubs_SweepParams = newMaterial.hubs_SweepParams;
        shader.uniforms.hubs_InteractorOnePos = newMaterial.hubs_InteractorOnePos;
        shader.uniforms.hubs_InteractorTwoPos = newMaterial.hubs_InteractorTwoPos;
        shader.uniforms.hubs_HighlightInteractorOne = newMaterial.hubs_HighlightInteractorOne;
        shader.uniforms.hubs_HighlightInteractorTwo = newMaterial.hubs_HighlightInteractorTwo;
        shader.uniforms.hubs_Time = newMaterial.hubs_Time;

        const vchunk = `
        if (hubs_HighlightInteractorOne || hubs_HighlightInteractorTwo || hubs_IsFrozen) {
          vec4 wt = modelMatrix * vec4(transformed, 1);

          // Used in the fragment shader below.
          hubs_WorldPosition = wt.xyz;
        }
        `;

        const vlines = shader.vertexShader.split("\n");
        const vindex = vlines.findIndex(line => vertexRegex.test(line));
        vlines.splice(vindex + 1, 0, vchunk);
        vlines.unshift("varying vec3 hubs_WorldPosition;");
        vlines.unshift("uniform bool hubs_IsFrozen;");
        vlines.unshift("uniform bool hubs_HighlightInteractorOne;");
        vlines.unshift("uniform bool hubs_HighlightInteractorTwo;");
        shader.vertexShader = vlines.join("\n");

        const flines = shader.fragmentShader.split("\n");
        const findex = flines.findIndex(line => fragRegex.test(line));
        flines.splice(findex + 1, 0, mediaHighlightFrag);
        flines.unshift("varying vec3 hubs_WorldPosition;");
        flines.unshift("uniform bool hubs_IsFrozen;");
        flines.unshift("uniform bool hubs_EnableSweepingEffect;");
        flines.unshift("uniform vec2 hubs_SweepParams;");
        flines.unshift("uniform bool hubs_HighlightInteractorOne;");
        flines.unshift("uniform vec3 hubs_InteractorOnePos;");
        flines.unshift("uniform bool hubs_HighlightInteractorTwo;");
        flines.unshift("uniform vec3 hubs_InteractorTwoPos;");
        flines.unshift("uniform float hubs_Time;");
        shader.fragmentShader = flines.join("\n");
      };
      newMaterial.needsUpdate = true;
      newMaterial.hubs_InjectedCustomShaderChunks = true;
      return newMaterial;
    });
  });

  return modifiedMaterials;
}

/**
 * Applies effects to a hoverable based on hover state.
 * @namespace interactables
 * @component hoverable-visuals
 */
AFRAME.registerComponent("hoverable-visuals", {
  schema: {
    enableSweepingEffect: { type: "boolean", default: true }
  },
  init() {
    this.modifiedMaterials = [];
    this.geometryRadius = 0;
    this.sweepParams = [0, 0];
    this.boundingBox = new THREE.Box3();
    this.boundingSphere = new THREE.Sphere();
    this.onUpdateMaterials = this.onUpdateMaterials.bind(this);
    this.el.addEventListener("media-loaded", this.onUpdateMaterials);
    this.onUpdateMaterials();
  },

  onUpdateMaterials() {
    this.modifiedMaterials = injectCustomShaderChunks(this.el.sceneEl, this.el.object3D);
    this.boundingBox.setFromObject(this.el.object3D);
    this.boundingBox.getBoundingSphere(this.boundingSphere);
    this.geometryRadius = this.boundingSphere.radius / this.el.object3D.scale.y;
  },

  remove() {
    this.modifiedMaterials = null;
    this.boundingBox = null;

    // Used when the object is batched
    const batchManagerSystem = this.el.sceneEl.systems["hubs-systems"].batchManagerSystem;
    this.el.object3D.traverse(object => {
      if (!object.material) return;
      forEachMaterial(object, material => {
        if (
          !validMaterials.includes(material.type) ||
          object.el.classList.contains("ui") ||
          object.el.classList.contains("hud") ||
          object.el.getAttribute("text-button")
        )
          return;

        if (batchManagerSystem.batchingEnabled) {
          batchManagerSystem.meshToEl.delete(object);
        }
      });
    });

    const isMobile = AFRAME.utils.device.isMobile();
    const isMobileVR = AFRAME.utils.device.isMobileVR();
    this.isTouchscreen = isMobile && !isMobileVR;
  },

  tick(time) {
    if (!this.modifiedMaterials.length) return;

    const isFrozen = this.el.sceneEl.is("frozen");
    const showEffect = showHoverEffect(this.el);
    const toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;

    let interactorOne, interactorTwo;
    const interaction = this.el.sceneEl.systems.interaction;
    if (!interaction.ready) return; //DOMContentReady workaround
    if (interaction.state.leftHand.hovered === this.el && !interaction.state.leftHand.held) {
      interactorOne = interaction.options.leftHand.entity.object3D;
    }
    if (
      interaction.state.leftRemote.hovered === this.el &&
      !interaction.state.leftRemote.held &&
      !toggling.leftToggledOff
    ) {
      interactorOne = interaction.options.leftRemote.entity.object3D;
    }
    if (
      interaction.state.rightRemote.hovered === this.el &&
      !interaction.state.rightRemote.held &&
      !toggling.rightToggledOff
    ) {
      interactorTwo = interaction.options.rightRemote.entity.object3D;
    }
    if (interaction.state.rightHand.hovered === this.el && !interaction.state.rightHand.held) {
      interactorTwo = interaction.options.rightHand.entity.object3D;
    }

    if (interactorOne) {
      interactorOne.matrixWorld.toArray(interactorOneTransform);
    }
    if (interactorTwo) {
      interactorTwo.matrixWorld.toArray(interactorTwoTransform);
    }

    if (interactorOne || interactorTwo || isFrozen) {
      const worldY = this.el.object3D.matrixWorld.elements[13];
      const ms1 = this.el.object3D.matrixWorld.elements[4];
      const ms2 = this.el.object3D.matrixWorld.elements[5];
      const ms3 = this.el.object3D.matrixWorld.elements[6];
      const worldScale = Math.sqrt(ms1 * ms1 + ms2 * ms2 + ms3 * ms3);
      const scaledRadius = worldScale * this.geometryRadius;
      this.sweepParams[0] = worldY - scaledRadius;
      this.sweepParams[1] = worldY + scaledRadius;
    }

    for (let i = 0, l = this.modifiedMaterials.length; i < l; i++) {
      const material = this.modifiedMaterials[i];
      material.hubs_EnableSweepingEffect.value = this.data.enableSweepingEffect && showEffect;
      material.hubs_IsFrozen.value = isFrozen;
      material.hubs_SweepParams.value = this.sweepParams;

      material.hubs_HighlightInteractorOne.value = !!interactorOne && showEffect && !this.isTouchscreen;
      material.hubs_InteractorOnePos.value[0] = interactorOneTransform[12];
      material.hubs_InteractorOnePos.value[1] = interactorOneTransform[13];
      material.hubs_InteractorOnePos.value[2] = interactorOneTransform[14];

      material.hubs_HighlightInteractorTwo.value = !!interactorTwo && showEffect && !this.isTouchscreen;
      material.hubs_InteractorTwoPos.value[0] = interactorTwoTransform[12];
      material.hubs_InteractorTwoPos.value[1] = interactorTwoTransform[13];
      material.hubs_InteractorTwoPos.value[2] = interactorTwoTransform[14];

      if (interactorOne || interactorTwo || isFrozen) {
        material.hubs_Time.value = time;
      }
    }
  }
});
