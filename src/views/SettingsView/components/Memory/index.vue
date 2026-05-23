<!-- Copyright (c) 2026. 千诚. Licensed under GPL v3 -->

<script setup lang="ts">
    import AlertMessage from '@components/AlertMessage.vue';
    import AppIcon from '@components/AppIcon.vue';
    import {
        findMemoryDirectoryItems,
        readMemoryItemsByIds,
        updateMemoryItem,
    } from '@database/queries/memoryItems';
    import type { MemoryDirectoryItemEntity, MemoryItemEntity } from '@database/types';
    import { computed, onMounted, ref } from 'vue';

    defineOptions({
        name: 'SettingsMemorySection',
    });

    const alertMessage = ref<InstanceType<typeof AlertMessage> | null>(null);
    const loading = ref(true);
    const saving = ref(false);
    const togglingMemoryIds = ref<Set<number>>(new Set());
    const pendingMemoryEnabledById = ref<Map<number, number>>(new Map());
    const directoryItems = ref<MemoryDirectoryItemEntity[]>([]);
    const selectedMemory = ref<MemoryItemEntity | null>(null);

    const sortedDirectoryItems = computed(() =>
        [...directoryItems.value].sort(compareMemoryDirectoryItems)
    );
    const selectedDirectoryItem = computed(() =>
        directoryItems.value.find((item) => item.id === selectedMemory.value?.id)
    );

    function validateSelectedMemory(): string | null {
        if (!selectedMemory.value?.title.trim()) {
            return '标题不能为空';
        }
        if (!selectedMemory.value.applicability.trim()) {
            return '适用条件不能为空';
        }
        if (!selectedMemory.value.content.trim()) {
            return '内容不能为空';
        }
        return null;
    }

    function compareMemoryDirectoryItems(
        left: MemoryDirectoryItemEntity,
        right: MemoryDirectoryItemEntity
    ): number {
        return (
            Number(right.enabled) - Number(left.enabled) ||
            String(right.updated_at).localeCompare(String(left.updated_at)) ||
            right.id - left.id
        );
    }

    function updateLocalMemoryEnabled(
        memoryId: number,
        enabled: number,
        timestamps?: Pick<MemoryItemEntity, 'updated_at' | 'last_used_at'>
    ) {
        directoryItems.value = directoryItems.value.map((memory) =>
            memory.id === memoryId
                ? {
                      ...memory,
                      enabled,
                      updated_at: timestamps?.updated_at ?? memory.updated_at,
                  }
                : memory
        );

        if (selectedMemory.value?.id === memoryId) {
            selectedMemory.value = {
                ...selectedMemory.value,
                enabled,
                updated_at: timestamps?.updated_at ?? selectedMemory.value.updated_at,
                last_used_at: timestamps?.last_used_at ?? selectedMemory.value.last_used_at,
            };
        }
    }

    function getPendingMemoryEnabled(memoryId: number): number | undefined {
        return pendingMemoryEnabledById.value.get(memoryId);
    }

    function setPendingMemoryEnabled(memoryId: number, enabled: number) {
        const nextPending = new Map(pendingMemoryEnabledById.value);
        nextPending.set(memoryId, enabled);
        pendingMemoryEnabledById.value = nextPending;
    }

    function clearPendingMemoryEnabled(memoryId: number) {
        const nextPending = new Map(pendingMemoryEnabledById.value);
        nextPending.delete(memoryId);
        pendingMemoryEnabledById.value = nextPending;
    }

    function applyPendingMemoryEnabled<T extends MemoryDirectoryItemEntity | MemoryItemEntity>(
        memory: T
    ): T {
        const pendingEnabled = getPendingMemoryEnabled(memory.id);
        return pendingEnabled === undefined
            ? memory
            : {
                  ...memory,
                  enabled: pendingEnabled,
              };
    }

    async function selectMemory(id: number) {
        try {
            const [memory] = await readMemoryItemsByIds([id]);
            selectedMemory.value = memory ? applyPendingMemoryEnabled(memory) : null;
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to load memory:', error);
            alertMessage.value?.error('加载记忆失败', 6000);
        }
    }

    async function loadMemories() {
        loading.value = true;
        try {
            const items = await findMemoryDirectoryItems();
            const visibleItems = items.map(applyPendingMemoryEnabled);
            directoryItems.value = visibleItems;
            const orderedItems = [...visibleItems].sort(compareMemoryDirectoryItems);
            const nextSelectedId =
                selectedMemory.value &&
                visibleItems.some((item) => item.id === selectedMemory.value?.id)
                    ? selectedMemory.value.id
                    : orderedItems[0]?.id;

            if (nextSelectedId) {
                await selectMemory(nextSelectedId);
            } else {
                selectedMemory.value = null;
            }
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to load memories:', error);
            directoryItems.value = [];
            selectedMemory.value = null;
            alertMessage.value?.error('加载记忆失败', 6000);
        } finally {
            loading.value = false;
        }
    }

    async function saveSelectedMemory() {
        if (!selectedMemory.value || saving.value) {
            return;
        }

        const validationError = validateSelectedMemory();
        if (validationError) {
            alertMessage.value?.error(validationError, 4000);
            return;
        }

        saving.value = true;
        try {
            const memoryId = selectedMemory.value.id;
            const updated = await updateMemoryItem(memoryId, {
                title: selectedMemory.value.title,
                applicability: selectedMemory.value.applicability,
                content: selectedMemory.value.content,
            });
            if (updated && selectedMemory.value?.id === memoryId) {
                selectedMemory.value = {
                    ...updated,
                    enabled: selectedMemory.value.enabled,
                };
            }
            await loadMemories();
            alertMessage.value?.success('记忆已保存', 3000);
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to save memory:', error);
            alertMessage.value?.error('保存记忆失败', 6000);
        } finally {
            saving.value = false;
        }
    }

    async function toggleMemoryEnabled(item: MemoryDirectoryItemEntity, enabled: boolean) {
        if (togglingMemoryIds.value.has(item.id)) {
            return;
        }

        const nextEnabled = enabled ? 1 : 0;
        const previousDirectoryItem = directoryItems.value.find((memory) => memory.id === item.id);
        const previousSelectedState =
            selectedMemory.value?.id === item.id
                ? {
                      enabled: selectedMemory.value.enabled,
                      updated_at: selectedMemory.value.updated_at,
                      last_used_at: selectedMemory.value.last_used_at,
                  }
                : null;

        togglingMemoryIds.value.add(item.id);
        setPendingMemoryEnabled(item.id, nextEnabled);
        updateLocalMemoryEnabled(item.id, nextEnabled);
        try {
            const updated = await updateMemoryItem(item.id, {
                enabled: nextEnabled,
            });
            if (!updated) {
                throw new Error(`Memory item not found after enabled update: ${item.id}`);
            }

            directoryItems.value = directoryItems.value.map((memory) =>
                memory.id === item.id
                    ? {
                          id: updated.id,
                          title: updated.title,
                          applicability: updated.applicability,
                          enabled: updated.enabled,
                          updated_at: updated.updated_at,
                      }
                    : memory
            );

            updateLocalMemoryEnabled(item.id, updated.enabled, {
                updated_at: updated.updated_at,
                last_used_at: updated.last_used_at,
            });
            clearPendingMemoryEnabled(item.id);
        } catch (error) {
            clearPendingMemoryEnabled(item.id);
            if (previousDirectoryItem) {
                directoryItems.value = directoryItems.value.map((memory) =>
                    memory.id === item.id ? previousDirectoryItem : memory
                );
            }

            if (previousSelectedState && selectedMemory.value?.id === item.id) {
                selectedMemory.value = {
                    ...selectedMemory.value,
                    ...previousSelectedState,
                };
            }
            console.error('[SettingsMemorySection] Failed to toggle memory:', error);
            alertMessage.value?.error('更新记忆启用状态失败', 6000);
        } finally {
            togglingMemoryIds.value.delete(item.id);
        }
    }

    onMounted(() => {
        void loadMemories();
    });
