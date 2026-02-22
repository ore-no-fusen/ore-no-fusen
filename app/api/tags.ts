/**
 * タグ操作API (Tauri Wrapper)
 *
 * 責務:
 * - タグ一覧の取得と管理
 * - ノートへのタグ追加・削除
 * - グローバルタグ削除機能
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * 全てのタグを取得する
 *
 * @returns タグの配列
 */
export async function getAllTags(): Promise<string[]> {
    return await invoke<string[]>('fusen_get_all_tags');
}

/**
 * ノートにタグを追加する
 *
 * @param path - ノートファイルのパス
 * @param tag - 追加するタグ
 */
export async function addTag(path: string, tag: string): Promise<void> {
    await invoke('fusen_add_tag', { path, tag });
}

/**
 * ノートからタグを削除する
 *
 * @param path - ノートファイルのパス
 * @param tag - 削除するタグ
 */
export async function removeTag(path: string, tag: string): Promise<void> {
    await invoke('fusen_remove_tag', { path, tag });
}

/**
 * タグを全ノートから削除する（グローバル削除）
 *
 * @param tag - 削除するタグ
 * @returns 削除されたノート数
 */
export async function deleteTagGlobally(tag: string): Promise<number> {
    return await invoke<number>('fusen_delete_tag_globally', { tag });
}
