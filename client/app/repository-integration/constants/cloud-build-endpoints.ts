export const CLOUD_BUILD_ENDPOINTS = {
  ACCESS_TOKEN: "/api/auth/accessToken",
  IS_AUTHORIZED: "/api/auth/isAuthorized",
  REMOVE_AUTHORIZATION: "/api/auth/removeAuthorization",
  REMOVE_ACCESS_TOKEN: "/api/auth/removeAccessToken",

  GITHUB_REPOS: "/api/github/repos",
  GITHUB_USER: "/api/github/user",
  GITHUB_BRANCHES: "/api/github/branches",
  GITHUB_BRANCH_EXISTS: "/api/github/branchExists",

  BUILD_BUILD: "/api/build/clone",
  RUN_BUILD: "/api/build/run",
  MANUAL: "/api/build/manual",
  BUILD: "/api/build",

  REPOS: "/api/repos",
  REPOS_LIST: "/api/repos/list",
  REPO_DETAILS: "/api/repos/details",

  SETTINGS: "/api/settings",
} as const
