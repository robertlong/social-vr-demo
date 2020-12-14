import React, { useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { TextInputField } from "../input/TextInputField";
import { useForm } from "react-hook-form";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";
import { IconButton } from "../input/IconButton";
import { ReactComponent as AttachIcon } from "../icons/Attach.svg";
import styles from "./ObjectUrlModal.scss";
import classNames from "classnames";

export function ObjectUrlModal({ showModelCollectionLink, modelCollectionUrl, onSubmit, onClose }) {
  const { handleSubmit, register, watch, setValue } = useForm();

  useEffect(
    () => {
      register("url");
    },
    [register]
  );

  const file = watch("file");
  const hasFile = file && file.length > 0;
  const fileName = hasFile ? file[0].name : undefined;

  const onClear = useCallback(
    () => {
      if (hasFile) {
        setValue("file", undefined);
      } else {
        setValue("url", "");
      }
    },
    [hasFile, setValue]
  );

  const onChange = useCallback(
    e => {
      if (hasFile) {
        return;
      }

      setValue("url", e.target.value);
    },
    [hasFile, setValue]
  );

  const url = watch("url", "");

  const showCloseButton = hasFile || url.length > 0;

  return (
    <Modal title="Custom Object" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column as="form" padding center onSubmit={handleSubmit(onSubmit)}>
        <p>
          Upload or paste a URL to an image, video, model, or scene. Models can be found on{" "}
          <a
            href="https://sketchfab.com/search?features=downloadable&type=models"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sketchfab
          </a>{" "}
          and{" "}
          <a href="http://poly.google.com/" target="_blank" rel="noopener noreferrer">
            Google Poly
          </a>
          {showModelCollectionLink && (
            <>
              , or our{" "}
              <a href={modelCollectionUrl} target="_blank" rel="noopener noreferrer">
                collection
              </a>
            </>
          )}.
        </p>
        <TextInputField
          name="url"
          label="Object URL or File"
          placeholder="https://example.com/avatar.glb"
          type={hasFile ? "text" : "url"}
          value={fileName || url || ""}
          onChange={onChange}
          afterInput={
            <>
              {showCloseButton && <CloseButton onClick={onClear} />}
              <IconButton as="label" className={classNames({ [styles.hidden]: showCloseButton })} htmlFor="file">
                <AttachIcon />
                <input id="file" className={styles.hidden} name="file" type="file" ref={register} />
              </IconButton>
            </>
          }
          description="Accepts glb, png, jpg, gif, mp4, and mp3 files"
        />
        <Button type="submit" preset="accept">
          Create Object
        </Button>
      </Column>
    </Modal>
  );
}

ObjectUrlModal.propTypes = {
  isMobile: PropTypes.bool,
  showModelCollectionLink: PropTypes.bool,
  modelCollectionUrl: PropTypes.string,
  onSubmit: PropTypes.func,
  onClose: PropTypes.func
};