</script>

<template>
    <AlertMessage ref="alertMessage" />

    <div class="flex h-full">
        <div class="flex h-full w-72 flex-col border-r border-gray-200 bg-white/60">
            <div class="border-b border-gray-200 bg-white/80 p-4">
                <h2 class="font-serif text-base font-semibold text-gray-900">记忆</h2>
            </div>

            <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                <div v-if="loading" class="flex h-full items-center justify-center">
                    <div
                        class="border-t-primary-500 h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
                    />
                </div>

                <template v-else>
                    <div
                        v-for="item in sortedDirectoryItems"
                        :key="item.id"
                        :data-testid="`settings-memory-item-${item.id}`"
                        :class="[
                            'mb-2 w-full cursor-pointer rounded-lg border p-3 text-left transition-all',
                            selectedMemory?.id === item.id
                                ? 'border-primary-600 bg-primary-50'
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                            item.enabled ? '' : 'opacity-70',
                        ]"
                        @click="selectMemory(item.id)"
                    >
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                                <div class="truncate font-serif text-sm font-medium text-gray-900">
                                    {{ item.title }}
                                </div>
                                <div
                                    class="mt-1 line-clamp-2 font-serif text-xs leading-5 text-gray-500"
                                >
                                    {{ item.applicability }}
                                </div>
                            </div>
                            <button
                                :data-testid="`settings-memory-toggle-${item.id}`"
                                :disabled="togglingMemoryIds.has(item.id)"
                                :aria-pressed="Boolean(item.enabled)"
                                :class="[
                                    'relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                                    item.enabled ? 'bg-primary-600' : 'bg-gray-200',
                                    togglingMemoryIds.has(item.id)
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'cursor-pointer',
                                ]"
                                title="启用/禁用"
                                @click.stop="toggleMemoryEnabled(item, !item.enabled)"
                            >
                                <span
                                    :class="[
                                        'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                        item.enabled ? 'translate-x-5' : 'translate-x-1',
                                    ]"
                                />
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="sortedDirectoryItems.length === 0"
                        class="flex h-full flex-col items-center justify-center px-6 text-center"
                    >
                        <AppIcon name="history" class="h-10 w-10 text-gray-300" />
                        <div class="mt-3 font-serif text-sm font-medium text-gray-900">
                            暂无记忆
                        </div>
                        <div class="mt-1 font-serif text-xs leading-5 text-gray-500">
                            后续由 Agent 在需要保存可复用上下文时调用记忆工具写入。
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col">
            <div
                data-testid="settings-memory-content"
                style="background-color: #fbfbf6"
                class="custom-scrollbar min-h-0 flex-1 overflow-y-auto"
            >
                <div v-if="selectedMemory" class="mx-auto max-w-3xl px-6 py-6">
                    <div class="border-b border-gray-200 pb-5">
                        <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0">
                                <h3 class="truncate font-serif text-lg font-semibold text-gray-900">
                                    {{ selectedDirectoryItem?.title ?? selectedMemory.title }}
                                </h3>
                                <p class="mt-1 font-serif text-xs text-gray-500">
                                    最近更新：{{ selectedMemory.updated_at }}
                                </p>
                            </div>
                            <span
                                :class="[
                                    'mt-0.5 rounded-full px-2 py-0.5 font-serif text-xs',
                                    selectedMemory.enabled
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'bg-gray-100 text-gray-500',
                                ]"
                            >
                                {{ selectedMemory.enabled ? '已启用' : '已禁用' }}
                            </span>
                        </div>
                    </div>

                    <div class="space-y-5 pt-5">
                        <label class="block">
                            <span class="font-serif text-sm font-medium text-gray-700">标题</span>
                            <input
                                v-model="selectedMemory.title"
                                class="focus:border-primary-300 mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-serif text-sm transition-colors outline-none"
                            />
                        </label>

                        <label class="block">
                            <span class="font-serif text-sm font-medium text-gray-700">
                                适用条件
                            </span>
                            <textarea
                                v-model="selectedMemory.applicability"
                                rows="3"
                                class="focus:border-primary-300 mt-2 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 font-serif text-sm leading-6 transition-colors outline-none"
                            />
                        </label>

                        <label class="block">
                            <span class="font-serif text-sm font-medium text-gray-700">内容</span>
                            <textarea
                                v-model="selectedMemory.content"
                                rows="10"
                                class="focus:border-primary-300 mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-serif text-sm leading-6 transition-colors outline-none"
                            />
                        </label>

                        <div class="flex justify-end">
                            <button
                                data-testid="settings-memory-save"
                                class="bg-primary-600 hover:bg-primary-700 rounded-lg px-4 py-2 font-serif text-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                :disabled="saving"
                                @click="saveSelectedMemory"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else class="flex h-full items-center justify-center px-6 text-center">
                    <div>
                        <AppIcon name="history" class="mx-auto h-12 w-12 text-gray-300" />
                        <h3 class="mt-4 font-serif text-base font-semibold text-gray-900">
                            选择一条记忆
                        </h3>
                        <p class="mt-2 font-serif text-sm leading-6 text-gray-500">
                            可以查看、编辑或启用停用 Agent 已保存的可复用上下文。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
