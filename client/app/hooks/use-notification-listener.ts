import { useEffect } from "react";

export const useNotificationListener = <T = unknown>(
  notificationName: string,
  callback: (data: T) => void,
) => {
  useEffect(() => {
    const handleNotification = (event: CustomEvent<T>) => {
      callback(event.detail);
    };

    window.addEventListener(notificationName, handleNotification as EventListener);

    return () => {
      window.removeEventListener(notificationName, handleNotification as EventListener);
    };
  }, [callback, notificationName]);
};
