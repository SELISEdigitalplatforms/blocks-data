import { API_BASES, toUtilityApiUrl } from "@/constants/endpoint.constant";

export const NOTIFICATION_ENDPOINTS = {
  GET_NOTIFICATIONS: `${API_BASES.UTILITIES}/Notifier/GetNotifications`,
  MARK_AS_READ: `${API_BASES.UTILITIES}/Notifier/MarkNotificationAsRead`,
  MARK_ALL_AS_READ: `${API_BASES.UTILITIES}/Notifier/MarkAllNotificationAsRead`,
} as const;

export const NOTIFICATION_CONFIG_ENDPOINTS = {
  GET_CONFIGS: toUtilityApiUrl("/api/Notification/Gets"),
  SAVE_CONFIG: `${API_BASES.CLOUD_CONFIGURATION}/Notification/Save`,
  DELETE_CONFIG: `${API_BASES.CLOUD_CONFIGURATION}/Notification/Delete`,
} as const;
