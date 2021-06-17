import { ParticleEmitter } from "lib-hubs/packages/three-particle-emitter/lib/esm/index";
import { textureLoader } from "../utils/media-utils";
import { resolveUrl } from "../utils/media-utils";
import { proxiedUrlFor } from "../utils/media-url-utils";
import defaultSrcImage from "../assets/images/warning_icon.png";

const defaultSrcUrl = new URL(defaultSrcImage, window.location.href).href;

AFRAME.registerComponent("particle-emitter", {
  schema: {
    resolve: { type: "boolean", default: true },
    src: { type: "string", default: defaultSrcUrl },
    startColor: { type: "color" },
    middleColor: { type: "color" },
    endColor: { type: "color" },
    startOpacity: { type: "number", default: 1 },
    middleOpacity: { type: "number", default: 1 },
    endOpacity: { type: "number", default: 1 },
    colorCurve: { type: "string", default: "linear" },
    sizeCurve: { type: "string", default: "linear" },
    startSize: { type: "number", default: 1 },
    endSize: { type: "number", default: 1 },
    sizeRandomness: { type: "number" },
    ageRandomness: { type: "number" },
    lifetime: { type: "number", default: 1 },
    lifetimeRandomness: { type: "number" },
    particleCount: { type: "number", default: 10 },
    startVelocity: { type: "vec3", default: { x: 0, y: 0, z: 1 } },
    endVelocity: { type: "vec3", default: { x: 0, y: 0, z: 1 } },
    velocityCurve: { type: "string", default: "linear" },
    angularVelocity: { type: "number" }
  },

  init() {
    this.particleEmitter = new ParticleEmitter(null);
    this.particleEmitter.visible = false;
    this.el.setObject3D("particle-emitter", this.particleEmitter);
    this.updateParticles = false;
    if (this.data.src === defaultSrcUrl) {
      this.data.resolve = false;
    }
  },

  async setTexture(src, resolve) {
    let accessibleUrl = src;

    if (resolve) {
      const result = await resolveUrl(src);
      let canonicalUrl = result.origin;

      // handle protocol relative urls
      if (canonicalUrl.startsWith("//")) {
        canonicalUrl = location.protocol + canonicalUrl;
      }

      // todo: we don't need to proxy for many things if the canonical URL has permissive CORS headers
      accessibleUrl = proxiedUrlFor(canonicalUrl);
    }

    const texture = await textureLoader.loadAsync(accessibleUrl);

    // Guard against src changing while request was in flight
    if (this.data.src !== src) {
      return;
    }

    this.particleEmitter.material.uniforms.map.value = texture;
    this.particleEmitter.visible = true;
    this.updateParticles = true;
  },

  update(prevData) {
    const data = this.data;
    const particleEmitter = this.particleEmitter;

    if (prevData.src !== data.src) {
      this.setTexture(data.src, data.resolve).catch(console.error);
    }

    if (
      prevData.startColor !== data.startColor ||
      prevData.startSize !== data.startSize ||
      prevData.sizeRandomness !== data.sizeRandomness ||
      prevData.ageRandomness !== data.ageRandomness ||
      prevData.lifetime !== data.lifetime ||
      prevData.lifetimeRandomness !== data.lifetimeRandomness ||
      prevData.particleCount !== data.particleCount
    ) {
      this.updateParticles = true;
    }

    particleEmitter.startColor.set(data.startColor);
    particleEmitter.middleColor.set(data.middleColor);
    particleEmitter.endColor.set(data.endColor);
    particleEmitter.startOpacity = data.startOpacity;
    particleEmitter.middleOpacity = data.middleOpacity;
    particleEmitter.endOpacity = data.endOpacity;
    particleEmitter.colorCurve = data.colorCurve;
    particleEmitter.sizeCurve = data.sizeCurve;
    particleEmitter.startSize = data.startSize;
    particleEmitter.endSize = data.endSize;
    particleEmitter.sizeRandomness = data.sizeRandomness;
    particleEmitter.ageRandomness = data.ageRandomness;
    particleEmitter.lifetime = data.lifetime;
    particleEmitter.lifetimeRandomness = data.lifetimeRandomness;
    particleEmitter.particleCount = data.particleCount;
    particleEmitter.startVelocity.copy(data.startVelocity);
    particleEmitter.endVelocity.copy(data.endVelocity);
    particleEmitter.velocityCurve = data.velocityCurve;
    particleEmitter.angularVelocity = data.angularVelocity;
  },

  tick(time, dt) {
    if (this.updateParticles) {
      this.particleEmitter.updateParticles();
      this.updateParticles = false;
    }

    if (this.particleEmitter.visible) {
      this.particleEmitter.update(dt / 1000);
    }
  }
});
