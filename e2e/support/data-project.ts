import fs from "fs"
import path from "path"

export type DataProjectFixture = {
  projectName: string
  itemId: string
  dashboardUrl: string
}

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/data-project.json")
export const DATA_SESSION_PATH = path.resolve(__dirname, "../fixtures/data-session.json")

export function readDataProject(): DataProjectFixture | null {
  if (!fs.existsSync(FIXTURE_PATH)) return null
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as DataProjectFixture
}

export function writeDataProject(fixture: DataProjectFixture) {
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true })
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2))
}

export function clearDataProject() {
  if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH)
}

export function clearDataSession() {
  if (fs.existsSync(DATA_SESSION_PATH)) fs.unlinkSync(DATA_SESSION_PATH)
}

export function dataSessionExists(): boolean {
  return fs.existsSync(DATA_SESSION_PATH)
}
