import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { enrichSavedMetadata } from '@/services/ai';
import { createId } from '@/services/id';
import {
  cancelAllItemReminders,
  cancelItemReminder,
  dismissItemNotification,
  scheduleItemReminder,
  scheduleReminderNotification
} from '@/services/notifications';
import {
  defaultSettings,
  clearDemoData,
  getDemoUserId,
  readItems,
  readSettings,
  readSharedQueue,
  clearSharedQueue,
  writeItems,
  writeSettings
} from '@/services/storage';
import {
  deleteAllUserDataFromSupabase,
  deleteDoneItemsFromSupabase,
  deleteItemFromSupabase,
  loadItemsFromSupabase,
  loadSettingsFromSupabase,
  saveSettingsToSupabase,
  upsertItemsToSupabase
} from '@/services/supabase';
import { detectPlatform, fetchMetadataPreview, getHostLabel, normalizeUrl, youtubeThumbnail } from '@/services/url';
import { AppError, Category, MetadataPreview, SaveDraft, SavedItem, SaveResult, UserSettings } from '@/types';

type SavedItemsMode = 'demo' | 'authenticated';

type UseSavedItemsOptions = {
  authReady: boolean;
  authUserId: string | null;
};

export function useSavedItems({ authReady, authUserId }: UseSavedItemsOptions) {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errors, setErrors] = useState<AppError[]>([]);
  const itemsRef = useRef<SavedItem[]>([]);
  const settingsRef = useRef<UserSettings>(defaultSettings);
  const mode: SavedItemsMode = authUserId ? 'authenticated' : 'demo';
  const isAuthenticated = mode === 'authenticated';

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const commitItems = useCallback((nextItems: SavedItem[]) => {
    const sorted = sortItems(nextItems);
    itemsRef.current = sorted;
    setItems(sorted);
    scheduleReminderNotification(sorted, settingsRef.current).catch((error) => {
      if (settingsRef.current.notifications_enabled) {
        const msg = errorMessage(error);
        if (!msg.includes('org.json.JSONObject')) {
          pushError(`Daily reminder could not be scheduled: ${msg}`);
        }
      }
    });
    return sorted;
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      // 1. Process deletes
      const deletesStr = await AsyncStorage.getItem('cache:pending_deletes');
      if (deletesStr) {
        const deletes: string[] = JSON.parse(deletesStr);
        if (deletes.length > 0) {
          await Promise.all(deletes.map((id) => deleteItemFromSupabase(id).catch(() => {})));
          await AsyncStorage.removeItem('cache:pending_deletes');
        }
      }

      // 2. Process edits/inserts
      const queuedItems = itemsRef.current.filter((item) => item.sync_status === 'queued');
      if (queuedItems.length > 0) {
        // Change status to synced for the upload
        const itemsToUpload = queuedItems.map(item => ({ ...item, sync_status: 'synced' as const }));
        await upsertItemsToSupabase(itemsToUpload);
        
        // If successful, update local state
        const nextItems = itemsRef.current.map(item => {
          if (item.sync_status === 'queued') {
            return { ...item, sync_status: 'synced' as const };
          }
          return item;
        });
        commitItems(nextItems);
        await AsyncStorage.setItem('cache:saved_items', JSON.stringify(nextItems));
      }
    } catch (err) {
      // Ignore, will retry later
    }
  }, [isAuthenticated, commitItems]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && isReady) {
        syncOfflineQueue();
      }
    });
    return () => unsubscribe();
  }, [syncOfflineQueue, isReady]);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      if (!authReady) return;
      setIsReady(false);
      
      let hasCache = false;
      
      if (isAuthenticated) {
        try {
          const [cachedItemsStr, cachedSettingsStr] = await Promise.all([
            AsyncStorage.getItem('cache:saved_items'),
            AsyncStorage.getItem('cache:user_settings')
          ]);
          if (cachedItemsStr && mounted) {
            const cachedItems = JSON.parse(cachedItemsStr);
            setItems(sortItems(cachedItems));
            itemsRef.current = sortItems(cachedItems);
            hasCache = true;
          }
          if (cachedSettingsStr && mounted) {
            const cachedSettings = JSON.parse(cachedSettingsStr);
            setSettings(cachedSettings);
            settingsRef.current = cachedSettings;
            hasCache = true;
          }
          if (hasCache && mounted) {
            setIsReady(true);
          }
        } catch (e) {
          // Ignore cache read errors
        }
      }

      try {
        await syncOfflineQueue();
        const [nextItems, nextSettings] = isAuthenticated
          ? await hydrateFromSupabase()
          : await hydrateDemoStorage();

        if (isAuthenticated) {
          await Promise.all([
            AsyncStorage.setItem('cache:saved_items', JSON.stringify(nextItems)),
            AsyncStorage.setItem('cache:user_settings', JSON.stringify(nextSettings))
          ]);
        }

        if (!mounted) return;

        setItems(sortItems(nextItems));
        setSettings(nextSettings);
        itemsRef.current = sortItems(nextItems);
        settingsRef.current = nextSettings;
      } catch (err) {
        if (!mounted) return;
        if (isAuthenticated && !hasCache) {
          setErrors((current) => [{ id: createId('err'), message: "You're offline — connect to load your saved items" }, ...current].slice(0, 3));
        } else if (!isAuthenticated) {
          setErrors((current) => [{ id: createId('err'), message: 'Could not load your saves. Check your connection.' }, ...current].slice(0, 3));
        }
      } finally {
        if (mounted) setIsReady(true);
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, [authReady, authUserId, isAuthenticated]);

  const unwatchedCount = useMemo(() => items.filter((item) => !item.is_done).length, [items]);
  const doneCount = useMemo(() => items.filter((item) => item.is_done).length, [items]);

  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const nextSettings = { ...settingsRef.current, ...patch };
    try {
      if (isAuthenticated) {
        await saveSettingsToSupabase(nextSettings);
        await AsyncStorage.setItem('cache:user_settings', JSON.stringify(nextSettings));
      } else {
        await writeSettings(nextSettings);
      }

      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      scheduleReminderNotification(itemsRef.current, nextSettings).catch((error) => {
        if (nextSettings.notifications_enabled) {
          const msg = errorMessage(error);
          if (!msg.includes('org.json.JSONObject')) {
            pushError(`Daily reminder could not be scheduled: ${msg}`);
          }
        }
      });
    } catch (err: any) {
      pushError(
        isAuthenticated
          ? "Couldn't save settings — check your connection."
          : 'Could not save demo settings on this device.'
      );
    }
  }, [isAuthenticated]);

  const persistDemoItems = useCallback(
    async (nextItems: SavedItem[]) => {
      const sorted = commitItems(nextItems);
      await writeItems(sorted);
    },
    [commitItems]
  );

  const persistChangedItems = useCallback(
    async (nextItems: SavedItem[], changedItems: SavedItem[]) => {
      const normalizedChangedItems = changedItems.map((item) => ({
        ...item,
        user_id: authUserId ?? item.user_id,
        sync_status: 'synced' as const
      }));

      const nextById = new Map(normalizedChangedItems.map((item) => [item.id, item]));
      const normalizedNextItems = nextItems.map((item) => nextById.get(item.id) ?? item);

      if (isAuthenticated) {
        try {
          await upsertItemsToSupabase(normalizedChangedItems);
          commitItems(normalizedNextItems);
          await AsyncStorage.setItem('cache:saved_items', JSON.stringify(normalizedNextItems));
        } catch (error) {
          // Offline handling: Mark as queued
          const queuedChangedItems = changedItems.map((item) => ({
            ...item,
            user_id: authUserId ?? item.user_id,
            sync_status: 'queued' as const
          }));
          const queuedNextById = new Map(queuedChangedItems.map((item) => [item.id, item]));
          const queuedNextItems = nextItems.map((item) => queuedNextById.get(item.id) ?? item);
          
          commitItems(queuedNextItems);
          await AsyncStorage.setItem('cache:saved_items', JSON.stringify(queuedNextItems));
        }
        return;
      }

      await persistDemoItems(normalizedNextItems);
    },
    [authUserId, commitItems, isAuthenticated, persistDemoItems]
  );

  const clearExpiredCustomReminders = useCallback(async () => {
    const now = Date.now();
    const expiredItems = itemsRef.current.filter(
      (item) => item.custom_reminder_at && new Date(item.custom_reminder_at).getTime() <= now
    );
    if (expiredItems.length === 0) return;

    const changedItems = expiredItems.map((item) => ({
      ...item,
      custom_reminder_at: null,
      sync_status: 'synced' as const
    }));
    const changedById = new Map(changedItems.map((item) => [item.id, item]));
    const nextItems = itemsRef.current.map((item) => changedById.get(item.id) ?? item);

    await Promise.all(expiredItems.map((item) => cancelItemReminder(item.id)));
    await persistChangedItems(nextItems, changedItems);
  }, [persistChangedItems]);

  useEffect(() => {
    if (!isReady) return;

    clearExpiredCustomReminders().catch(() => undefined);
    const interval = setInterval(() => {
      clearExpiredCustomReminders().catch(() => undefined);
    }, 30_000);

    return () => clearInterval(interval);
  }, [clearExpiredCustomReminders, isReady]);

  useEffect(() => {
    if (!isReady || !settings.notifications_enabled) return;

    itemsRef.current
      .filter((item) => isActiveCustomReminder(item))
      .forEach((item) => {
        scheduleItemReminder(item, new Date(item.custom_reminder_at as string)).catch(() => undefined);
      });
  }, [isReady, settings.notifications_enabled]);

  const enrichItem = useCallback(
    async (itemId: string, url: string, fallbackTitle: string, initialPreview?: MetadataPreview) => {
      try {
        let preview = initialPreview;
        if (!preview) {
          try {
            preview = await fetchMetadataPreview(url);
          } catch {
            preview = undefined;
          }
        }

        const rawTitle = preview?.rawTitle || fallbackTitle || getHostLabel(url);
        const rawDescription = preview?.rawDescription || '';
        const enrichment = await enrichSavedMetadata(url, rawTitle, rawDescription);
        const existing = itemsRef.current.find((item) => item.id === itemId);
        if (!existing) return;
        const enrichedItem: SavedItem = {
          ...existing,
          platform: preview?.platform ?? existing.platform,
          raw_title: rawTitle,
          clean_title: enrichment.cleanTitle || existing.clean_title,
          category: enrichment.category,
          summary: enrichment.summary,
          thumbnail_url: preview?.thumbnailUrl || existing.thumbnail_url,
          creator_handle: enrichment.creatorHandle ?? preview?.creatorHandle ?? existing.creator_handle,
          urgency_score: enrichment.urgencyScore,
          is_enriched: true,
          sync_status: 'synced'
        };
        const nextItems = itemsRef.current.map((item) => (item.id === itemId ? enrichedItem : item));
        try {
          await persistChangedItems(nextItems, [enrichedItem]);
        } catch {
          // ignore offline failure for enrichment
        }
      } catch {
        const existing = itemsRef.current.find((item) => item.id === itemId);
        if (!existing) return;
        const fallbackItem: SavedItem = {
          ...existing,
          category: 'Other' as const,
          summary: '',
          urgency_score: 3,
          is_enriched: false,
          sync_status: 'synced'
        };
        const nextItems = itemsRef.current.map((item) => (item.id === itemId ? fallbackItem : item));
        try {
          await persistChangedItems(nextItems, [fallbackItem]);
        } catch {
          // ignore offline failure for enrichment
        }
      }
    },
    [persistChangedItems]
  );

  const saveDraft = useCallback(
    async (draft: SaveDraft, options?: { forceDuplicate?: boolean }): Promise<SaveResult> => {
      const normalizedUrl = draft.preview?.normalizedUrl || normalizeUrl(draft.url);
      if (!normalizedUrl) {
        return { status: 'error', message: 'Add a valid link to save.' };
      }

      const existing = itemsRef.current.find((item) => item.url === normalizedUrl);
      if (existing && !options?.forceDuplicate) {
        return { status: 'duplicate', item: existing };
      }

      try {
        const userId = authUserId ?? (await getDemoUserId());
        const now = new Date().toISOString();
        const platform = draft.preview?.platform ?? detectPlatform(normalizedUrl);
        const baseTitle = draft.preview?.rawTitle || getHostLabel(normalizedUrl) || 'Untitled save';
        const item: SavedItem = {
          id: createId('save'),
          user_id: userId,
          url: normalizedUrl,
          platform,
          raw_title: baseTitle,
          clean_title: baseTitle,
          category: 'Other',
          summary: '',
          thumbnail_url: draft.preview?.thumbnailUrl || (platform === 'youtube' ? youtubeThumbnail(normalizedUrl) : ''),
          save_reason: draft.saveReason?.trim() || null,
          save_reason_chip: draft.saveReasonChip || null,
          creator_handle: draft.preview?.creatorHandle ?? null,
          urgency_score: 3,
          is_important: Boolean(draft.isImportant),
          is_done: false,
          snooze_count: 0,
          snoozed_until: null,
          custom_reminder_at: null,
          saved_at: now,
          done_at: null,
          last_reminded_at: null,
          is_enriched: false,
          sync_status: 'synced'
        };

        const nextItems = [item, ...itemsRef.current];
        const seenPlatforms = Array.from(new Set([...settingsRef.current.seen_platforms, item.platform]));

        await persistChangedItems(nextItems, [item]);
        await updateSettings({ seen_platforms: seenPlatforms });

        enrichItem(item.id, item.url, item.raw_title, draft.preview).catch(() => undefined);
        return { status: 'saved', item };
      } catch (err: any) {
        return { status: 'error', message: "Couldn't save — check your connection." };
      }
    },
    [authUserId, enrichItem, persistChangedItems, updateSettings]
  );

  const markDone = useCallback(
    async (itemId: string) => {
      const now = new Date().toISOString();
      const changed = itemsRef.current.find((item) => item.id === itemId);
      if (!changed) return;
      const updatedItem: SavedItem = {
        ...changed,
        is_done: true,
        done_at: now,
        custom_reminder_at: null,
        sync_status: 'synced'
      };
      const nextItems = itemsRef.current.map((item) =>
        item.id === itemId ? updatedItem : item
      );
      try {
        await persistChangedItems(nextItems, [updatedItem]);
        // Section 4: Cancel any pending per-item scheduled notification AND dismiss
        // any already-displayed notification for this item from the notification tray.
        // This covers all 3 conditions: no future reminders, cleared from tray, OS-level cancel.
        await cancelItemReminder(itemId);
        await dismissItemNotification(itemId);
      } catch {
        pushError("Couldn't save — check your connection.");
      }
    },
    [persistChangedItems]
  );

  const markUnwatched = useCallback(
    async (itemId: string) => {
      const changed = itemsRef.current.find((item) => item.id === itemId);
      if (!changed) return;
      const updatedItem: SavedItem = { ...changed, is_done: false, done_at: null, sync_status: 'synced' };
      const nextItems = itemsRef.current.map((item) =>
        item.id === itemId ? updatedItem : item
      );
      try {
        await persistChangedItems(nextItems, [updatedItem]);
      } catch {
        pushError("Couldn't save — check your connection.");
      }
    },
    [persistChangedItems]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (isAuthenticated) {
        try {
          await deleteItemFromSupabase(itemId);
          const nextItems = itemsRef.current.filter((item) => item.id !== itemId);
          commitItems(nextItems);
          await AsyncStorage.setItem('cache:saved_items', JSON.stringify(nextItems));
          await cancelItemReminder(itemId);
        } catch {
          // Offline handling: queue delete
          const nextItems = itemsRef.current.filter((item) => item.id !== itemId);
          commitItems(nextItems);
          await AsyncStorage.setItem('cache:saved_items', JSON.stringify(nextItems));
          
          const deletesStr = await AsyncStorage.getItem('cache:pending_deletes');
          const deletes = deletesStr ? JSON.parse(deletesStr) : [];
          deletes.push(itemId);
          await AsyncStorage.setItem('cache:pending_deletes', JSON.stringify(deletes));
          
          await cancelItemReminder(itemId);
        }
        return;
      }
      await persistDemoItems(itemsRef.current.filter((item) => item.id !== itemId));
      await cancelItemReminder(itemId);
    },
    [commitItems, isAuthenticated, persistDemoItems]
  );

  const updateItem = useCallback(
    async (itemId: string, patch: Partial<SavedItem>) => {
      const changed = itemsRef.current.find((item) => item.id === itemId);
      if (!changed) return;
      const updatedItem: SavedItem = { ...changed, ...patch, sync_status: 'synced' };
      const nextItems = itemsRef.current.map((item) =>
        item.id === itemId ? updatedItem : item
      );
      const changesCustomReminder = Object.prototype.hasOwnProperty.call(patch, 'custom_reminder_at');

      if (changesCustomReminder && updatedItem.custom_reminder_at) {
        const reminderAt = new Date(updatedItem.custom_reminder_at);
        if (Number.isNaN(reminderAt.getTime())) {
          pushError('Failed to set reminder: Pick a valid reminder time.');
          return;
        }

        let scheduledCustomReminder = false;
        try {
          await scheduleItemReminder(updatedItem, reminderAt);
          scheduledCustomReminder = true;
          await persistChangedItems(nextItems, [updatedItem]);
        } catch (error) {
          if (scheduledCustomReminder) {
            await cancelItemReminder(itemId);
          }
          pushError(`Failed to set reminder: ${errorMessage(error)}`);
        }
        return;
      }

      if (changesCustomReminder) {
        try {
          await persistChangedItems(nextItems, [updatedItem]);
          await cancelItemReminder(itemId);
        } catch (error) {
          pushError("Couldn't save — check your connection.");
        }
        return;
      }

      try {
        await persistChangedItems(nextItems, [updatedItem]);
      } catch (err: any) {
        pushError("Couldn't save — check your connection.");
      }
    },
    [persistChangedItems]
  );

  const snoozeItem = useCallback(
    async (itemId: string) => {
      const snoozedUntil = new Date(Date.now() + 86_400_000).toISOString();
      const changed = itemsRef.current.find((item) => item.id === itemId);
      if (!changed) return;
      const updatedItem: SavedItem = {
        ...changed,
        snooze_count: changed.snooze_count + 1,
        snoozed_until: snoozedUntil,
        sync_status: 'synced'
      };
      const nextItems = itemsRef.current.map((item) =>
        item.id === itemId ? updatedItem : item
      );
      try {
        await persistChangedItems(nextItems, [updatedItem]);
        await cancelItemReminder(itemId);
      } catch {
        pushError("Couldn't save — check your connection.");
      }
    },
    [persistChangedItems]
  );

  const clearDone = useCallback(async () => {
    const doneItemIds = itemsRef.current.filter((item) => item.is_done).map((item) => item.id);
    if (isAuthenticated) {
      try {
        await deleteDoneItemsFromSupabase();
        const nextItems = itemsRef.current.filter((item) => !item.is_done);
        commitItems(nextItems);
        await AsyncStorage.setItem('cache:saved_items', JSON.stringify(nextItems));
        await Promise.all(doneItemIds.map(cancelItemReminder));
      } catch {
        // Offline handling: queue deletes
        const nextItems = itemsRef.current.filter((item) => !item.is_done);
        commitItems(nextItems);
        await AsyncStorage.setItem('cache:saved_items', JSON.stringify(nextItems));
        
        const deletesStr = await AsyncStorage.getItem('cache:pending_deletes');
        const deletes = deletesStr ? JSON.parse(deletesStr) : [];
        deletes.push(...doneItemIds);
        await AsyncStorage.setItem('cache:pending_deletes', JSON.stringify(deletes));
        
        await Promise.all(doneItemIds.map(cancelItemReminder));
      }
      return;
    }
    await persistDemoItems(itemsRef.current.filter((item) => !item.is_done));
    await Promise.all(doneItemIds.map(cancelItemReminder));
  }, [commitItems, isAuthenticated, persistDemoItems]);

  const clearAllData = useCallback(async () => {
    if (isAuthenticated) {
      await deleteAllUserDataFromSupabase();
    } else {
      await clearDemoData();
    }
    settingsRef.current = defaultSettings;
    setSettings(defaultSettings);
    commitItems([]);
    await cancelAllItemReminders();
  }, [commitItems, isAuthenticated]);

  const changeCategory = useCallback(
    async (itemId: string, category: Category) => {
      await updateItem(itemId, { category });
    },
    [updateItem]
  );

  const dismissError = useCallback((id: string) => {
    setErrors((current) => current.filter((error) => error.id !== id));
  }, []);

  const checkSharedSaves = useCallback(async () => {
    const queue = await readSharedQueue();
    if (queue.length === 0) return 0;

    let importedCount = 0;
    for (const shared of queue) {
      const result = await saveDraft(
        {
          url: shared.url,
          saveReason: shared.saveReason,
          saveReasonChip: shared.saveReasonChip,
          isImportant: shared.isImportant
        },
        { forceDuplicate: false }
      );
      if (result.status === 'saved' || result.status === 'duplicate') {
        importedCount++;
      }
    }

    if (importedCount > 0) {
      await clearSharedQueue();
    }
    return importedCount;
  }, [saveDraft]);

  const syncNow = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    try {
      await syncOfflineQueue();
      const [remoteItems, remoteSettings] = await Promise.all([loadItemsFromSupabase(), loadSettingsFromSupabase()]);
      const nextSettings = { ...defaultSettings, ...(remoteSettings ?? {}) };
      const normalizedItems = remoteItems.map(normalizeStoredItem);
      
      await Promise.all([
        AsyncStorage.setItem('cache:saved_items', JSON.stringify(normalizedItems)),
        AsyncStorage.setItem('cache:user_settings', JSON.stringify(nextSettings))
      ]);
      
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      commitItems(normalizedItems);
    } catch (err: any) {
      pushError("Couldn't refresh — check your connection.");
    } finally {
      setIsSyncing(false);
    }
  }, [commitItems, isAuthenticated]);

  function pushError(message: string) {
    setErrors((current) => [{ id: createId('err'), message }, ...current].slice(0, 3));
  }

  return {
    items,
    settings,
    isReady,
    isSyncing,
    errors,
    unwatchedCount,
    doneCount,
    saveDraft,
    updateItem,
    markDone,
    markUnwatched,
    deleteItem,
    snoozeItem,
    clearDone,
    clearAllData,
    changeCategory,
    updateSettings,
    dismissError,
    checkSharedSaves,
    syncNow,
    mode
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function isActiveCustomReminder(item: SavedItem): boolean {
  return Boolean(item.custom_reminder_at && new Date(item.custom_reminder_at).getTime() > Date.now());
}

function sortItems(items: SavedItem[]): SavedItem[] {
  return items
    .map(normalizeStoredItem)
    .sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
}

function normalizeStoredItem(item: SavedItem): SavedItem {
  return {
    ...item,
    creator_handle: item.creator_handle ?? null,
    is_important: Boolean(item.is_important),
    sync_status: item.sync_status === 'error' || item.sync_status === 'syncing' || item.sync_status === 'queued'
      ? 'synced'
      : item.sync_status
  };
}

async function hydrateDemoStorage(): Promise<[SavedItem[], UserSettings]> {
  const [localItems, localSettings] = await Promise.all([readItems(), readSettings()]);
  return [localItems.map(normalizeStoredItem), localSettings];
}

async function hydrateFromSupabase(): Promise<[SavedItem[], UserSettings]> {
  const [remoteItems, remoteSettings] = await Promise.all([loadItemsFromSupabase(), loadSettingsFromSupabase()]);
  return [remoteItems.map(normalizeStoredItem), { ...defaultSettings, ...(remoteSettings ?? {}) }];
}
