import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { TextInputField } from "../input/TextInputField";
import { useForm } from "react-hook-form";
import { Button } from "../input/Button";
import { FormattedMessage } from "react-intl";
import { Column } from "../layout/Column";

export function AvatarUrlModal({ onSubmit, onClose }) {
  const { handleSubmit, register } = useForm();
  return (
    <Modal title="Custom Avatar URL" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column as="form" padding center onSubmit={handleSubmit(onSubmit)}>
        <TextInputField
          name="url"
          label="Avatar GLB URL"
          placeholder="https://example.com/avatar.glb"
          type="url"
          required
          ref={register}
          description={
            <a href="https://hubs.mozilla.com/docs/intro-avatars.html" target="_blank" rel="noopener noreferrer">
              Learn more about custom avatars
            </a>
          }
        />
        <Button type="submit" preset="accept">
          <FormattedMessage id="avatar-url-dialog.apply" />
        </Button>
      </Column>
    </Modal>
  );
}

AvatarUrlModal.propTypes = {
  onSubmit: PropTypes.func,
  onClose: PropTypes.func
};
