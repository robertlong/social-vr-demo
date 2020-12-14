import React from "react";
import PropTypes from "prop-types";
import { Sidebar } from "../sidebar/Sidebar";
import { CloseButton } from "../input/CloseButton";
import { BackButton } from "../input/BackButton";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";
import styles from "./UserProfileSidebar.scss";

export function UserProfileSidebar({
  className,
  displayName,
  identityName,
  avatarPreview,
  isSignedIn,
  canPromote,
  onPromote,
  canDemote,
  onDemote,
  isHidden,
  onToggleHidden,
  canMute,
  onMute,
  canKick,
  onKick,
  showBackButton,
  onBack,
  onClose,
  ...rest
}) {
  return (
    <Sidebar
      title={identityName ? `${displayName} (${identityName})` : displayName}
      beforeTitle={showBackButton ? <BackButton onClick={onBack} /> : <CloseButton onClick={onClose} />}
      onEscape={showBackButton ? onBack : onClose}
      className={className}
      {...rest}
    >
      <Column center padding>
        <div className={styles.avatarPreviewContainer}>{avatarPreview || <div />}</div>
        {canPromote && (
          <Button
            preset="green"
            disabled={!isSignedIn}
            title={isSignedIn ? "Promote" : `${displayName} is signed out.`}
            onClick={onPromote}
          >
            Promote
          </Button>
        )}
        {canDemote && (
          <Button
            preset="red"
            disabled={!isSignedIn}
            title={isSignedIn ? "Demote" : `${displayName} is signed out.`}
            onClick={onDemote}
          >
            Demote
          </Button>
        )}
        <Button onClick={onToggleHidden}>{isHidden ? "Unhide" : "Hide"}</Button>
        {canMute && (
          <Button preset="red" onClick={onMute}>
            Mute
          </Button>
        )}
        {canKick && (
          <Button preset="red" onClick={onKick}>
            Kick
          </Button>
        )}
      </Column>
    </Sidebar>
  );
}

UserProfileSidebar.propTypes = {
  className: PropTypes.string,
  displayName: PropTypes.string,
  identityName: PropTypes.string,
  avatarPreview: PropTypes.node,
  isSignedIn: PropTypes.bool,
  canPromote: PropTypes.bool,
  onPromote: PropTypes.func,
  canDemote: PropTypes.bool,
  onDemote: PropTypes.func,
  isHidden: PropTypes.bool,
  onToggleHidden: PropTypes.func,
  canMute: PropTypes.bool,
  onMute: PropTypes.func,
  canKick: PropTypes.bool,
  onKick: PropTypes.func,
  showBackButton: PropTypes.bool,
  onBack: PropTypes.func,
  onClose: PropTypes.func
};
