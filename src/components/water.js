import { Layers } from "./layers";
import "../vendor/Water";
import waterNormalMap from "../assets/waternormals.jpg";
import HubsTextureLoader from "../loaders/HubsTextureLoader";

/**
 * @author jbouny / https://github.com/jbouny
 *
 * Work based on :
 * @author Slayvin / http://slayvin.net : Flat mirror for three.js
 * @author Stemkoski / http://www.adelphi.edu/~stemkoski : An implementation of water shader based on the flat mirror
 * @author Jonas Wagner / http://29a.ch/ && http://29a.ch/slides/2012/webglwater/ : Water shader explanations in WebGL
 */

function MobileWater(geometry, options) {
  THREE.Mesh.call(this, geometry);

  const scope = this;

  options = options || {};

  const time = options.time !== undefined ? options.time : 0.0;
  const normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
  const sunDirection =
    options.sunDirection !== undefined ? options.sunDirection : new THREE.Vector3(0.70707, 0.70707, 0.0);
  const sunColor = new THREE.Color(options.sunColor !== undefined ? options.sunColor : 0xffffff);
  const waterColor = new THREE.Color(options.waterColor !== undefined ? options.waterColor : 0x7f7f7f);
  const eye = options.eye !== undefined ? options.eye : new THREE.Vector3(0, 0, 0);
  const distortionScale = options.distortionScale !== undefined ? options.distortionScale : 20.0;
  const side = options.side !== undefined ? options.side : THREE.FrontSide;
  const fog = options.fog !== undefined ? options.fog : false;

  const mirrorShader = {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib["lights"],
      {
        normalSampler: { value: null },
        time: { value: 0.0 },
        size: { value: 1.0 },
        distortionScale: { value: 20.0 },
        sunColor: { value: new THREE.Color(0x7f7f7f) },
        sunDirection: { value: new THREE.Vector3(0.70707, 0.70707, 0) },
        eye: { value: new THREE.Vector3() },
        waterColor: { value: new THREE.Color(0x555555) }
      }
    ]),

    vertexShader: `
      uniform float time;
      varying vec4 worldPosition;

      void main() {
      	worldPosition = modelMatrix * vec4( position, 1.0 );
      	vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );
      	gl_Position = projectionMatrix * mvPosition;

      }
    `,

    fragmentShader: `
      uniform float time;
      uniform float size;
      uniform float distortionScale;
      uniform sampler2D normalSampler;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform vec3 eye;
      uniform vec3 waterColor;

      varying vec4 worldPosition;

      vec4 getNoise( vec2 uv ) {
      	vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
      	vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
      	vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
      	vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
      	vec4 noise = texture2D( normalSampler, uv0 ) +
      		texture2D( normalSampler, uv1 ) +
      		texture2D( normalSampler, uv2 ) +
      		texture2D( normalSampler, uv3 );
      	return noise * 0.5 - 1.0;
      }

      void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
      	vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
      	float direction = max( 0.0, dot( eyeDirection, reflection ) );
      	specularColor += pow( direction, shiny ) * sunColor * spec;
      	diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
      }

      ${THREE.ShaderChunk["common"]}
      ${THREE.ShaderChunk["packing"]}
      ${THREE.ShaderChunk["bsdfs"]}
      ${THREE.ShaderChunk["lights_pars_begin"]}

      void main() {
      	vec4 noise = getNoise( worldPosition.xz * size );
      	vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

      	vec3 diffuseLight = vec3(0.0);
      	vec3 specularLight = vec3(0.0);

      	vec3 worldToEye = eye-worldPosition.xyz;
      	vec3 eyeDirection = normalize( worldToEye );
      	sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

      	float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
      	float rf0 = 0.3;
      	float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
      	vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
      	vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ), ( 0.5 + specularLight ), reflectance);
      	vec3 outgoingLight = albedo;
      	gl_FragColor = vec4( outgoingLight, 1 );
      }
    `
  };

  const material = new THREE.ShaderMaterial({
    fragmentShader: mirrorShader.fragmentShader,
    vertexShader: mirrorShader.vertexShader,
    uniforms: THREE.UniformsUtils.clone(mirrorShader.uniforms),
    transparent: false,
    lights: true,
    side: side,
    fog: fog
  });

  material.uniforms.time.value = time;
  material.uniforms.normalSampler.value = normalSampler;
  material.uniforms.sunColor.value = sunColor;
  material.uniforms.waterColor.value = waterColor;
  material.uniforms.sunDirection.value = sunDirection;
  material.uniforms.distortionScale.value = distortionScale;

  material.uniforms.eye.value = eye;

  scope.material = material;
}

