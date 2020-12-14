import { paths } from "../paths";
import { ArrayBackedSet } from "../array-backed-set";
export class KeyboardDevice {
  constructor(canvasEl) {
    this.seenKeys = new ArrayBackedSet();
    this.keys = {};
    this.events = [];

    ["keydown", "keyup"].map(x =>
      document.addEventListener(x, e => {
        // Keyboard shortcuts only work when the canvas is focused.
        if (!e.key || document.activeElement !== canvasEl) return;

        this.events.push(e);

        // Ctrl + a number key is used to launch the media browser in a specific tab. Block the browser behavior when the canvas is focused.
        // Tab key is blocked when the canvas is focused. Press the Esc key to move focus to the other menus.
        if (
          (e.ctrlKey &&
            (e.key === "1" ||
              e.key === "2" ||
              e.key === "3" ||
              e.key === "4" ||
              e.key === "5" ||
              e.key === "6" ||
              e.key === "7" ||
              e.key === "8" ||
              e.key === "9" ||
              e.key === "0")) ||
          e.key === "Tab"
        ) {
          e.preventDefault();
          return false;
        }
      })
    );
    ["blur"].map(x => window.addEventListener(x, this.events.push.bind(this.events)));
  }

  write(frame) {
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      if (event.type === "blur") {
        this.keys = {};
        this.seenKeys.clear();
      } else {
        const key = event.key.toLowerCase();
        this.keys[key] = event.type === "keydown";
        this.seenKeys.add(key);
      }
    }

    this.events.length = 0;

    for (let i = 0; i < this.seenKeys.items.length; i++) {
      const key = this.seenKeys.items[i];
      const path = paths.device.keyboard.key(key);
      frame.setValueType(path, this.keys[key]);
    }
  }
}
