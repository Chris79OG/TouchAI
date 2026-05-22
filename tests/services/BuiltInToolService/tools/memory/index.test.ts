import { describe, expect, it } from 'vitest';

import { memoryTool } from '@/services/BuiltInToolService/tools/memory';
import type { BuiltInTool } from '@/services/BuiltInToolService/types';

const tool = memoryTool as BuiltInTool<Record<string, never>>;

describe('memoryTool', () => {
    it('does not require approval for reads', () => {
        expect(
            tool.buildApprovalRequest({ action: 'read', ids: [1] }, {}, 'builtin__memory', {
                callId: 'call-1',
                iteration: 0,
                hasExecutedBuiltInTool: () => false,
            })
        ).toBeNull();
    });

    it('requires approval for upsert and delete actions', () => {
        const context = {
            callId: 'call-1',
            iteration: 0,
            hasExecutedBuiltInTool: () => false,
        };

        expect(
            tool.buildApprovalRequest(
                {
                    action: 'upsert',
                    title: '桌面工作流',
                    applicability: '当任务涉及桌面工作流时读取。',
                    content: '使用工具观察真实状态。',
                },
                {},
                'builtin__memory',
                context
            )
        ).toMatchObject({ title: '长期记忆修改确认' });

        expect(
            tool.buildApprovalRequest({ action: 'delete', id: 1 }, {}, 'builtin__memory', context)
        ).toMatchObject({ command: 'delete memory_id=1' });
    });

    it('builds conversation semantics for read and write operations', () => {
        expect(memoryTool.buildConversationSemantic({ action: 'read', ids: [1, 2] })).toEqual({
            action: 'read',
            target: '长期记忆 1, 2',
        });
        expect(memoryTool.buildConversationSemantic({ action: 'delete', id: 2 })).toEqual({
            action: 'remove',
            target: '长期记忆 2',
        });
        expect(
            memoryTool.buildConversationSemantic({
                action: 'upsert',
                title: '桌面工作流',
                applicability: '当任务涉及桌面工作流时读取。',
                content: '使用工具观察真实状态。',
            })
        ).toEqual({ action: 'update', target: '桌面工作流' });
    });

    it('falls back to process semantic for invalid arguments', () => {
        expect(memoryTool.buildConversationSemantic({ action: 'unknown' })).toEqual({
            action: 'process',
            target: '长期记忆',
        });
    });

    it('delegates execution to the memory helper', async () => {
        const result = await tool.execute(
            { action: 'read', ids: [] },
            {},
            {
                callId: 'call-1',
                iteration: 0,
                hasExecutedBuiltInTool: () => false,
            }
        );

        expect(result).toMatchObject({
            isError: false,
            status: 'success',
        });
    });
});
