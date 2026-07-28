import { describe, expect, it } from "vitest";
import {
  createProviderField,
  createNameField,
  createClientIdField,
  createClientSecretField,
  createRedirectUrlField,
  createAudienceField,
  createCommonOAuthFields,
} from "./sso-provider-config-field-factory.util";

describe("sso-provider-config field factory", () => {
  describe("createProviderField", () => {
    it("builds a password field when type is password", () => {
      const field = createProviderField("9", "Secret", "secret", "password");
      expect(field).toMatchObject({
        id: "9",
        label: "Secret",
        name: "secret",
        type: "password",
      });
    });

    it("falls back to an input field for other types", () => {
      const field = createProviderField("9", "Name", "name", "select");
      expect(field.type).toBe("input");
    });

    it("applies overrides", () => {
      const field = createProviderField("9", "Name", "name", "input", {
        isDisabled: true,
        description: "hint",
      });
      expect(field).toMatchObject({ isDisabled: true, description: "hint" });
    });
  });

  describe("named field builders", () => {
    it("creates a disabled name field with a description", () => {
      const field = createNameField();
      expect(field).toMatchObject({
        id: "1",
        label: "Name",
        name: "provider",
        type: "input",
        isDisabled: true,
      });
      expect(field.description).toBeTruthy();
    });

    it("allows overriding the name field", () => {
      const field = createNameField({ isDisabled: false });
      expect(field.isDisabled).toBe(false);
    });

    it("creates the client id field", () => {
      expect(createClientIdField()).toMatchObject({
        id: "2",
        label: "Client ID",
        name: "clientId",
        type: "input",
      });
    });

    it("creates the client secret field as a password with a description", () => {
      const field = createClientSecretField();
      expect(field).toMatchObject({
        id: "3",
        label: "Client Secret",
        name: "clientSecret",
        type: "password",
      });
      expect(field.description).toBeTruthy();
    });

    it("creates the redirect url field", () => {
      expect(createRedirectUrlField()).toMatchObject({
        id: "4",
        name: "redirectUrl",
        type: "input",
      });
    });

    it("creates the audience field", () => {
      expect(createAudienceField()).toMatchObject({
        id: "5",
        name: "audience",
        type: "input",
      });
    });
  });

  describe("createCommonOAuthFields", () => {
    it("returns the five common fields in order", () => {
      const fields = createCommonOAuthFields();
      expect(fields.map((f) => f.name)).toEqual([
        "provider",
        "clientId",
        "clientSecret",
        "redirectUrl",
        "audience",
      ]);
    });

    it("forwards per-field overrides", () => {
      const fields = createCommonOAuthFields({
        clientId: { isDisabled: true },
      });
      const clientId = fields.find((f) => f.name === "clientId");
      expect(clientId?.isDisabled).toBe(true);
    });
  });
});