MobileWater.prototype = Object.create(THREE.Mesh.prototype);
MobileWater.prototype.constructor = THREE.Water;

async function loadWaterNormals(url) {
  const texture = await new Promise((resolve, reject) => new HubsTextureLoader().load(url, resolve, undefined, reject));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

AFRAME.registerComponent("water", {
  schema: {
    waterColor: { type: "color", default: "#001e0f" },
    distortionScale: { type: "number", default: 3.7 },
    sunColor: { type: "color", default: "#ffffff" },
    inclination: { type: "number", default: 0 },
    azimuth: { type: "number", default: 0 },
    distance: { type: "number", default: 1 },
    speed: { type: "number", default: 0.1 },
    forceMobile: { type: "boolean", default: false }
  },
  init() {
    const waterMesh = this.el.getObject3D("mesh");
    const waterGeometry = waterMesh.geometry;

    // Render THREE.Water shader instead of THREE.Mesh
    waterMesh.visible = false;

    loadWaterNormals(waterNormalMap).then(waterNormals => {
      const waterConfig = {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        sunDirection: this.data.sunDirection,
        sunColor: new THREE.Color(this.data.sunColor),
        waterColor: new THREE.Color(this.data.waterColor),
        distortionScale: this.data.distortionScale,
        fog: false
      };

      if (AFRAME.utils.device.isMobile() || AFRAME.utils.device.isMobileVR() || this.data.forceMobile) {
        this.water = new MobileWater(waterGeometry, waterConfig);
      } else {
        this.water = new THREE.Water(waterGeometry, waterConfig);
        this.water.mirrorCamera.layers.set(Layers.reflection);
      }

      this.el.setObject3D("water", this.water);
    });
  },

  update(oldData) {
    if (this.data.forceMobile !== oldData.forceMobile) {
      this.el.removeObject3D("water");
      this.init();
      return;
    }

    if (!this.water) {
      return;
    }

    const uniforms = this.water.material.uniforms;

    if (this.data.waterColor !== oldData.waterColor) {
      uniforms.waterColor.value.setStyle(this.data.waterColor);
    }

    if (this.data.distortionScale !== oldData.distortionScale) {
      uniforms.distortionScale.value = this.data.distortionScale;
    }

    if (this.data.sunColor !== oldData.sunColor) {
      uniforms.sunColor.value.setStyle(this.data.sunColor);
    }

    if (
      this.data.inclination !== oldData.inclination ||
      this.data.azimuth !== oldData.azimuth ||
      this.data.distance !== oldData.distance
    ) {
      const theta = Math.PI * (this.data.inclination - 0.5);
      const phi = 2 * Math.PI * (this.data.azimuth - 0.5);

      const distance = this.data.distance;

      const x = distance * Math.cos(phi);
      const y = distance * Math.sin(phi) * Math.sin(theta);
      const z = distance * Math.sin(phi) * Math.cos(theta);

      uniforms.sunDirection.value.set(x, y, z);
    }
  },

  tick(time) {
    if (this.water) {
      this.water.material.uniforms.time.value = (time / 1000) * this.data.speed;
    }
  },

  remove() {
    this.el.removeObject3D("water");
    const waterMesh = this.el.getObject3D("mesh");
    waterMesh.visible = true;
  }
});
