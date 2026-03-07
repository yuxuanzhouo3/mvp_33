import { getDeploymentRegion } from "@/config"

export type DeploymentRegion = "CN" | "INTL"

export function resolveDeploymentRegion(): DeploymentRegion {
  return getDeploymentRegion() === "CN" ? "CN" : "INTL"
}

