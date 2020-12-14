import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { TextInputField } from "../input/TextInputField";
import { useForm } from "react-hook-form";
import { Button } from "../input/Button";
import { FormattedMessage } from "react-intl";
import { Column } from "../layout/Column";

export function SceneUrlModal({ enableSpoke, onValidateUrl, onSubmit, onClose }) {
  const { isSubmitting, handleSubmit, register, errors } = useForm();
  return (
    <Modal title="Custom Scene URL" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column as="form" padding center onSubmit={handleSubmit(onSubmit)}>
        <p>
          Paste a URL to a{" "}
          {enableSpoke && (
            <a href="/spoke" target="_blank" rel="noopener noreferrer">
              <FormattedMessage id="editor-name" />
            </a>
          )}{" "}
          scene or a URL to a{" "}
          <a href="https://en.wikipedia.org/wiki/GlTF#GLB" target="_blank" rel="noopener noreferrer">
            GLB
          </a>.
        </p>
        <TextInputField
          name="url"
          label="Scene URL"
          placeholder="https://example.com/scene.glb"
          type="url"
          required
          ref={register({ validate: onValidateUrl })}
          error={errors.url && errors.url.message}
        />
        <Button type="submit" preset="accept" disabled={isSubmitting}>
          <FormattedMessage id="change-scene-dialog.change-scene" />
        </Button>
        {enableSpoke && (
          <>
            <p>
              <FormattedMessage id="change-scene-dialog.create-in-spoke" />
            </p>
            <Button as="a" preset="blue" href="/spoke/new" target="_blank" rel="noopener noreferrer">
              <FormattedMessage id="change-scene-dialog.new-spoke-project" />
            </Button>
          </>
        )}
      </Column>
    </Modal>
  );
}

SceneUrlModal.propTypes = {
  enableSpoke: PropTypes.bool,
  onSubmit: PropTypes.func,
  onClose: PropTypes.func,
  onValidateUrl: PropTypes.isRequired
};
