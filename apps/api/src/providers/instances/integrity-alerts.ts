import { config } from '@rctf/config'
import { messagesProviders } from '../messages'
import { loadProvider } from './load'

export const integrityAlertProviders = config.integrity.alertDestinations.map(
  ({ provider }) => loadProvider(messagesProviders, provider)!
)
