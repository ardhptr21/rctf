import { AdminPlayerRole, AdminPlayerStatus } from '@rctf/types'
import {
  clearFilter,
  toggleFilterOption,
  type MultiFilter,
} from '$lib/filters/core'
import {
  defineValueFilterFamily,
  type ResultTone,
  type ValueFilterFamily,
} from '$lib/filters/ui'
import { IconCheckCircle, IconUsersThree } from '$lib/icons'
import {
  ROLE_VALUES,
  roleLabel,
  STATUS_VALUES,
  statusLabel,
} from './players-model'

function roleTone(role: AdminPlayerRole): ResultTone {
  switch (role) {
    case AdminPlayerRole.CAPTAIN:
      return 'accent'
    case AdminPlayerRole.MEMBER:
      return 'success'
    case AdminPlayerRole.NO_TEAM:
      return 'warning'
  }
}

export function roleFilterFamily(
  filter: MultiFilter<AdminPlayerRole>
): ValueFilterFamily {
  return defineValueFilterFamily<AdminPlayerRole>({
    id: 'role',
    label: 'Role',
    pluralLabel: 'roles',
    icon: IconUsersThree,
    menuSize: 'narrow',
    searchTerms: ['captain', 'member', 'no team'],
    clear: () => clearFilter(filter),
    emptyLabel: 'No roles',
    options: () => ROLE_VALUES,
    optionKey: role => role,
    optionSearchValues: role => [roleLabel(role), role],
    optionSelected: role => filter.selected.includes(role),
    toggleOption: role => toggleFilterOption(filter, role, value => value),
    optionView: role => ({
      textValue: roleLabel(role),
      segments: [{ text: roleLabel(role) }],
      resultTone: roleTone(role),
    }),
  })
}

export function statusFilterFamily(
  filter: MultiFilter<AdminPlayerStatus>
): ValueFilterFamily {
  return defineValueFilterFamily<AdminPlayerStatus>({
    id: 'status',
    label: 'Status',
    pluralLabel: 'statuses',
    icon: IconCheckCircle,
    menuSize: 'narrow',
    searchTerms: ['active', 'banned'],
    clear: () => clearFilter(filter),
    emptyLabel: 'No statuses',
    options: () => STATUS_VALUES,
    optionKey: status => status,
    optionSearchValues: status => [statusLabel(status), status],
    optionSelected: status => filter.selected.includes(status),
    toggleOption: status => toggleFilterOption(filter, status, value => value),
    optionView: status => ({
      textValue: statusLabel(status),
      segments: [{ text: statusLabel(status) }],
      resultTone: status === AdminPlayerStatus.BANNED ? 'danger' : 'success',
    }),
  })
}
