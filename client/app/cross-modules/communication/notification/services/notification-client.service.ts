import { HttpTransportType, HubConnection, HubConnectionBuilder } from "@microsoft/signalr";
import { getRuntimeEnv } from "@/lib/runtime-env";

export class NotificationClientService {
  public connection: HubConnection;

  constructor() {
    this.connection = new HubConnectionBuilder()
      .withUrl(
        `${getRuntimeEnv("BLOCKS_API_BASE_URL")}/communication/v1/NotificationHub?x-blocks-key=${getRuntimeEnv("BLOCKS_X_BLOCKS_KEY")}`,
        {
          transport: HttpTransportType.WebSockets,
        },
      )
      .withAutomaticReconnect()
      .build();
    this.connect();
  }

  async connect() {
    this.connection.start();
  }

  async disconnect() {
    if (this.connection.state !== "Disconnected") {
      await this.connection.stop();
    }
  }
}

export const notificationClientService = new NotificationClientService();
