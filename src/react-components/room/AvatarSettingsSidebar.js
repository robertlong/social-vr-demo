import React from "react";
import PropTypes from "prop-types";
import { Sidebar } from "../sidebar/Sidebar";
import { CloseButton } from "../input/CloseButton";
import { BackButton } from "../input/BackButton";
import { AvatarSettingsContent } from "./AvatarSettingsContent";

export function AvatarSettingsSidebar({ className, showBackButton, onBack, onClose, ...rest }) {
  return (
    <Sidebar
      title="Avatar Settings"
      beforeTitle={showBackButton ? <BackButton onClick={onBack} /> : <CloseButton onClick={onClose} />}
      onEscape={showBackButton ? onBack : onClose}
      className={className}
    >
      <AvatarSettingsContent {...rest} />
    </Sidebar>
  );
}

AvatarSettingsSidebar.propTypes = {
  showBackButton: PropTypes.bool,
  className: PropTypes.string,
  onBack: PropTypes.func,
  onClose: PropTypes.func
};
