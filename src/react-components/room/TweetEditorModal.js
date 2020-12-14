import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";
import createEmojiPlugin from "draft-js-emoji-plugin";
import createHashtagPlugin from "draft-js-hashtag-plugin";
import createLinkifyPlugin from "draft-js-linkify-plugin";
import createCounterPlugin from "draft-js-counter-plugin";
import Editor from "draft-js-plugins-editor";
import "draft-js-emoji-plugin/lib/plugin.css";
import "draft-js-hashtag-plugin/lib/plugin.css";
import "draft-js-linkify-plugin/lib/plugin.css";
import "draft-js-counter-plugin/lib/plugin.css";
import styles from "./TweetEditorModal.scss";
import { FormattedMessage } from "react-intl";

const emojiPlugin = createEmojiPlugin();
const hashtagPlugin = createHashtagPlugin();
const linkifyPlugin = createLinkifyPlugin();
const counterPlugin = createCounterPlugin();

export function TweetEditorModal({
  editorState,
  editorRef,
  sending,
  mediaThumbnailUrl,
  contentSubtype,
  onClickEditor,
  onChange,
  onSend,
  onClose
}) {
  const { EmojiSuggestions, EmojiSelect } = emojiPlugin;
  const { CharCounter } = counterPlugin;

  const tweetLength = editorState.getCurrentContent().getPlainText().length;

  return (
    <Modal title="Tweet" beforeTitle={<CloseButton onClick={onClose} />} onEscape={onClose}>
      <Column padding center>
        <div className={styles.media}>
          {contentSubtype && contentSubtype.startsWith("video") ? (
            <video src={mediaThumbnailUrl} width={450} height={255} controls />
          ) : (
            <img src={mediaThumbnailUrl} width={450} height={255} />
          )}
        </div>
        <div className={styles.editor}>
          <div className={styles.editorInner} onClick={onClickEditor}>
            <Editor
              ref={editorRef}
              editorState={editorState}
              onChange={onChange}
              plugins={[emojiPlugin, hashtagPlugin, linkifyPlugin, counterPlugin]}
            />
          </div>

          <div className={styles.emojiButton}>
            <EmojiSelect />
          </div>

          <div className={styles.emojiSuggestions}>
            <EmojiSuggestions />
          </div>

          {tweetLength > 200 && (
            <div className={styles.counter}>
              <CharCounter editorState={editorState} limit={280} /> / 280
            </div>
          )}
        </div>
        <Button preset="blue" disabled={sending || tweetLength > 280} onClick={onSend}>
          {sending ? "Sending Tweet..." : <FormattedMessage id="tweet-dialog.tweet" />}
        </Button>
      </Column>
    </Modal>
  );
}

TweetEditorModal.propTypes = {
  editorRef: PropTypes.any,
  editorState: PropTypes.object.isRequired,
  onChange: PropTypes.func,
  sending: PropTypes.bool,
  mediaThumbnailUrl: PropTypes.string,
  contentSubtype: PropTypes.string,
  onClickEditor: PropTypes.func,
  onSend: PropTypes.func,
  onClose: PropTypes.func
};
