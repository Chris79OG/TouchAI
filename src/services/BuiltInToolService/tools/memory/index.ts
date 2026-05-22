// Copyright (c) 2026. 千诚. Licensed under GPL v3

import {
    BuiltInTool,
    type BuiltInToolConversationSemantic,
    type BuiltInToolExecutionResult,
    type BuiltInToolGroup,
} from '../../types';
import { MEMORY_TOOL_DESCRIPTION, MEMORY_TOOL_INPUT_SCHEMA } from './constants';
import {
    buildMemoryApprovalRequest,
    executeMemoryTool,
    parseMemoryRequest,
    prepareMemoryToolArgs,
    sanitizeMemoryLogInput,
} from './helper';

function buildMemoryConversationSemantic(
    args: Record<string, unknown>
): BuiltInToolConversationSemantic {
    try {
        const request = parseMemoryRequest(args);
        if (request.action === 'read') {
            return { action: 'read', target: `长期记忆 ${request.ids.join(', ')}` };
        }
        if (request.action === 'delete') {
            return { action: 'remove', target: `长期记忆 ${request.id}` };
        }
        return { action: 'update', target: request.title };
    } catch {
        return { action: 'process', target: '长期记忆' };
    }
}

class MemoryTool extends BuiltInTool<Record<string, never>> {
    readonly id = 'memory' as const;
    readonly displayName = 'Memory';
    readonly description = MEMORY_TOOL_DESCRIPTION;
    readonly inputSchema = MEMORY_TOOL_INPUT_SCHEMA;
    readonly defaultConfig = {};

    override buildConversationSemantic(args: Record<string, unknown>) {
        return buildMemoryConversationSemantic(args);
    }

    override buildApprovalRequest(args: Record<string, unknown>) {
        return buildMemoryApprovalRequest(args);
    }

    override prepareForExecution(args: Record<string, unknown>): Record<string, unknown> {
        return prepareMemoryToolArgs(args);
    }

    override sanitizeLogInput(args: Record<string, unknown>): Record<string, unknown> {
        return sanitizeMemoryLogInput(args);
    }

    override execute(args: Record<string, unknown>): Promise<BuiltInToolExecutionResult> {
        return executeMemoryTool(args);
    }
}

export const memoryTool = new MemoryTool();
export const builtInTools: BuiltInToolGroup = [memoryTool];
