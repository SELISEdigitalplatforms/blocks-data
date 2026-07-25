const generateRandomState = () => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const authenticateWithGithub = (extraState?: string, projectKey?: string) => {
  const randomState = generateRandomState()

  const scopes = ["repo", "user:email", "read:user", "read:repo_hook"].join(" ")

  const authUrl = new URL("https://github.com/login/oauth/authorize")
  authUrl.searchParams.set("client_id", import.meta.env.BLOCKS_GITHUB_CLIENT_ID || "")
  authUrl.searchParams.set("scope", scopes)
  authUrl.searchParams.set("state", randomState)

  const destination = localStorage.getItem("destination") || "/"
  localStorage.setItem("github_auth_destination", destination)
  localStorage.setItem("github_auth_state", randomState)
  if (projectKey) {
    localStorage.setItem("github_auth_project_key", projectKey)
  }

  window.open(authUrl.toString(), "_blank", "noopener,noreferrer")
}

export const verifyOAuthState = (receivedState: string | null) => {
  const storedState = localStorage.getItem("github_auth_state")
  return storedState === receivedState
}

export const authenticateWithGitlab = () => {
  console.error("GitLab authentication not yet implemented")
}

export const authenticateWithBitbucket = () => {
  console.error("Bitbucket authentication not yet implemented")
}

export const authenticateWithAzure = () => {
  console.error("Azure DevOps authentication not yet implemented")
}

export const authenticateWithAws = () => {
  console.error("AWS CodeCommit authentication not yet implemented")
}
