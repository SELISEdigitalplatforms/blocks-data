import { describe, expect, it } from "vitest";
import {
  DeploymentEventType,
  DeploymentEventGroup,
} from "./deployment-notification";

describe("deployment-notification enums", () => {
  it("exposes the deployment event types", () => {
    expect(DeploymentEventType.EventStarted).toBe("EventStarted");
    expect(DeploymentEventType.EventFinished).toBe("EventFinished");
    expect(DeploymentEventType.EventFailed).toBe("EventFailed");
    expect(DeploymentEventType.Log).toBe("Log");
  });

  it("exposes the deployment event groups", () => {
    expect(DeploymentEventGroup.Clone).toBe("Clone");
    expect(DeploymentEventGroup.Build).toBe("Build");
    expect(DeploymentEventGroup.Sast).toBe("Sast");
    expect(DeploymentEventGroup.Sca).toBe("Sca");
    expect(DeploymentEventGroup.Deploy).toBe("Deploy");
  });
});
