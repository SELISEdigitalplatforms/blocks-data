import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "./use-project-store";
import { useAuthStore } from "./use-auth-store";
import { useImpersonateStore } from "./impersonate-store";
import { useLanguageViewStore } from "./use-language-view-store";

describe("useProjectStore", () => {
  beforeEach(() => {
    useProjectStore.getState().resetProjectStore();
  });

  it("sets the selected project and derives the tenant group", () => {
    const project = {
      itemId: "p1",
      tenantId: "t1",
      tenantGroupId: "g1",
      name: "Proj",
    } as never;
    useProjectStore.getState().setSelectedProject(project);
    expect(useProjectStore.getState().selectedProject).toEqual(project);
    expect(useProjectStore.getState().selectedTenantGroup).toBe("g1");
  });

  it("resets the selected project only", () => {
    useProjectStore
      .getState()
      .setSelectedProject({ tenantGroupId: "g1" } as never);
    useProjectStore.getState().resetSelectedProject();
    expect(useProjectStore.getState().selectedProject).toBeNull();
  });

  it("sets and resets the projects list", () => {
    useProjectStore.getState().setProjects([{ itemId: "a" }] as never);
    expect(useProjectStore.getState().projects).toHaveLength(1);
    useProjectStore.getState().resetProject();
    expect(useProjectStore.getState().projects).toEqual([]);
  });

  it("sets and resets the tenant group directly", () => {
    useProjectStore.getState().setTennantGroup("g9");
    expect(useProjectStore.getState().selectedTenantGroup).toBe("g9");
    useProjectStore.getState().resetTennantGroup();
    expect(useProjectStore.getState().selectedTenantGroup).toBeNull();
  });

  it("resetProjectStore clears everything", () => {
    useProjectStore.getState().setProjects([{ itemId: "a" }] as never);
    useProjectStore.getState().setTennantGroup("g1");
    useProjectStore.getState().resetProjectStore();
    const s = useProjectStore.getState();
    expect(s.projects).toEqual([]);
    expect(s.selectedProject).toBeNull();
    expect(s.selectedTenantGroup).toBeNull();
  });
});

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().resetAuthStore();
  });

  it("authenticates and unauthenticates", () => {
    useAuthStore.getState().setAuthenticated();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    useAuthStore.getState().setUser({ id: "u1" } as never);
    useAuthStore.getState().setUnAuthenticated();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("sets and clears tokens", () => {
    useAuthStore.getState().setTokens("access", "refresh");
    expect(useAuthStore.getState().accessToken).toBe("access");
    expect(useAuthStore.getState().refreshToken).toBe("refresh");
    useAuthStore.getState().clearTokens();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it("resetAuthStore restores defaults", () => {
    useAuthStore.getState().setAuthenticated();
    useAuthStore.getState().setTokens("a", "b");
    useAuthStore.getState().resetAuthStore();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
  });
});

describe("useImpersonateStore", () => {
  beforeEach(() => {
    useImpersonateStore.getState().reset();
  });

  it("impersonate sets flags and ids", () => {
    useImpersonateStore.getState().impersonate("imp", "orig");
    const s = useImpersonateStore.getState();
    expect(s.isImpersonated).toBe(true);
    expect(s.impersonatedTenantId).toBe("imp");
    expect(s.originalTenantId).toBe("orig");
  });

  it("terminate clears impersonation but keeps original tenant", () => {
    useImpersonateStore.getState().impersonate("imp", "orig");
    useImpersonateStore.getState().terminate("orig");
    const s = useImpersonateStore.getState();
    expect(s.isImpersonated).toBe(false);
    expect(s.impersonatedTenantId).toBeNull();
    expect(s.originalTenantId).toBe("orig");
  });

  it("setImpersonation and setInitialized set explicit values", () => {
    useImpersonateStore.getState().setImpersonation(true, "o", "i");
    useImpersonateStore.getState().setInitialized(true);
    const s = useImpersonateStore.getState();
    expect(s.isImpersonated).toBe(true);
    expect(s.isInitialized).toBe(true);
  });

  it("reset restores all defaults", () => {
    useImpersonateStore.getState().impersonate("i", "o");
    useImpersonateStore.getState().setInitialized(true);
    useImpersonateStore.getState().reset();
    const s = useImpersonateStore.getState();
    expect(s.isImpersonated).toBe(false);
    expect(s.impersonatedTenantId).toBeNull();
    expect(s.originalTenantId).toBeNull();
    expect(s.isInitialized).toBe(false);
  });
});

describe("useLanguageViewStore", () => {
  beforeEach(() => {
    useLanguageViewStore.getState().resetSelectedLanguages();
  });

  it("sets and toggles selected languages", () => {
    useLanguageViewStore.getState().setSelectedLanguages(["en", "de"]);
    expect(useLanguageViewStore.getState().selectedLanguages).toEqual([
      "en",
      "de",
    ]);
    useLanguageViewStore.getState().toggleLanguage("en"); // remove
    expect(useLanguageViewStore.getState().selectedLanguages).toEqual(["de"]);
    useLanguageViewStore.getState().toggleLanguage("fr"); // add
    expect(useLanguageViewStore.getState().selectedLanguages).toContain("fr");
  });

  it("sets and toggles optional columns", () => {
    useLanguageViewStore.getState().setSelectedOptionalColumns(["a"]);
    useLanguageViewStore.getState().toggleOptionalColumn("a"); // remove
    expect(useLanguageViewStore.getState().selectedOptionalColumns).toEqual([]);
    useLanguageViewStore.getState().toggleOptionalColumn("b"); // add
    expect(useLanguageViewStore.getState().selectedOptionalColumns).toEqual([
      "b",
    ]);
  });

  it("resetSelectedLanguages clears both languages and columns", () => {
    useLanguageViewStore.getState().setSelectedLanguages(["en"]);
    useLanguageViewStore.getState().setSelectedOptionalColumns(["a"]);
    useLanguageViewStore.getState().resetSelectedLanguages();
    expect(useLanguageViewStore.getState().selectedLanguages).toEqual([]);
    expect(useLanguageViewStore.getState().selectedOptionalColumns).toEqual([]);
  });
});
