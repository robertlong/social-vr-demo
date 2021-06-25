import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import LaunchIcon from "@material-ui/icons/Launch";
import { getReticulumFetchUrl } from "hubs/src/utils/phoenix-utils";
import { ReferenceField } from "react-admin";

const styles = {
  ownedFileImage: {},

  fieldLink: {},
  avatarLink: {},

  ownedFileImageAspect_square: {
    width: 150,
    height: 150,
    padding: 12
  },
  ownedFileImageAspect_wide: {
    width: 200,
    height: 150,
    padding: 12
  },
  ownedFileImageAspect_tall: {
    width: (150 * 9) / 16,
    height: 150,
    padding: 12
  }
};

export function ConditionalReferenceField(props) {
  const { source, record, defaultValue = <div /> } = props;
  return record && record[source] ? <ReferenceField {...props} /> : defaultValue;
}

ConditionalReferenceField.propTypes = {
  ...ReferenceField.propTypes,
  defaultValue: PropTypes.element
};

const OwnedFileImageInternal = withStyles(styles)(({ record = {}, aspect = "wide", classes }) => {
  const src = getReticulumFetchUrl(`/files/${record.owned_file_uuid}`);
  return <img src={src} className={classes[`ownedFileImageAspect_${aspect}`]} />;
});

export const OwnedFileImage = withStyles(styles)(({ basePath, record, source, aspect, classes, defaultImage }) => {
  return (
    <ConditionalReferenceField
      basePath={basePath}
      source={source}
      reference="owned_files"
      link={false}
      record={record}
      defaultValue={defaultImage && <img src={defaultImage} className={classes[`ownedFileImageAspect_${aspect}`]} />}
    >
      <OwnedFileImageInternal source="owned_file_uuid" aspect={aspect} />
    </ConditionalReferenceField>
  );
});

OwnedFileImage.propTypes = {
  record: PropTypes.object,
  classes: PropTypes.object
};

function OwnedFileDownloadFieldInternal({ fileName, record, source }) {
  return (
    <a
      download={fileName || true}
      href={getReticulumFetchUrl(`/files/${record[source]}`)}
      target="_blank"
      rel="noopener noreferrer"
    >
      Download
    </a>
  );
}

OwnedFileDownloadFieldInternal.propTypes = {
  record: PropTypes.object,
  fileName: PropTypes.string,
  source: PropTypes.string
};

export function OwnedFileDownloadField({ getFileName, ...props }) {
  const fileName = getFileName && getFileName(props);

  return (
    <ConditionalReferenceField reference="owned_files" link={false} defaultValue={<a href="#">Download</a>} {...props}>
      <OwnedFileDownloadFieldInternal source="owned_file_uuid" fileName={fileName} />
    </ConditionalReferenceField>
  );
}

OwnedFileDownloadField.propTypes = {
  getFileName: PropTypes.func,
  record: PropTypes.object,
  source: PropTypes.string
};

OwnedFileDownloadField.defaultProps = {
  addLabel: true
};

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

function OwnedFileSizeFieldInternal({ record }) {
  return <span>{formatFileSize(record.content_length)}</span>;
}

export const OwnedFileSizeField = withStyles(styles)(({ label, basePath, record, source }) => {
  return (
    <ConditionalReferenceField
      label={label}
      basePath={basePath}
      source={source}
      reference="owned_files"
      link={false}
      record={record}
      defaultValue={<span>N/A</span>}
    >
      <OwnedFileSizeFieldInternal />
    </ConditionalReferenceField>
  );
});

export const SceneLink = withStyles(styles)(({ source, record = {}, classes }) => {
  const src = getReticulumFetchUrl(`/scenes/${record.scene_sid || record.scene_listing_sid}`);
  return (
    <a href={src} className={classes.fieldLink} target="_blank" rel="noopener noreferrer">
      {record[source]}
      <LaunchIcon className={classes.icon} />
    </a>
  );
});

SceneLink.propTypes = {
  source: PropTypes.string.isRequired,
  record: PropTypes.object,
  classes: PropTypes.object
};

export const AvatarLink = withStyles(styles)(({ source, record = {}, classes }) => {
  const src = getReticulumFetchUrl(`/avatars/${record.avatar_sid || record.avatar_listing_sid}`);
  return (
    <a href={src} className={classes.avatarLink} target="_blank" rel="noopener noreferrer">
      {record[source]}
      <LaunchIcon className={classes.icon} />
    </a>
  );
});

AvatarLink.propTypes = {
  source: PropTypes.string.isRequired,
  record: PropTypes.object,
  classes: PropTypes.object
};

export const IdentityEditLink = withStyles(styles)(({ record = {}, classes }) => (
  <a href={`#/identities/${record.id}`} className={classes.fieldLink}>
    Edit Identity
  </a>
));

export const IdentityCreateLink = withStyles(styles)(({ record, classes }) => (
  <a href={`#/identities/create?account_id=${record.id}`} className={classes.fieldLink}>
    Create Identity
  </a>
));

SceneLink.propTypes = {
  source: PropTypes.string.isRequired,
  record: PropTypes.object,
  classes: PropTypes.object
};
