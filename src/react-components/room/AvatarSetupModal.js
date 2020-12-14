import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { BackButton } from "../input/BackButton";
import { AvatarSettingsContent } from "./AvatarSettingsContent";

export function AvatarSetupModal({ className, onBack, ...rest }) {
  return (
    <Modal title="Avatar Setup" beforeTitle={<BackButton onClick={onBack} />} onEscape={onBack} className={className}>
      <AvatarSettingsContent {...rest} />
    </Modal>
  );
}

AvatarSetupModal.propTypes = {
  className: PropTypes.string,
  onBack: PropTypes.func
};
