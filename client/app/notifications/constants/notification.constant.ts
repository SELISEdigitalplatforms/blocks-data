import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_CONSOLE_MODULE = "data.console";
export const channelsToNotify = [
  { get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONSTANT.SIGNALR"); }, value: 0 },
  { get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONSTANT.FIREBASE"); }, value: 1 },
];

export const notificationTypes = [
  { get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONSTANT.NORECEIVERTYPE"); }, value: 0 },
  { get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONSTANT.BROADCASTRECEIVERTYPE"); }, value: 1 },
  { get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONSTANT.USERSPECIFICRECEIVERTYPE"); }, value: 2 },
  { get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONSTANT.FILTERSPECIFICRECEIVERTYPE"); }, value: 3 },
];
