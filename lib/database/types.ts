/**
 * Database abstraction types
 * Common types used by both CloudBase and Supabase implementations
 */

export type DatabaseType = 'supabase' | 'cloudbase'
export type Region = 'cn' | 'global'

export interface DatabaseClient {
  type: DatabaseType
  region: Region
  supabase?: any
  cloudbase?: any
}





















