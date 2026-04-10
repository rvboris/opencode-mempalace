import { PROJECT_MEMORY_ROOMS, USER_MEMORY_ROOMS } from "./types"

const slugify = (value: string, fallback: string) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return slug || fallback
}

export const getProjectScope = (projectName: string | undefined, projectWingPrefix: string) => {
  return {
    wing: `${projectWingPrefix}_${slugify(projectName || "default", "default")}`,
    rooms: PROJECT_MEMORY_ROOMS,
  }
}

export const getUserScope = (userWingPrefix: string) => {
  return {
    wing: `${userWingPrefix}_profile`,
    rooms: USER_MEMORY_ROOMS,
  }
}
