import { tStatic } from "@seliseblocks/genesis-os/i18n";
export const channelsToNotify = [
  { get label() { return tStatic("data.console", "NOTIFICATION_CONSTANT.SIGNALR"); }, value: 0 },
  { get label() { return tStatic("data.console", "NOTIFICATION_CONSTANT.FIREBASE"); }, value: 1 },
];

export const notificationTypes = [
  { get label() { return tStatic("data.console", "NOTIFICATION_CONSTANT.NORECEIVERTYPE"); }, value: 0 },
  { get label() { return tStatic("data.console", "NOTIFICATION_CONSTANT.BROADCASTRECEIVERTYPE"); }, value: 1 },
  { get label() { return tStatic("data.console", "NOTIFICATION_CONSTANT.USERSPECIFICRECEIVERTYPE"); }, value: 2 },
  { get label() { return tStatic("data.console", "NOTIFICATION_CONSTANT.FILTERSPECIFICRECEIVERTYPE"); }, value: 3 },
];
