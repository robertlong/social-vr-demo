import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { injectIntl, FormattedMessage } from "react-intl";

import { hubUrl } from "../utils/phoenix-utils";
import { handleTextFieldFocus, handleTextFieldBlur } from "../utils/focus-utils";
import styles from "../assets/stylesheets/room-settings-dialog.scss";
import DialogContainer from "./dialog-container";
import configs from "../utils/configs";

class RoomSettingsDialog extends Component {
  static propTypes = {
    intl: PropTypes.object,
    initialSettings: PropTypes.object,
    onChange: PropTypes.func,
    hubChannel: PropTypes.object,
    onClose: PropTypes.func,
    showPublicRoomSetting: PropTypes.bool
  };

  constructor(props) {
    super(props);
    this.state = props.initialSettings;
    this.state.fetchingInvite = false;
    this.state.confirmRevoke = false;
  }

  onSubmit = e => {
    e.preventDefault();
    e.stopPropagation();
    this.props.onChange(this.state);
    this.props.onClose();
  };

  onRoomAccessSettingsChange = async e => {
    const newEntryMode = e.target.value;
    if (newEntryMode === "invite") {
      this.setState({ fetchingInvite: true });
      const result = await this.props.hubChannel.fetchInvite();
      this.setState({ fetchingInvite: false, hubInviteId: result.hub_invite_id });
    }
    this.setState({ entry_mode: newEntryMode });
  };

  onRevokeInvite = async () => {
    this.setState({ fetchingInvite: true });
    const result = await this.props.hubChannel.revokeInvite(this.state.hubInviteId);
    this.setState({ fetchingInvite: false, hubInviteId: result.hub_invite_id, confirmRevoke: false });
  };

  async componentDidMount() {
    if (this.state.entry_mode === "invite") {
      this.setState({ fetchingInvite: true });
      const result = await this.props.hubChannel.fetchInvite();
      this.setState({ fetchingInvite: false, hubInviteId: result.hub_invite_id });
    }
  }

  renderCheckbox(member_permission, disabled, onChange) {
    return (
      <label className={cx(styles.permission, { [styles.permissionDisabled]: disabled })} key={member_permission}>
        <input
          type="checkbox"
          checked={this.state.member_permissions[member_permission]}
          disabled={disabled}
          onChange={
            onChange ||
            (e =>
              this.setState({
                member_permissions: { ...this.state.member_permissions, [member_permission]: e.target.checked }
              }))
          }
        />
        <FormattedMessage id={`room-settings.${member_permission}`} />
      </label>
    );
  }

  inviteUrl() {
    const url = hubUrl();
    url.searchParams.set("hub_invite_id", this.state.hubInviteId);
    return url.toString();
  }

  handleRoomNameFieldBlur() {
    handleTextFieldBlur();
    this.setState({
      name: this.state.name.trim()
    });
  }

