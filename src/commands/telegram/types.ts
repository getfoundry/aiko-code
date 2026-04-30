/**
 * CLI types for the telegram subcommand.
 */

export interface TelegramSubcommandOpts {
  config: Record<string, unknown>
  options: Record<string, unknown>
  log: { info: (msg: string) => void; error: (msg: string) => void }
  token?: string
}
