import React from "react";
import PropTypes from "prop-types";
import { FormattedMessage } from "react-intl";
import { Modal } from "../modal/Modal";
import { Button } from "../input/Button";
import { CloseButton } from "../input/CloseButton";
import { Column } from "../layout/Column";

export function PromoteClientModal({ onClose, onConfirm, displayName }) {
  return (
    <Modal title="Promote User" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column center padding>
        <p>
          <FormattedMessage id="promote.message" />
        </p>
        <Button preset="accept" onClick={onConfirm}>
          <FormattedMessage id="promote.confirm-prefix" values={{ name: displayName }} />
        </Button>
        <Button preset="cancel" onClick={onClose}>
          <FormattedMessage id="promote.cancel" />
        </Button>
      </Column>
    </Modal>
  );
}

PromoteClientModal.propTypes = {
  displayName: PropTypes.string.isRequired,
  onConfirm: PropTypes.func,
  onClose: PropTypes.func
};
