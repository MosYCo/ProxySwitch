export function projectEntryUrl(project: { name: string; listen: string; path_prefix?: boolean; route_prefix?: string | null }) {
  const prefix = project.route_prefix ? project.route_prefix.split("/").map((part) => encodeURIComponent(part)).join("/") : project.path_prefix ? `/${encodeURIComponent(project.name)}` : ""
  return `http://localhost${project.listen}${prefix}/`
}

export function hasProxyRoute(project: { enabled?: boolean; current: string; environments: Record<string, unknown> }) {
  return project.enabled !== false && Object.prototype.hasOwnProperty.call(project.environments, project.current)
}
