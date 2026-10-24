import { challengesQueryOptions } from '$lib/query/challenges'
import { playerSelfQueryOptions } from '$lib/query/team'
import { userSelfQueryOptions } from '$lib/query/user'
import { decidePageGate } from '$lib/utils/page-gate'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent }) => {
  const { queryClient, clientConfig } = await parent()
  const user = queryClient.getQueryData(userSelfQueryOptions.queryKey)
  const self = await queryClient.fetchQuery(playerSelfQueryOptions)
  const gate = decidePageGate(clientConfig.pageAccess.challenges, user, {
    page: 'challenges',
    noTeam: !!self && !self.team,
  })
  if (gate !== 'ok') {
    return
  }
  await queryClient.prefetchQuery(challengesQueryOptions)
}
