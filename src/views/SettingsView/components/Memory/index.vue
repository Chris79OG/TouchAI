<!-- Copyright (c) 2026. 千诚. Licensed under GPL v3 -->

<script setup lang="ts">
    import AlertMessage from '@components/AlertMessage.vue';
    import AppIcon from '@components/AppIcon.vue';
    import {
        disableMemoryItem,
        findEnabledMemoryDirectoryItems,
        readEnabledMemoryItemsByIds,
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
    const disabling = ref(false);
    const directoryItems = ref<MemoryDirectoryItemEntity[]>([]);
    const selectedMemory = ref<MemoryItemEntity | null>(null);

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

    async function selectMemory(id: number) {
        try {
            const [memory] = await readEnabledMemoryItemsByIds([id]);
            selectedMemory.value = memory ?? null;
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to load memory:', error);
            alertMessage.value?.error('加载长期记忆失败', 6000);
        }
    }

    async function loadMemories() {
        loading.value = true;
        try {
            const items = await findEnabledMemoryDirectoryItems();
            directoryItems.value = items;
            const nextSelectedId =
                selectedMemory.value && items.some((item) => item.id === selectedMemory.value?.id)
                    ? selectedMemory.value.id
                    : items[0]?.id;

            if (nextSelectedId) {
                await selectMemory(nextSelectedId);
            } else {
                selectedMemory.value = null;
            }
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to load memories:', error);
            directoryItems.value = [];
            selectedMemory.value = null;
            alertMessage.value?.error('加载长期记忆失败', 6000);
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
            const updated = await updateMemoryItem(selectedMemory.value.id, {
                title: selectedMemory.value.title,
                applicability: selectedMemory.value.applicability,
                content: selectedMemory.value.content,
            });
            selectedMemory.value = updated ?? selectedMemory.value;
            await loadMemories();
            alertMessage.value?.success('长期记忆已保存', 3000);
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to save memory:', error);
            alertMessage.value?.error('保存长期记忆失败', 6000);
        } finally {
            saving.value = false;
        }
    }

    async function disableSelectedMemory() {
        if (!selectedMemory.value || disabling.value) {
            return;
        }

        disabling.value = true;
        try {
            await disableMemoryItem(selectedMemory.value.id);
            selectedMemory.value = null;
            await loadMemories();
            alertMessage.value?.success('长期记忆已停用', 3000);
        } catch (error) {
            console.error('[SettingsMemorySection] Failed to disable memory:', error);
            alertMessage.value?.error('停用长期记忆失败', 6000);
        } finally {
            disabling.value = false;
        }
    }

    onMounted(() => {
        void loadMemories();
    });
</script>

<template>
    <AlertMessage ref="alertMessage" />

    <div class="flex h-full">
        <div class="flex h-full w-80 flex-col border-r border-gray-200 bg-white/60">
            <div class="border-b border-gray-200 bg-white/80 p-4">
                <h2 class="font-serif text-base font-semibold text-gray-900">长期记忆</h2>
            </div>

            <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                <div v-if="loading" class="flex h-full items-center justify-center">
                    <div
                        class="border-t-primary-500 h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
                    />
                </div>

                <template v-else>
                    <button
                        v-for="item in directoryItems"
                        :key="item.id"
                        class="mb-2 w-full cursor-pointer rounded-lg border bg-white p-3 text-left transition-colors hover:bg-gray-50"
                        :class="
                            selectedMemory?.id === item.id
                                ? 'border-primary-300 bg-primary-50'
                                : 'border-gray-200'
                        "
                        @click="selectMemory(item.id)"
                    >
                        <div class="font-serif text-sm font-medium text-gray-900">
                            {{ item.title }}
                        </div>
                        <div class="mt-1 line-clamp-2 font-serif text-xs leading-5 text-gray-500">
                            {{ item.applicability }}
                        </div>
                    </button>

                    <div
                        v-if="directoryItems.length === 0"
                        class="flex h-full flex-col items-center justify-center px-6 text-center"
                    >
                        <AppIcon name="history" class="h-10 w-10 text-gray-300" />
                        <div class="mt-3 font-serif text-sm font-medium text-gray-900">
                            暂无长期记忆
                        </div>
                        <div class="mt-1 font-serif text-xs leading-5 text-gray-500">
                            后续由 Agent 在需要保存长期上下文时调用记忆工具写入。
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-gray-50/50 p-6">
            <div v-if="selectedMemory" class="mx-auto max-w-3xl space-y-4">
                <div class="rounded-lg border border-gray-200 bg-white p-6">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="font-serif text-lg font-semibold text-gray-900">
                                {{ selectedDirectoryItem?.title ?? selectedMemory.title }}
                            </h3>
                            <p class="mt-1 font-serif text-xs text-gray-500">
                                最近更新：{{ selectedMemory.updated_at }}
                            </p>
                        </div>
                    </div>
                </div>

                <div class="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
                    <label class="block">
                        <span class="font-serif text-sm font-medium text-gray-700">标题</span>
                        <input
                            v-model="selectedMemory.title"
                            class="focus:border-primary-300 mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-serif text-sm transition-colors outline-none"
                        />
                    </label>

                    <label class="block">
                        <span class="font-serif text-sm font-medium text-gray-700">适用条件</span>
                        <textarea
                            v-model="selectedMemory.applicability"
                            rows="3"
                            class="focus:border-primary-300 mt-2 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-serif text-sm leading-6 transition-colors outline-none"
                        />
                    </label>

                    <label class="block">
                        <span class="font-serif text-sm font-medium text-gray-700">内容</span>
                        <textarea
                            v-model="selectedMemory.content"
                            rows="10"
                            class="focus:border-primary-300 mt-2 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-serif text-sm leading-6 transition-colors outline-none"
                        />
                    </label>

                    <div class="flex justify-end gap-3">
                        <button
                            class="rounded-lg border border-red-200 px-4 py-2 font-serif text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            :disabled="saving || disabling"
                            @click="disableSelectedMemory"
                        >
                            停用
                        </button>
                        <button
                            class="bg-primary-600 hover:bg-primary-700 rounded-lg px-4 py-2 font-serif text-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            :disabled="saving || disabling"
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
                        选择一条长期记忆
                    </h3>
                    <p class="mt-2 font-serif text-sm leading-6 text-gray-500">
                        可以查看、编辑或停用 Agent 已保存的长期上下文。
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
