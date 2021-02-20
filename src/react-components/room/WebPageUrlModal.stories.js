import React from "react";
import { RoomLayout } from "../layout/RoomLayout";
import { WebPageUrlModal } from "./WebPageUrlModal";

export default {
  title: "WebPageUrlModal",
  parameters: {
    layout: "fullscreen"
  }
};

export const Base = () => <RoomLayout modal={<WebPageUrlModal />} />;
