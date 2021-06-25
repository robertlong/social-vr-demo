import nextTick from "./utils/next-tick.js";
const INIT_TIMEOUT_MS = 5000;

// Manages web push subscriptions
//
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default class Subscriptions {
  constructor(hubId) {
    this.hubId = hubId;
  }

  register() {
    if (navigator.serviceWorker) {
      try {
        navigator.serviceWorker
          .register("/hub.service.js")
          .then(() => {
            navigator.serviceWorker.ready
              .then(registration => this.setRegistration(registration))
              .catch(() => this.setRegistrationFailed());
          })
          .catch(() => this.setRegistrationFailed());
      } catch (e) {
        this.setRegistrationFailed();
      }
    } else {
      this.setRegistrationFailed();
    }
  }

  setHubChannel = hubChannel => {
    this.hubChannel = hubChannel;
  };

  setRegistration = registration => {
    this.registration = registration;
  };

  setRegistrationFailed = () => {
    this.registration = null;
  };

  setVapidPublicKey = vapidPublicKey => {
    this.vapidPublicKey = vapidPublicKey;
  };

  setSubscribed = isSubscribed => {
    this._isSubscribed = isSubscribed;
  };

  isSubscribed = () => {
    return this._isSubscribed;
  };

  getCurrentEndpoint = async () => {
    if (!navigator.serviceWorker) return null;
    const startedAt = performance.now();

    // registration becomes null if failed, non null if registered
    while (this.registration === undefined && performance.now() - startedAt < INIT_TIMEOUT_MS) await nextTick();
    if (performance.now() - startedAt >= INIT_TIMEOUT_MS) console.warn("Service worker registration timed out.");
    if (!this.registration || !this.registration.pushManager) return null;

    while (this.vapidPublicKey === undefined) await nextTick();
    if (this.vapidPublicKey === null) return null;

    try {
      const convertedVapidKey = urlBase64ToUint8Array(this.vapidPublicKey);

      if (
        (await this.registration.pushManager.permissionState({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        })) !== "granted"
      )
        return null;
    } catch (e) {
      return null; // Chrome can throw here complaining about userVisible if push is not right
    }
    const sub = await this.registration.pushManager.getSubscription();
    if (!sub) return null;

    return sub.endpoint;
  };

  toggle = async () => {
    if (!this.registration) return;

    if (this._isSubscribed) {
      const pushSubscription = await this.registration.pushManager.getSubscription();
      const res = await this.hubChannel.unsubscribe(pushSubscription);

      if (res && res.has_remaining_subscriptions === false) {
        pushSubscription.unsubscribe();
      }
    } else {
      let pushSubscription = await this.registration.pushManager.getSubscription();

      if (!pushSubscription) {
        const convertedVapidKey = urlBase64ToUint8Array(this.vapidPublicKey);

        pushSubscription = await this.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      }

      this.hubChannel.subscribe(pushSubscription);
    }

    this._isSubscribed = !this._isSubscribed;
  };
}
