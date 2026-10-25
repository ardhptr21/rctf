import { response } from '../internal'
import { AdminSettingsResponseData } from './good-admin-settings'

export const GoodAdminSettingsUpdate = response('goodAdminSettingsUpdate', {
  status: 200,
  message: 'Settings successfully updated.',
  data: AdminSettingsResponseData,
})
