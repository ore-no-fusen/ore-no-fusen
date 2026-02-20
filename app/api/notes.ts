/**
 * ノート操作API (Tauri Wrapper)
 *
 * 責務:
 * - ノートのCRUD操作（読み込み、保存、アーカイブ、削除）
 * - バックエンド(Rust)コマンドの型安全な呼び出し
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * ノートメタデータの型定義
 */
export type NoteMeta = {
    path: string;
    seq: number;
    context: string;
    updated: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    background_color?: string;
    always_on_top?: boolean;
    folded?: boolean;
    tags?: string[];
};

/**
 * ノートデータの型定義
 */
export type Note = {
    body: string;
    frontmatter: any;
    meta: NoteMeta;
};

/**
 * ノートファイルを読み込む
 *
 * @param path - ノートファイルのパス
 * @returns ノートデータ
 */
export async function readNote(path: string): Promise<Note> {
    return await invoke<Note>('fusen_read_note', { path });
}

/**
 * ノートを保存する（リネーム対応）
 *
 * @param path - 現在のノートファイルパス
 * @param body - ノート本文
 * @param frontmatterRaw - YAMLフロントマター文字列
 * @param allowRename - リネームを許可するか（1行目の変更時）
 * @returns 保存後のファイルパス（リネームされた場合は新パス）
 */
export async function saveNote(
    path: string,
    body: string,
    frontmatterRaw: string,
    allowRename: boolean
): Promise<string> {
    return await invoke<string>('fusen_save_note', {
        path,
        body,
        frontmatterRaw,
        allowRename
    });
}

/**
 * ノートをアーカイブする
 *
 * @param path - ノートファイルのパス
 */
export async function archiveNote(path: string): Promise<void> {
    await invoke('fusen_archive_note', { path });
}

/**
 * ノートをゴミ箱に移動する
 *
 * @param path - ノートファイルのパス
 */
export async function moveToTrash(path: string): Promise<void> {
    await invoke('fusen_move_to_trash', { path });
}

/**
 * ノートの保存先フォルダを開く
 *
 * @param path - ノートファイルのパス
 */
export async function openContainingFolder(path: string): Promise<void> {
    await invoke('fusen_open_containing_folder', { path });
}

/**
 * ファイルまたはURLを外部アプリで開く
 *
 * @param path - ファイルパスまたはURL
 */
export async function openFile(path: string): Promise<void> {
    await invoke('fusen_open_file', { path });
}
