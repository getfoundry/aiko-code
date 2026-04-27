import assert from 'node:assert/strict'
import test from 'node:test'

import { extractGitHubRepoSlug } from './repoSlug.ts'

test('keeps owner/repo input as-is', () => {
  assert.equal(extractGitHubRepoSlug('getfoundry/aiko-code'), 'getfoundry/aiko-code')
})

test('extracts slug from https GitHub URLs', () => {
  assert.equal(
    extractGitHubRepoSlug('https://github.com/getfoundry/aiko-code'),
    'getfoundry/aiko-code',
  )
  assert.equal(
    extractGitHubRepoSlug('https://www.github.com/getfoundry/aiko-code.git'),
    'getfoundry/aiko-code',
  )
})

test('extracts slug from ssh GitHub URLs', () => {
  assert.equal(
    extractGitHubRepoSlug('git@github.com:getfoundry/aiko-code.git'),
    'getfoundry/aiko-code',
  )
  assert.equal(
    extractGitHubRepoSlug('ssh://git@github.com/getfoundry/aiko-code'),
    'getfoundry/aiko-code',
  )
})

  assert.equal(extractGitHubRepoSlug('https://github.com/getfoundry'), null)
