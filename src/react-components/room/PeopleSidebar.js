import React from "react";
import PropTypes from "prop-types";
import styles from "./PeopleSidebar.scss";
import { Sidebar } from "../sidebar/Sidebar";
import { CloseButton } from "../input/CloseButton";
import { IconButton } from "../input/IconButton";
import { ReactComponent as StarIcon } from "../icons/Star.svg";
import { ReactComponent as DesktopIcon } from "../icons/Desktop.svg";
import { ReactComponent as DiscordIcon } from "../icons/Discord.svg";
import { ReactComponent as PhoneIcon } from "../icons/Phone.svg";
import { ReactComponent as VRIcon } from "../icons/VR.svg";
import { ReactComponent as VolumeOffIcon } from "../icons/VolumeOff.svg";
import { ReactComponent as VolumeHighIcon } from "../icons/VolumeHigh.svg";
import { ReactComponent as VolumeMutedIcon } from "../icons/VolumeMuted.svg";
import { List, ButtonListItem } from "../layout/List";

function getDeviceLabel(ctx) {
  if (ctx) {
    if (ctx.mobile) {
      return "On Mobile";
    } else if (ctx.discord) {
      return "Discord Bot";
    } else if (ctx.hmd) {
      return "In VR";
    }
  }

  return "On Desktop";
}

function getDeviceIconComponent(ctx) {
  if (ctx) {
    if (ctx.mobile) {
      return PhoneIcon;
    } else if (ctx.discord) {
      return DiscordIcon;
    } else if (ctx.hmd) {
      return VRIcon;
    }
  }

  return DesktopIcon;
}

function getVoiceLabel(micPresence) {
  if (micPresence) {
    if (micPresence.talking) {
      return "Talking";
    } else if (micPresence.muted) {
      return "Muted";
    }
  }

  return "Not Talking";
}

function getVoiceIconComponent(micPresence) {
  if (micPresence) {
    if (micPresence.muted) {
      return VolumeMutedIcon;
    } else if (micPresence.talking) {
      return VolumeHighIcon;
    }
  }

  return VolumeOffIcon;
}

// TODO: i18n
function getPresenceMessage(presence) {
  switch (presence) {
    case "lobby":
      return "In Lobby";
    case "room":
      return "In Room";
    case "entering":
      return "Entering Room";
    default:
      return undefined;
  }
}

function getPersonName(person) {
  return person.profile.displayName + (person.isMe ? " (You)" : "");
}

function getLabel(person) {
  if (person.context.discord) {
    return `${getDeviceLabel(person.context)}, ${getPersonName(person)} is ${getPresenceMessage(person.presence)}.`;
  }

  return `${person.roles.owner ? "Moderator " : ""}${getPersonName(person)}, is ${getPresenceMessage(
    person.presence
  )} and ${getVoiceLabel(person.micPresence)} ${getDeviceLabel(person.context)}.`;
}

export function PeopleSidebar({ people, onSelectPerson, onClose, showMuteAll, onMuteAll }) {
  return (
    <Sidebar
      title={`People (${people.length})`}
      beforeTitle={<CloseButton onClick={onClose} />}
      onEscape={onClose}
      afterTitle={showMuteAll ? <IconButton onClick={onMuteAll}>Mute All</IconButton> : undefined}
    >
      <List>
        {people.map(person => {
          const DeviceIcon = getDeviceIconComponent(person.context);
          const VoiceIcon = getVoiceIconComponent(person.micPresence);

          return (
            <ButtonListItem
              className={styles.person}
              key={person.id}
              type="button"
              aria-label={getLabel(person)}
              onClick={e => onSelectPerson(person, e)}
            >
              {<DeviceIcon title={getDeviceLabel(person.context)} />}
              {!person.context.discord && VoiceIcon && <VoiceIcon title={getVoiceLabel(person.micPresence)} />}
              <p>{getPersonName(person)}</p>
              {person.roles.owner && (
                <StarIcon title="Moderator" className={styles.moderatorIcon} width={12} height={12} />
              )}
              <p className={styles.presence}>{getPresenceMessage(person.presence)}</p>
            </ButtonListItem>
          );
        })}
      </List>
    </Sidebar>
  );
}

PeopleSidebar.propTypes = {
  people: PropTypes.array,
  onSelectPerson: PropTypes.func,
  showMuteAll: PropTypes.bool,
  onMuteAll: PropTypes.func,
  onClose: PropTypes.func
};

PeopleSidebar.defaultProps = {
  people: [],
  onSelectPerson: () => {}
};
