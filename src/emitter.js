export function emitter() {
  let bindings = [];
  let bindingRef = 0;
  const on = (event, callback) => {
    const ref = bindingRef++;
    bindings.push({ event, ref, callback });
    return ref;
  };
  const off = (event, ref) => {
    bindings = bindings.filter(bind => {
      return !(bind.event === event && (typeof ref === "undefined" || ref === bind.ref));
    });
  };
  const trigger = (event, payload) => {
    bindings.filter(bind => bind.event === event).forEach(bind => {
      bind.callback(payload);
    });
  };
  const getBindings = () => {
    return bindings;
  };
  return {
    on,
    off,
    trigger,
    getBindings
  };
}
