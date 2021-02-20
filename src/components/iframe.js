import { THREE } from "aframe";
import React from "react";
import { render } from "react-dom";
import PropTypes from "prop-types";
import "three/examples/js/renderers/CSS3DRenderer";
import styles from "./iframe.scss";

const IFRAME_WIDTH_M = 1.6;
const IFRAME_HEIGHT_M = 0.9;
const IFRAME_WIDTH_PX = 1280;
const IFRAME_HEIGHT_PX = 720;

function Browser({ src, onChangeSrc }) {
  return (
    <div className={styles.browser}>
      <div className={styles.addressBar}>
        <input className={styles.addressField} value={src} onChange={onChangeSrc} />
      </div>
      <iframe className={styles.iframe} src={src} style={{ width: IFRAME_WIDTH_PX, height: IFRAME_HEIGHT_PX }} />
    </div>
  );
}

Browser.propTypes = {
  onChangeSrc: PropTypes.func,
  src: PropTypes.string
};

AFRAME.registerComponent("iframe", {
  schema: {
    src: { type: "string" }
  },

  init: function() {
    const browserEl = document.createElement("div");
    browserEl.style.width = `${IFRAME_WIDTH_PX}px`;
    browserEl.style.height = `${IFRAME_HEIGHT_PX}px`;
    browserEl.classList.add(styles.browserContainer);
    this.browserEl = browserEl;

    const geometry = new THREE.PlaneBufferGeometry(IFRAME_WIDTH_M, IFRAME_HEIGHT_M, 1, 1);
    const material = new THREE.ShaderMaterial({
      fragmentShader: `void main() {
        gl_FragColor = vec4(0, 0, 0, 0);
      }`,
      side: THREE.DoubleSide
    });
    window.material = material;
    const mesh = new THREE.Mesh(geometry, material);
    this.el.setObject3D("mesh", mesh);

    this.cssObject = new THREE.CSS3DObject(this.browserEl);

    const webglToCSSScale = IFRAME_WIDTH_M / IFRAME_WIDTH_PX;
    this.cssObject.scale.setScalar(webglToCSSScale);

    this.iframeSystem = this.el.sceneEl.systems["hubs-systems"].iframeSystem;
    this.iframeSystem.register(this);

    this.onChangeSrc = this.onChangeSrc.bind(this);
  },

  onChangeSrc(event) {
    this.el.setAttribute("iframe", { src: event.target.value });
  },

  update(prevData) {
    if (this.data.src !== prevData.src) {
      render(<Browser src={this.data.src} onChangeSrc={this.onChangeSrc} />, this.browserEl);
    }
  },

  remove() {
    this.iframeSystem.unregister(this);
  }
});
