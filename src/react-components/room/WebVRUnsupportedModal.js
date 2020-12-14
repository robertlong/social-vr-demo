import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";

export function WebVRUnsupportedModal({ onClose }) {
  return (
    <Modal title="Enter in VR" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column padding center>
        <p>{"WebVR isn't supported in this browser, to enter with Oculus or SteamVR, use Firefox."}</p>
        <Button
          as="a"
          preset="orange"
          href="https://www.mozilla.org/firefox/"
          target="_blank"
          rel="noreferrer noopener"
        >
          <span>Download Firefox</span>
        </Button>
        <small>
          For a list of browsers with experimental VR support, visit{" "}
          <a href="https://webvr.rocks" target="_blank" rel="noopener noreferrer">
            WebVR Rocks
          </a>
        </small>
      </Column>
    </Modal>
  );
}

WebVRUnsupportedModal.propTypes = {
  onClose: PropTypes.func
};
