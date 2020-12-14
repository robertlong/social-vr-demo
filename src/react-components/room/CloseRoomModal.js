import React from "react";
import { FormattedMessage } from "react-intl";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";

export function CloseRoomModal({ onClose, onConfirm }) {
  return (
    <Modal title="Close Room" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column padding center centerMd="both" grow>
        <p>
          <FormattedMessage id="close-room.message" />
        </p>
        <Button preset="accept" onClick={onConfirm}>
          <FormattedMessage id="close-room.confirm" />
        </Button>
        <Button preset="cancel" onClick={onClose}>
          <FormattedMessage id="close-room.cancel" />
        </Button>
      </Column>
    </Modal>
  );
}

CloseRoomModal.propTypes = {
  onConfirm: PropTypes.func,
  onClose: PropTypes.func
};
