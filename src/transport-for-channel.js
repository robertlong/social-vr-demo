export function transportForChannel(channel, reliable = true) {
  return (clientId, dataType, data) => {
    const payload = { dataType, data };

    if (clientId) {
      payload.clientId = clientId;
    }

    const isOpen = channel.socket.connectionState() === "open";

    if (isOpen || reliable) {
      const hasFirstSync =
        payload.dataType === "um" ? payload.data.d.find(r => r.isFirstSync) : payload.data.isFirstSync;

      if (hasFirstSync) {
        if (isOpen) {
          channel.push("naf", payload);
        } else {
          // Memory is re-used, so make a copy
          channel.push("naf", AFRAME.utils.clone(payload));
        }
      } else {
        // Optimization: Strip isFirstSync and send payload as a string to reduce server parsing.
        // The server will not parse messages without isFirstSync keys when sent to the nafr event.
        //
        // The client must assume any payload that does not have a isFirstSync key is not a first sync.
        const nafrPayload = AFRAME.utils.clone(payload);
        if (nafrPayload.dataType === "um") {
          for (let i = 0; i < nafrPayload.data.d.length; i++) {
            delete nafrPayload.data.d[i].isFirstSync;
          }
        } else {
          delete nafrPayload.data.isFirstSync;
        }

        channel.push("nafr", { naf: JSON.stringify(nafrPayload) });
      }
    }
  };
}
