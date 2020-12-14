import React from "react";
import { FormattedMessage } from "react-intl";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";

export function TwitterOAuthModal({ onConnect, onClose }) {
  return (
    <Modal title="Connect to Twitter" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column padding center centerMd="both" grow>
        <p>
          <FormattedMessage id="oauth-dialog.message.twitter" />
        </p>
        <Button preset="blue" onClick={onConnect}>
          <FormattedMessage id="oauth-dialog.sign-in.twitter" />
        </Button>
      </Column>
    </Modal>
  );
}

TwitterOAuthModal.propTypes = {
  onConnect: PropTypes.func,
  onClose: PropTypes.func
};