  render() {
    const { formatMessage } = this.props.intl;
    const { showPublicRoomSetting } = this.props;

    const maxRoomSize = configs.feature("max_room_size");

    return (
      <DialogContainer title={formatMessage({ id: "settings.room-settings" })} {...this.props}>
        <form onSubmit={this.onSubmit} className={styles.roomSettingsForm}>
          <span className={styles.subtitle}>
            <FormattedMessage id="room-settings.name-subtitle" />
          </span>
          <input
            name="name"
            type="text"
            required
            autoComplete="off"
            placeholder={formatMessage({ id: "room-settings.name-subtitle" })}
            maxLength={64}
            minLength={1}
            value={this.state.name}
            onFocus={e => handleTextFieldFocus(e.target)}
            onBlur={() => this.handleRoomNameFieldBlur()}
            onChange={e => this.setState({ name: e.target.value })}
            className={styles.nameField}
          />
          <span className={styles.subtitle}>
            <FormattedMessage id="room-settings.description-subtitle" />
          </span>
          <textarea
            name="description"
            rows="5"
            autoComplete="off"
            placeholder={formatMessage({ id: "room-settings.description-subtitle" })}
            value={this.state.description || ""}
            onFocus={e => handleTextFieldFocus(e.target)}
            onBlur={() => handleTextFieldBlur()}
            onChange={e => this.setState({ description: e.target.value })}
            className={styles.descriptionField}
          />
          <span className={styles.subtitle}>
            <FormattedMessage id="room-settings.room-size-subtitle" />
          </span>
          <div className={styles.memberCapContainer}>
            <input
              name="room_size"
              type="number"
              required
              min={0}
              max={maxRoomSize}
              placeholder={formatMessage({ id: "room-settings.room-size-subtitle" })}
              value={this.state.room_size}
              onFocus={e => handleTextFieldFocus(e.target)}
              onBlur={() => handleTextFieldBlur()}
              onChange={e => this.setState({ room_size: e.target.value })}
              className={styles.nameField}
            />
          </div>
          <span className={styles.subtitle}>
            <FormattedMessage id="room-settings.room-access-subtitle" />
          </span>
          <div className={styles.selectContainer}>
            <label>
              <input
                type="radio"
                value="allow"
                checked={this.state.entry_mode === "allow"}
                onChange={this.onRoomAccessSettingsChange}
              />
              <div className={styles.radioText}>
                <span className={styles.radioTitle}>
                  <FormattedMessage id="room-settings.access-shared-link" />
                </span>
                <span className={styles.radioText}>
                  <FormattedMessage id="room-settings.access-shared-link-subtitle" />
                </span>
              </div>
            </label>
            <label>
              <input
                type="radio"
                value="invite"
                checked={this.state.entry_mode === "invite"}
                onChange={this.onRoomAccessSettingsChange}
              />
              <div className={styles.radioText}>
                <span className={styles.radioTitle}>
                  <FormattedMessage id="room-settings.access-invite" />
                </span>
                <span className={styles.radioText}>
                  <FormattedMessage id="room-settings.access-invite-subtitle" />
                </span>
                {this.state.entry_mode === "invite" && (
                  <div className={styles.inviteLink}>
                    <span>
                      <FormattedMessage id="room-settings.access-invite-link" />
                    </span>{" "}
                    {this.state.fetchingInvite ? (
                      <span>...</span>
                    ) : (
                      <>
                        <a href={this.inviteUrl()} className="link">
                          {this.state.hubInviteId}
                        </a>{" "}
                        <span className="revoke">
                          {this.state.confirmRevoke ? (
                            <>
                              <FormattedMessage id="room-settings.revoke-confirm" />{" "}
                              <a onClick={this.onRevokeInvite}>
                                <FormattedMessage id="room-settings.revoke-confirm-yes" />
                              </a>{" "}
                              /{" "}
                              <a onClick={() => this.setState({ confirmRevoke: false })}>
                                <FormattedMessage id="room-settings.revoke-confirm-no" />
                              </a>
                            </>
                          ) : (
                            <a onClick={() => this.setState({ confirmRevoke: true })}>
                              <FormattedMessage id="room-settings.revoke" />
                            </a>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </label>
            {showPublicRoomSetting && (
              <label>
                <input
                  type="checkbox"
                  checked={this.state.allow_promotion}
                  onChange={e => this.setState({ allow_promotion: e.target.checked })}
                />
                <div className={styles.radioText}>
                  <span className={styles.radioTitle}>
                    <FormattedMessage id="room-settings.access-public" />
                  </span>
                  <span className={styles.radioText}>
                    <FormattedMessage id="room-settings.access-public-subtitle" />
                  </span>
                </div>
              </label>
            )}
          </div>
          <span className={styles.subtitle}>
            <FormattedMessage id="room-settings.permissions-subtitle" />
          </span>
          <div className={styles.permissions}>
            {this.renderCheckbox("spawn_and_move_media", false, e => {
              const newMemberPermissions = {
                spawn_and_move_media: e.target.checked
              };
              if (!e.target.checked) {
                newMemberPermissions.spawn_camera = false;
                newMemberPermissions.pin_objects = false;
              }
              this.setState({ member_permissions: { ...this.state.member_permissions, ...newMemberPermissions } });
            })}
            <div className={styles.permissionsGroup}>
              {this.renderCheckbox("spawn_camera", !this.state.member_permissions.spawn_and_move_media)}
              {this.renderCheckbox("pin_objects", !this.state.member_permissions.spawn_and_move_media)}
            </div>
            {this.renderCheckbox("spawn_drawing")}
            {this.renderCheckbox("spawn_emoji")}
            <div />
            {this.renderCheckbox("fly")}
          </div>
          <button type="submit" className={styles.nextButton}>
            <FormattedMessage id="room-settings.apply" />
          </button>
        </form>
      </DialogContainer>
    );
  }
}

export default injectIntl(RoomSettingsDialog);
