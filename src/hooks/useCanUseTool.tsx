import { c as _c } from "react-compiler-runtime";
import { APIUserAbortError } from '@anthropic-ai/sdk';
import * as React from 'react';
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js';
import type { ToolPermissionContext, Tool as ToolType, ToolUseContext } from '../Tool.js';
import type { AssistantMessage } from '../types/message.js';
import { logForDebugging } from '../utils/debug.js';
import { AbortError } from '../utils/errors.js';
import { logError } from '../utils/log.js';
import type { PermissionDecision } from '../utils/permissions/PermissionResult.js';
import { createPermissionContext, createPermissionQueueOps } from './toolPermission/PermissionContext.js';

export type CanUseToolFn<Input extends Record<string, unknown> = Record<string, unknown>> = (
  tool: ToolType,
  input: Input,
  toolUseContext: ToolUseContext,
  assistantMessage: AssistantMessage,
  toolUseID: string,
  forceDecision?: PermissionDecision<Input>,
) => Promise<PermissionDecision<Input>>;

/**
 * Aiko-fork policy: every tool call is auto-allowed.
 *
 * Permission prompts are off by default — bypassPermissions is the always-on
 * mode in this fork. Design questions to the user route through
 * AskUserQuestion / model dialogue (independent of this gate), so this
 * doesn't silence those.
 *
 * The legacy classifier / rule / interactive prompt pipeline is removed.
 * If a caller explicitly passes `forceDecision` (e.g. compaction sub-
 * pipelines that must stay sandboxed), we honour it.
 */
function useCanUseTool(
  setToolUseConfirmQueue: (queue: ToolUseConfirm[]) => void,
  setToolPermissionContext: (ctx: ToolPermissionContext) => void,
) {
  const $ = _c(3);
  let t0;
  if ($[0] !== setToolPermissionContext || $[1] !== setToolUseConfirmQueue) {
    t0 = async (
      tool: ToolType,
      input: Record<string, unknown>,
      toolUseContext: ToolUseContext,
      assistantMessage: AssistantMessage,
      toolUseID: string,
      forceDecision?: PermissionDecision<Record<string, unknown>>,
    ): Promise<PermissionDecision<Record<string, unknown>>> => new Promise(resolve => {
      const ctx = createPermissionContext(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseID,
        setToolPermissionContext,
        createPermissionQueueOps(setToolUseConfirmQueue),
      );
      try {
        if (ctx.resolveIfAborted(resolve)) return;
        if (forceDecision !== undefined) {
          if (forceDecision.behavior === 'allow') {
            ctx.logDecision({ decision: 'accept', source: 'config' });
            resolve(ctx.buildAllow(forceDecision.updatedInput ?? input, {
              decisionReason: forceDecision.decisionReason,
            }));
          } else {
            resolve(forceDecision);
          }
          return;
        }
        ctx.logDecision({ decision: 'accept', source: 'config' });
        resolve(ctx.buildAllow(input, {
          decisionReason: { type: 'other' as const, reason: 'aiko-fork: bypassPermissions always-on' },
        }));
      } catch (error) {
        if (error instanceof AbortError || error instanceof APIUserAbortError) {
          logForDebugging(`Permission check aborted for tool=${tool.name}: ${(error as Error).message}`);
          ctx.logCancelled();
          resolve(ctx.cancelAndAbort(undefined, true));
        } else {
          logError(error as Error);
          resolve(ctx.cancelAndAbort(undefined, true));
        }
      }
    });
    $[0] = setToolPermissionContext;
    $[1] = setToolUseConfirmQueue;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}

export default useCanUseTool;
