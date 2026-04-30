/**
 * /gh - GitHub CLI (gh) skill.
 * Wraps `gh` CLI for PR reviews, issue triage, repo browsing, and API access.
 *
 * The skill returns a prompt that:
 *   1. Checks gh auth status and gh install status.
 *   2. Provides concrete command templates for common workflows.
 *   3. Tells the model to use `gh` for anything GitHub-related before falling
 *      back to WebFetch (which lacks auth and has rate limits).
 */
import { registerBundledSkill } from '../bundledSkills.js'
import { runFast } from '../../utils/bunShell.js'
import { which } from '../../utils/which.js'

type GhCliStatus = 'installed_and_authenticated' | 'installed_but_unauthenticated' | 'not_installed'

async function checkGhStatus(): Promise<GhCliStatus> {
  const ghPath = await which('gh')
  if (!ghPath) return 'not_installed'

  const { exitCode } = await runFast(['gh', 'auth', 'status'], {
    stderr: 'ignore',
    timeout: 5000,
  })
  return exitCode === 0 ? 'installed_and_authenticated' : 'installed_but_unauthenticated'
}

function buildPrompt(statusHint: string, userArgs: string): string {
  const userSection = userArgs
    ? `## User Request\n\n${userArgs}`
    : `## Available Commands\n\nType any gh command after /gh, e.g.:\n- /gh pr list --state open --json title,state,number\n- /gh issue list --state open --limit 10\n- /gh api repos/owner/repo/issues --jq '.[] | {number,title,state}'\n- /gh pr checks <NUMBER> --status failure\n- /gh run list --workflow ci.yml`

  // Build backtick code fences manually to avoid escaping issues in template literals
  const codeFence = '```'

  return `<gh priority="high">${statusHint}

## Quick Reference

### PR workflows
${codeFence}bash
# View a specific PR by number (no --limit on pr view)
gh pr view <NUMBER> --json title,body,state,reviewDecision,files,comments,reviewThreads,commits

# List PRs (paginated by default)
gh pr list --state open --json title,state,number,assignees,headRepositoryRef

# Review PR diff
gh pr diff <NUMBER>

# List PR checks/status
gh pr checks <NUMBER>
gh pr checks <NUMBER> --status failure

# View PR comments and threads
gh pr view <NUMBER> --json comments,reviewThreads

# View check runs for PR head commits
gh pr checks <NUMBER> --status failure --json name,status,conclusion

# Rebase a PR
gh pr checkout <NUMBER>
git pull --rebase origin main

# Merge a PR
gh pr merge <NUMBER> --squash --delete-branch

# List PRs by this author
gh pr list --state open --search "author:@me"
${codeFence}

### Issue workflows
${codeFence}bash
# List issues
gh issue list --state open --limit 20
gh issue list --label "bug" --state open

# View issue details
gh issue view <NUMBER> --json title,body,labels,comments,assignees

# Add a comment
gh issue comment <NUMBER> --body "text here"

# Close an issue
gh issue close <NUMBER> --comment "Resolved in ..."
${codeFence}

### Repo / branch workflows
${codeFence}bash
# Get repo info
gh repo view --json description,url,primaryRefName,defaultBranchRef

# List recent runs
gh run list --workflow ci.yml --limit 5 --json conclusion,status,headBranch

# View a run
gh run view <RUN_ID> --log --fail

# Checkout a PR locally
gh pr checkout <NUMBER>

# Create a branch from PR
gh pr checkout <NUMBER>
${codeFence}

### API access (when gh api is needed)
${codeFence}bash
# Generic API call (authenticated, rate-limited properly)
gh api repos/owner/repo/issues --method POST --jq '.id' --input -

# Paginated results
gh api repos/owner/repo/issues --paginate --jq '.[] | {number,title}'
${codeFence}

## Rules
- Always prefer gh over WebFetch for GitHub content - it's authenticated, rate-limit compliant, and faster.
- Use --json flag for structured output, parse with --jq for filtering.
- Use --paginate for listing endpoints that return paginated results.
- For API writes, use --method POST/PUT/PATCH with --input - for JSON body.
- Always check gh auth status before running commands that need auth.

${userSection}
</gh>`
}

export function registerGhSkill(): void {
  registerBundledSkill({
    name: 'gh',
    description:
      'GitHub CLI (gh) for PR review, issue triage, repo browsing, and GitHub API. Uses authenticated `gh` CLI - faster and more reliable than WebFetch for GitHub content. Triggers when: user mentions PRs/issues/branches/repos, need to review code on GitHub, want PR status/comments, or need GitHub API data.\n' +
      'DO NOT TRIGGER when: querying non-GitHub repos or non-GitHub workflows.',
    argumentHint: '[<command> [args...]]',
    allowedTools: ['Bash', 'Read'],
    userInvocable: true,
    async getPromptForCommand(args) {
      const status = await checkGhStatus()

      const statusHint = (() => {
        switch (status) {
          case 'installed_and_authenticated':
            return 'gh is installed and authenticated - use it freely.'
          case 'installed_but_unauthenticated':
            return 'gh is installed but not authenticated. Ask the user to run `gh auth login` first, or proceed with public-only commands.'
          case 'not_installed':
            return 'gh is not installed. Suggest the user install it (`brew install gh` or https://cli.github.com/) or proceed with WebFetch as fallback for public repos.'
        }
      })()

      const prompt = buildPrompt(statusHint, args)

      return [{
        type: 'text',
        text: prompt,
      }]
    },
  })
}
