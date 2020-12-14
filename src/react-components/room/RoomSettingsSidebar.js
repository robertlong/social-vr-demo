import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { useForm } from "react-hook-form";
import styles from "./RoomSettingsSidebar.scss";
import { Sidebar } from "../sidebar/Sidebar";
import { CloseButton } from "../input/CloseButton";
import { InputField } from "../input/InputField";
import { FormattedMessage } from "react-intl";
import { Button } from "../input/Button";
import { TextInputField } from "../input/TextInputField";
import { TextAreaInputField } from "../input/TextAreaInputField";
import { ToggleInput } from "../input/ToggleInput";
import { RadioInputField, RadioInputOption } from "../input/RadioInputField";
import { NumericInputField } from "../input/NumericInputField";
import { BackButton } from "../input/BackButton";
import { SceneInfo } from "./RoomSidebar";
import { Column } from "../layout/Column";
import { InviteLinkInputField } from "./InviteLinkInputField";

export function RoomSettingsSidebar({
  showBackButton,
  accountId,
  room,
  fetchingInvite,
  inviteUrl,
  onRevokeInvite,
  maxRoomSize,
  showPublicRoomSetting,
  onSubmit,
  onClose,
  canChangeScene,
  onChangeScene
}) {
  const { handleSubmit, register, watch, errors, setValue } = useForm({
    defaultValues: room
  });

  const entryMode = watch("entry_mode");
  const spawnAndMoveMedia = watch("member_permissions.spawn_and_move_media");

  useEffect(
    () => {
      if (!spawnAndMoveMedia) {
        setValue("member_permissions.spawn_camera", false, { shouldDirty: true });
        setValue("member_permissions.pin_objects", false, { shouldDirty: true });
      }
    },
    [spawnAndMoveMedia, setValue]
  );

  return (
    <Sidebar
      title="Room Settings"
      beforeTitle={showBackButton ? <BackButton onClick={onClose} /> : <CloseButton onClick={onClose} />}
      onEscape={onClose}
    >
      <Column padding as="form" onSubmit={handleSubmit(onSubmit)}>
        <SceneInfo
          accountId={accountId}
          scene={room.scene}
          canChangeScene={canChangeScene}
          onChangeScene={onChangeScene}
        />
        <TextInputField
          name="name"
          type="text"
          required
          autoComplete="off"
          placeholder="Room name"
          minLength={1}
          maxLength={64}
          label={<FormattedMessage id="room-settings.name-subtitle" />}
          ref={register}
          error={errors.name}
          fullWidth
        />
        <TextAreaInputField
          name="description"
          autoComplete="off"
          placeholder="Room description"
          label={<FormattedMessage id="room-settings.description-subtitle" />}
          minRows={3}
          ref={register}
          error={errors.description}
          fullWidth
        />
        <NumericInputField
          name="room_size"
          required
          min={0}
          max={maxRoomSize}
          placeholder="Member Limit"
          label={<FormattedMessage id="room-settings.room-size-subtitle" />}
          ref={register}
          error={errors.room_size}
          fullWidth
        />
        <RadioInputField label={<FormattedMessage id="room-settings.room-access-subtitle" />} fullWidth>
          <RadioInputOption
            name="entry_mode"
            value="allow"
            label={<FormattedMessage id="room-settings.access-shared-link" />}
            description={<FormattedMessage id="room-settings.access-shared-link-subtitle" />}
            ref={register}
            error={errors.entry_mode}
          />
          <RadioInputOption
            name="entry_mode"
            value="invite"
            label={<FormattedMessage id="room-settings.access-invite" />}
            description={<FormattedMessage id="room-settings.access-invite-subtitle" />}
            ref={register}
            error={errors.entry_mode}
          />
        </RadioInputField>
        {entryMode === "invite" && (
          <InviteLinkInputField fetchingInvite={fetchingInvite} inviteUrl={inviteUrl} onRevokeInvite={onRevokeInvite} />
        )}
        {showPublicRoomSetting && (
          <ToggleInput
            name="allow_promotion"
            label={<FormattedMessage id="room-settings.access-public" />}
            description={<FormattedMessage id="room-settings.access-public-subtitle" />}
            ref={register}
          />
        )}
        <InputField label={<FormattedMessage id="room-settings.permissions-subtitle" />} fullWidth>
          <div className={styles.roomPermissions}>
            <ToggleInput
              name="member_permissions.spawn_and_move_media"
              label={<FormattedMessage id="room-settings.spawn_and_move_media" />}
              ref={register}
            />
            <div className={styles.permissionsGroup}>
              <ToggleInput
                name="member_permissions.spawn_camera"
                label={<FormattedMessage id="room-settings.spawn_camera" />}
                ref={register}
                disabled={!spawnAndMoveMedia}
              />
              <ToggleInput
                name="member_permissions.pin_objects"
                label={<FormattedMessage id="room-settings.pin_objects" />}
                ref={register}
                disabled={!spawnAndMoveMedia}
              />
            </div>
            <ToggleInput
              name="member_permissions.spawn_drawing"
              label={<FormattedMessage id="room-settings.spawn_drawing" />}
              ref={register}
            />
            <ToggleInput
              name="member_permissions.spawn_emoji"
              label={<FormattedMessage id="room-settings.spawn_emoji" />}
              ref={register}
            />
            <ToggleInput
              name="member_permissions.fly"
              label={<FormattedMessage id="room-settings.fly" />}
              ref={register}
            />
          </div>
        </InputField>
        <Button type="submit" preset="accept">
          <FormattedMessage id="room-settings.apply" />
        </Button>
      </Column>
    </Sidebar>
  );
}

RoomSettingsSidebar.propTypes = {
  accountId: PropTypes.string,
  showBackButton: PropTypes.bool,
  room: PropTypes.object.isRequired,
  fetchingInvite: PropTypes.bool,
  inviteUrl: PropTypes.string,
  onRevokeInvite: PropTypes.func,
  roomSize: PropTypes.number,
  maxRoomSize: PropTypes.number,
  showPublicRoomSetting: PropTypes.bool,
  onSubmit: PropTypes.func,
  onClose: PropTypes.func,
  canChangeScene: PropTypes.bool,
  onChangeScene: PropTypes.func
};
