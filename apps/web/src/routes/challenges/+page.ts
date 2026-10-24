import { challengesQueryOptions } from '$lib/query/challenges'
import { userSelfQueryOptions } from '$lib/query/user'
import { decidePageGate } from '$lib/utils/page-gate'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent }) => {
  const { queryClient, clientConfig } = await parent()
  const user = queryClient.getQueryData(userSelfQueryOptions.queryKey)
  if (decidePageGate(clientConfig.pageAccess.challenges, user) !== 'ok') {
    return
  }
  await queryClient.prefetchQuery(challengesQueryOptions)
}
