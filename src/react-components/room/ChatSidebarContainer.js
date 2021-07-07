import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  ChatSidebar,
  ChatMessageGroup,
  SystemMessage,
  ChatMessageList,
  ChatInput,
  MessageAttachmentButton,
  SpawnMessageButton,
  ChatToolbarButton,
  SendMessageButton,
  EmojiPickerPopoverButton,
  ChatLengthWarning
} from "./ChatSidebar";
import { useMaintainScrollPosition } from "../misc/useMaintainScrollPosition";
import { spawnChatMessage } from "../chat-message";
import { discordBridgesForPresences } from "../../utils/phoenix-utils";
import { useIntl } from "react-intl";
import { MAX_MESSAGE_LENGTH } from "../../utils/chat-message";

const ChatContext = createContext({ messageGroups: [], sendMessage: () => {} });

let uniqueMessageId = 0;

const NEW_MESSAGE_GROUP_TIMEOUT = 1000 * 60;

function shouldCreateNewMessageGroup(messageGroups, newMessage, now) {
  if (messageGroups.length === 0) {
    return true;
  }

  const lastMessageGroup = messageGroups[messageGroups.length - 1];

  if (lastMessageGroup.senderSessionId !== newMessage.sessionId) {
    return true;
  }

  const lastMessage = lastMessageGroup.messages[lastMessageGroup.messages.length - 1];

  return now - lastMessage.timestamp > NEW_MESSAGE_GROUP_TIMEOUT;
}

function processChatMessage(messageGroups, newMessage) {
  const now = Date.now();
  const { name, sent, sessionId, ...messageProps } = newMessage;

  if (shouldCreateNewMessageGroup(messageGroups, newMessage, now)) {
    return [
      ...messageGroups,
      {
        id: uniqueMessageId++,
        timestamp: now,
        sent,
        sender: name,
        senderSessionId: sessionId,
        messages: [{ id: uniqueMessageId++, timestamp: now, ...messageProps }]
      }
    ];
  }

  const lastMessageGroup = messageGroups.pop();
  lastMessageGroup.messages = [
    ...lastMessageGroup.messages,
    { id: uniqueMessageId++, timestamp: now, ...messageProps }
  ];

  return [...messageGroups, { ...lastMessageGroup }];
}

// Returns the new message groups array when we receive a message.
// If the message is ignored, we return the original message group array.
function updateMessageGroups(messageGroups, newMessage) {
  switch (newMessage.type) {
    case "join":
    case "entered":
    case "leave":
    case "display_name_changed":
    case "scene_changed":
    case "hub_name_changed":
    case "hub_changed":
    case "log":
      return [
        ...messageGroups,
        {
          id: uniqueMessageId++,
          systemMessage: true,
          timestamp: Date.now(),
          ...newMessage
        }
      ];
    case "chat":
    case "image":
    case "photo":
    case "video":
      return processChatMessage(messageGroups, newMessage);
    default:
      return messageGroups;
  }
}

export function ChatContextProvider({ messageDispatch, children }) {
  const [messageGroups, setMessageGroups] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(false);

  useEffect(
    () => {
      function onReceiveMessage(event) {
        const newMessage = event.detail;
        setMessageGroups(messages => updateMessageGroups(messages, newMessage));

        if (
          newMessage.type === "chat" ||
          newMessage.type === "image" ||
          newMessage.type === "photo" ||
          newMessage.type === "video"
        ) {
          setUnreadMessages(true);
        }
      }

      if (messageDispatch) {
        messageDispatch.addEventListener("message", onReceiveMessage);
      }

      return () => {
        if (messageDispatch) {
          messageDispatch.removeEventListener("message", onReceiveMessage);
        }
      };
    },
    [messageDispatch, setMessageGroups, setUnreadMessages]
  );

  const sendMessage = useCallback(
    message => {
      if (messageDispatch) {
        messageDispatch.dispatch(message);
      }
    },
    [messageDispatch]
  );

  const setMessagesRead = useCallback(
    () => {
      setUnreadMessages(false);
    },
    [setUnreadMessages]
  );

  return (
    <ChatContext.Provider value={{ messageGroups, unreadMessages, sendMessage, setMessagesRead }}>
      {children}
    </ChatContext.Provider>
  );
}

ChatContextProvider.propTypes = {
  children: PropTypes.node,
  messageDispatch: PropTypes.object
};

