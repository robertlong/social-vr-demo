import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { WebPageUrlModal } from "./WebPageUrlModal";

export function WebPageUrlModalContainer({ scene, onClose }) {
  const onSubmit = useCallback(
    ({ src }) => {
      scene.emit("spawn-iframe", { src });
      onClose();
    },
    [scene, onClose]
  );

  return <WebPageUrlModal onSubmit={onSubmit} onClose={onClose} />;
}

WebPageUrlModalContainer.propTypes = {
  scene: PropTypes.object.isRequired,
  onClose: PropTypes.func
};
