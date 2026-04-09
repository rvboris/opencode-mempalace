const slugify = (value: string, fallback: string) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return slug || fallback
}

export const getProjectScope = (projectName: string | undefined, projectWingPrefix: string) => {
  return {
    wing: `${projectWingPrefix}_${slugify(projectName || "default", "default")}`,
    rooms: ["architecture", "workflow", "decisions", "bugs", "setup"],
  }
}

export const getUserScope = (userWingPrefix: string) => {
  return {
    wing: `${userWingPrefix}_profile`,
    rooms: ["preferences", "workflow", "communication"],
  }
}
