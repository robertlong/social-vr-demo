import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import styles from "./ObjectsSidebar.scss";
import { Sidebar } from "../sidebar/Sidebar";
import { CloseButton } from "../input/CloseButton";
import { ButtonListItem } from "../layout/List";
import listStyles from "../layout/List.scss";
import { ReactComponent as ObjectIcon } from "../icons/Object.svg";
import { ReactComponent as ImageIcon } from "../icons/Image.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { ReactComponent as TextDocumentIcon } from "../icons/TextDocument.svg";

function getObjectIcon(type) {
  switch (type) {
    case "video":
      return VideoIcon;
    case "audio":
      return AudioIcon;
    case "image":
      return ImageIcon;
    case "pdf":
      return TextDocumentIcon;
    case "model":
    default:
      return ObjectIcon;
  }
}

const objectTypeNames = {
  video: "Video",
  audio: "Audio",
  image: "Image",
  pdf: "PDF",
  model: "Model",
  default: "Object"
};

function getLabel(object) {
  return `${objectTypeNames[object.type] || objectTypeNames.default}: ${object.name}`;
}

export function ObjectsSidebarItem({ selected, object, ...rest }) {
  const ObjectTypeIcon = getObjectIcon(object.type);

  return (
    <ButtonListItem
      {...rest}
      className={classNames(styles.object, { [listStyles.selected]: selected })}
      type="button"
      aria-label={getLabel(object)}
    >
      <ObjectTypeIcon />
      <p>{object.name}</p>
    </ButtonListItem>
  );
}

ObjectsSidebarItem.propTypes = {
  selected: PropTypes.bool,
  object: PropTypes.shape({
    id: PropTypes.any.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string
  })
};

export function NoObjects({ canAddObjects }) {
  return (
    <li className={styles.noObjects}>
      <p>There are no objects in the room.</p>
      {canAddObjects && <p>Use the place menu to add objects.</p>}
    </li>
  );
}

NoObjects.propTypes = {
  canAddObjects: PropTypes.bool
};

export function ObjectsSidebar({ children, objectCount, onClose }) {
  return (
    <Sidebar title={`Objects (${objectCount})`} beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <ul>{children}</ul>
    </Sidebar>
  );
}

ObjectsSidebar.propTypes = {
  objectCount: PropTypes.number.isRequired,
  children: PropTypes.node,
  onClose: PropTypes.func
};

ObjectsSidebar.defaultProps = {
  objectCount: 0
};
