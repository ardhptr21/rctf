import { Permissions } from './permissions'

export enum PageAccess {
  Public = 'public',
  Private = 'private',
  Admin = 'admin',
}

export enum AccessControlledPage {
  Challenges = 'challenges',
  Scores = 'scores',
}

// a user holding any of these is treated as an admin for page access
export const ADMIN_PERMISSIONS =
  Permissions.challsRead | Permissions.usersWrite | Permissions.settingsWrite