export function ChatSidebarContainer({ scene, canSpawnMessages, presences, occupantCount, onClose }) {
  const { messageGroups, sendMessage, setMessagesRead } = useContext(ChatContext);
  const [onScrollList, listRef, scrolledToBottom] = useMaintainScrollPosition(messageGroups);
  const [message, setMessage] = useState("");
  const intl = useIntl();

  const onKeyDown = useCallback(
    e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
          sendMessage(e.target.value);
          setMessage("");
        }
      }
    },
    [sendMessage, setMessage]
  );

  const onSendMessage = useCallback(
    () => {
      sendMessage(message.substring(0, MAX_MESSAGE_LENGTH));
      setMessage("");
    },
    [message, sendMessage, setMessage]
  );

  const onSpawnMessage = () => {
    spawnChatMessage(message);
    setMessage("");
  };

  const onUploadAttachments = useCallback(
    e => {
      // TODO: Right now there's no way to upload files to the chat only.
      // When we add the place menu whcih will have an explicit button for uploading files,
      // should we make this attach button only upload to chat?
      for (const file of e.target.files) {
        scene.emit("add_media", file);
      }
    },
    [scene]
  );

  useEffect(
    () => {
      if (scrolledToBottom) {
        setMessagesRead();
      }
    },
    [messageGroups, scrolledToBottom, setMessagesRead]
  );

  const discordBridges = discordBridgesForPresences(presences);
  const discordSnippet = discordBridges.map(ch => "#" + ch).join(", ");
  let placeholder;

  if (occupantCount <= 1) {
    if (discordBridges.length === 0) {
      placeholder = intl.formatMessage({
        id: "chat-sidebar-container.input-placeholder.empty-room",
        defaultMessage: "Nobody is here yet..."
      });
    } else {
      placeholder = intl.formatMessage(
        {
          id: "chat-sidebar-container.input-placeholder.empty-room-bot",
          defaultMessage: "Send message to {discordChannels}"
        },
        { discordChannels: discordSnippet }
      );
    }
  } else {
    if (discordBridges.length === 0) {
      placeholder = intl.formatMessage(
        {
          id: "chat-sidebar-container.input-placeholder.occupants",
          defaultMessage:
            "{occupantCount, plural, one {Send message to one other...} other {Send message to {occupantCount} others...} }"
        },
        { discordChannels: discordSnippet, occupantCount: occupantCount - 1 }
      );
    } else {
      placeholder = intl.formatMessage(
        {
          id: "chat-sidebar-container.input-placeholder.occupants-and-bot",
          defaultMessage:
            "{occupantCount, plural, one {Send message to one other and {discordChannels}...} other {Send message to {occupantCount} others and {discordChannels}...} }"
        },
        { discordChannels: discordSnippet, occupantCount: occupantCount - 1 }
      );
    }
  }

  const isMobile = AFRAME.utils.device.isMobile();
  const isOverMaxLength = message.length > MAX_MESSAGE_LENGTH;
  return (
    <ChatSidebar onClose={onClose}>
      <ChatMessageList ref={listRef} onScroll={onScrollList}>
        {messageGroups.map(({ id, systemMessage, ...rest }) => {
          if (systemMessage) {
            return <SystemMessage key={id} {...rest} />;
          } else {
            return <ChatMessageGroup key={id} {...rest} />;
          }
        })}
      </ChatMessageList>
      <ChatInput
        id="chat-input"
        onKeyDown={onKeyDown}
        onChange={e => setMessage(e.target.value)}
        placeholder={placeholder}
        value={message}
        isOverMaxLength={isOverMaxLength}
        warning={
          <>
            {message.length + 50 > MAX_MESSAGE_LENGTH && (
              <ChatLengthWarning
                messageLength={message.length}
                maxLength={MAX_MESSAGE_LENGTH}
                isOverMaxLength={isOverMaxLength}
              />
            )}
          </>
        }
        afterInput={
          <>
            {!isMobile && (
              <EmojiPickerPopoverButton onSelectEmoji={emoji => setMessage(message => message + emoji.native)} />
            )}
            {message.length === 0 && canSpawnMessages ? (
              <MessageAttachmentButton onChange={onUploadAttachments} />
            ) : (
              <SendMessageButton onClick={onSendMessage} disabled={message.length === 0 || isOverMaxLength} />
            )}
            {canSpawnMessages && (
              <SpawnMessageButton disabled={message.length === 0 || isOverMaxLength} onClick={onSpawnMessage} />
            )}
          </>
        }
      />
    </ChatSidebar>
  );
}

ChatSidebarContainer.propTypes = {
  canSpawnMessages: PropTypes.bool,
  presences: PropTypes.object.isRequired,
  occupantCount: PropTypes.number.isRequired,
  scene: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired
};

export function ChatToolbarButtonContainer(props) {
  const { unreadMessages } = useContext(ChatContext);
  return <ChatToolbarButton {...props} statusColor={unreadMessages ? "unread" : undefined} />;
}
