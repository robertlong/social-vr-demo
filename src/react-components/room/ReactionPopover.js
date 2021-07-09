import React from "react";
import PropTypes from "prop-types";
import { ImageGridPopover } from "../popover/ImageGridPopover";
import { Popover } from "../popover/Popover";
import { ToolbarButton } from "../input/ToolbarButton";
import { ReactComponent as ReactionIcon } from "../icons/Reaction.svg";
import { defineMessage, useIntl } from "react-intl";

const reactionPopoverTitle = defineMessage({
  id: "reaction-popover.title",
  defaultMessage: "React"
});

export function ReactionPopoverButton({ items }) {
  const intl = useIntl();
  const title = intl.formatMessage(reactionPopoverTitle);

  // crossOrigin: "Anonymous" is a workaround for CORS error on Chrome. See #4400
  items.forEach(item => (item.crossOrigin = "Anonymous"));

  return (
    <Popover
      title={title}
      content={props => <ImageGridPopover items={items} {...props} />}
      placement="top"
      offsetDistance={28}
    >
      {({ togglePopover, popoverVisible, triggerRef }) => (
        <ToolbarButton
          ref={triggerRef}
          icon={<ReactionIcon />}
          selected={popoverVisible}
          onClick={togglePopover}
          label={title}
          preset="accent2"
        />
      )}
    </Popover>
  );
}

ReactionPopoverButton.propTypes = {
  items: PropTypes.array.isRequired
};
