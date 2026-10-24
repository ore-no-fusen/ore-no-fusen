import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedNote } from './lib/drive';
import SharedNotesPage from './page';

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  appendWebEdit: vi.fn(),
  revokeWebNote: vi.fn(),
  setWebSharing: vi.fn(),
  downloadSharedImage: vi.fn(),
  loadSharedNotes: vi.fn(),
  renderSecureMermaid: vi.fn(),
}));

vi.mock('@/app/viewer/lib/drive', () => ({ refreshAccessToken: mocks.refreshAccessToken }));
vi.mock('@/app/utils/mermaid', () => ({ renderSecureMermaid: mocks.renderSecureMermaid }));
vi.mock('./lib/drive', () => ({
  clearSharedRecordCache: vi.fn(),
  appendWebEdit: mocks.appendWebEdit,
  revokeWebNote: mocks.revokeWebNote,
  setWebSharing: mocks.setWebSharing,
  downloadSharedImage: mocks.downloadSharedImage,
  loadSharedNotes: mocks.loadSharedNotes,
}));

function sharedNote(markdown: string, title = 'テスト付箋'): SharedNote {
  return {
    scope: { accountSubject: 'test-account', noteId: 'test-note', generation: 1 },
    operation: {
      scope: { accountSubject: 'test-account', noteId: 'test-note', generation: 1 },
      operationId: 'op-base', kind: 'edit', parents: [], payloadHash: 'hash',
      payload: { schemaVersion: 2, title, markdown, images: [], backgroundColor: '#80d8ff', tags: [] },
      resolvedIds: [],
    },
    heads: ['op-base'],
  };
}

async function editCurrentNote() {
  // The note can render while reload() still keeps its controls disabled.
  // A click on that button is ignored; wait for the user-visible ready state.
  await waitFor(() => expect((screen.getByRole('button', { name: '編集' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '編集' }));
  return screen.findByRole('textbox', { name: '付箋本文' });
}

describe('shared note editor', () => {
  it('未送信の既存編集を再表示後に復元する', async () => {
    const first=render(<SharedNotesPage/>);
    await editCurrentNote();
    fireEvent.change(screen.getByRole('textbox',{name:'付箋本文'}),{target:{value:'ページを閉じても残す本文'}});
    first.unmount();
    render(<SharedNotesPage/>);
    await waitFor(()=>expect((screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement).value).toBe('ページを閉じても残す本文'));
    expect(mocks.appendWebEdit).not.toHaveBeenCalled();
  });
  it('下書きの基準版から本文が変わった場合は自動上書きしない', async () => {
    const first=render(<SharedNotesPage/>);
    await editCurrentNote();
    fireEvent.change(screen.getByRole('textbox',{name:'付箋本文'}),{target:{value:'未送信の編集'}});
    first.unmount();
    const newer=sharedNote('別端末の本文');newer.operation.operationId='op-newer';
    mocks.loadSharedNotes.mockResolvedValue({notes:[newer],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('textbox',{name:'付箋本文'});
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await screen.findByText(/別の端末で本文が変わっています/);
    expect(mocks.appendWebEdit).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement).value).toBe('未送信の編集');
  });
  it('Windows同期待ちの保存済み付箋は本文を表示し、未取込の編集・共有操作を送信しない', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [{ ...sharedNote('同期待ちの本文\n- [ ] 確認', '新規保存済み'), pendingCreate: true }], files: [] });
    render(<SharedNotesPage/>);
    await screen.findByRole('heading', { name: '新規保存済み' });
    expect(await screen.findByText('同期待ちの本文')).toBeTruthy();
    expect(screen.getByText('Windows同期待ち')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull();
    expect((screen.getByRole('checkbox', { name: '確認' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.appendWebEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Web共有を停止' })).toBeNull();
  });
  it('チェックは直ちに反応し、保存中を示し、通信失敗なら元へ戻す', async () => {
    let rejectSave!: (reason: Error) => void;
    mocks.appendWebEdit.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
    render(<SharedNotesPage/>);
    const checkbox = await screen.findByRole('checkbox',{name:'牛乳'});
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('article').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('チェックの変更を保存しています…')).toBeTruthy();
    rejectSave(new Error('通信失敗'));
    await screen.findByText(/Webを更新して保存結果を確認/);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect((checkbox as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/チェックを保存しました/)).toBeNull();
  });
  it('閲覧中のクリックだけでチェックを保存し、本文・色・画像を保つ', async () => {
    const note = sharedNote('本文\n- [ ] 牛乳\n- [x] 卵');
    mocks.loadSharedNotes.mockResolvedValueOnce({notes:[note],files:[]})
      .mockResolvedValue({notes:[{...note,operation:{...note.operation,operationId:'op-next',payload:{...note.operation.payload,markdown:'本文\n- [x] 牛乳\n- [x] 卵'}}}],files:[]});
    render(<SharedNotesPage/>);
    fireEvent.click(await screen.findByRole('checkbox',{name:'牛乳'}));
    await screen.findByText(/チェックを保存しました/);
    expect(mocks.appendWebEdit).toHaveBeenCalledTimes(1);
    expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',note,{...note.operation.payload,markdown:'本文\n- [x] 牛乳\n- [x] 卵'});
    await waitFor(()=>expect(screen.getByRole('checkbox',{name:'牛乳'}).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByRole('button',{name:'編集'})).toBeTruthy();
  });

  it('チェック保存中の連打を防ぎ、失敗時は元表示と理由を残す', async () => {
    let reject!: (error: Error) => void;
    mocks.appendWebEdit.mockImplementation(()=>new Promise((_resolve,fail)=>{reject=fail;}));
    render(<SharedNotesPage/>);
    const task=await screen.findByRole('checkbox',{name:'牛乳'});
    fireEvent.click(task);fireEvent.click(task);
    expect((task as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.appendWebEdit).toHaveBeenCalledTimes(1);
    reject(new Error('別の端末で変更されています'));
    await screen.findByText(/別の端末で変更されています/);
    expect(task.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText(/チェックを保存しました/)).toBeNull();
  });

  it('保存後の読込失敗を成功と表示しない', async () => {
    mocks.loadSharedNotes.mockResolvedValueOnce({notes:[sharedNote('- [ ] 牛乳')],files:[]}).mockRejectedValue(new Error('読込失敗'));
    render(<SharedNotesPage/>);
    fireEvent.click(await screen.findByRole('checkbox',{name:'牛乳'}));
    await screen.findByText(/Webを更新して保存結果を確認/);
    expect(screen.getByRole('checkbox',{name:'牛乳'}).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText(/チェックを保存しました/)).toBeNull();
  });
  it('詳細操作の共有停止はランチャーを残す確認後だけ保存する', async () => {
    render(<SharedNotesPage />);await screen.findByText('1件の付箋を読み込みました。');
    fireEvent.click(screen.getByText('詳細操作'));
    fireEvent.click(screen.getByRole('button',{name:'Web共有を停止'}));
    await screen.findByText(/Windowsの付箋とランチャー登録は変わりません/);
    expect(mocks.setWebSharing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'戻る'}));
    expect(mocks.setWebSharing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Web共有を停止'}));
    fireEvent.click(screen.getByRole('button',{name:'停止する'}));
    await waitFor(()=>expect(mocks.setWebSharing).toHaveBeenCalledWith('test-token',expect.objectContaining({scope:expect.objectContaining({noteId:'test-note'})}),true));
    expect(mocks.revokeWebNote).not.toHaveBeenCalled();
  });
  it('停止中の一覧から明示的に再開でき、停止中のチェックは保存しない', async () => {
    const note = {...sharedNote('- [ ] 牛乳'), paused:true, sharingHeads:['pause-1']};
    mocks.loadSharedNotes.mockResolvedValue({notes:[], stoppedNotes:[note],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByText(/まだ付箋がありません/);
    fireEvent.click(screen.getByText('詳細操作'));
    fireEvent.click(screen.getByRole('button',{name:'共有停止中の付箋（1）'}));
    const task = await screen.findByRole('checkbox',{name:'牛乳'});
    expect((task as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(task);
    expect(mocks.appendWebEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Web共有を再開'}));
    fireEvent.click(screen.getByRole('button',{name:'再開する'}));
    await waitFor(()=>expect(mocks.setWebSharing).toHaveBeenCalledWith('test-token',note,false));
  });
  it('共有停止保存後の再取得失敗を成功と表示しない', async () => {
    mocks.loadSharedNotes.mockResolvedValueOnce({notes:[sharedNote('本文')],files:[]}).mockRejectedValue(new Error('再取得失敗'));
    render(<SharedNotesPage/>);
    await screen.findByRole('button',{name:'編集'});
    fireEvent.click(screen.getByText('詳細操作'));
    fireEvent.click(screen.getByRole('button',{name:'Web共有を停止'}));
    fireEvent.click(screen.getByRole('button',{name:'停止する'}));
    await screen.findByText(/共有設定の保存後に再取得できませんでした/);
    expect(screen.queryByText(/Web共有を停止しました/)).toBeNull();
  });
  afterEach(() => cleanup());

  beforeEach(() => {
    localStorage.clear();sessionStorage.clear();
    localStorage.setItem('viewer_access_token', 'test-token');
    localStorage.setItem('viewer_expires_at', '0');
    mocks.refreshAccessToken.mockReset();
    mocks.appendWebEdit.mockReset().mockResolvedValue(undefined);
    mocks.setWebSharing.mockReset().mockResolvedValue(undefined);
    mocks.downloadSharedImage.mockReset();
    mocks.loadSharedNotes.mockReset().mockResolvedValue({ notes: [sharedNote('買い物メモ\n牛乳を買う\n- [ ] 牛乳')], files: [] });
    mocks.renderSecureMermaid.mockReset().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><text>図</text></svg>');
  });

  it('uses the Windows note color in the detail card and preserves it when saving text', async () => {
    render(<SharedNotesPage />);
    await screen.findByText('1件の付箋を読み込みました。');
    expect((screen.getByRole('article') as HTMLElement).style.backgroundColor).toBe('rgb(128, 216, 255)');
  });

  it('Windows付箋の複数画像を本文の順に表示し、画面幅に合わせて縮小する', async () => {
    const firstHash = 'a'.repeat(64);
    const secondHash = 'b'.repeat(64);
    const note = sharedNote(`前の説明 ![1枚目](ore-fusen-image://img-${firstHash}) 中間の説明 ![2枚目](ore-fusen-image://img-${secondHash}) 後ろの説明`);
    note.operation.payload.images = [
      { imageId: `img-${firstHash}`, mimeType: 'image/png', sizeBytes: 10, sha256: firstHash },
      { imageId: `img-${secondHash}`, mimeType: 'image/jpeg', sizeBytes: 20, sha256: secondHash },
    ];
    mocks.loadSharedNotes.mockResolvedValue({ notes: [note], files: [
      { id: 'file-1', name: `image-${firstHash}` }, { id: 'file-2', name: `image-${secondHash}` },
    ] });
    mocks.downloadSharedImage.mockImplementation(async (_token: string, _files: unknown[], manifest: { imageId: string }) =>
      `blob:${manifest.imageId}`);

    render(<SharedNotesPage />);
    await screen.findByText('1件の付箋を読み込みました。');
    const images = await screen.findAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images.map((image) => (image as HTMLImageElement).src)).toEqual([
      `blob:img-${firstHash}`, `blob:img-${secondHash}`,
    ]);
    for (const image of images) {
      expect((image as HTMLImageElement).style.maxWidth).toBe('100%');
      expect((image as HTMLImageElement).style.height).toBe('auto');
    }
    const articleText = screen.getByRole('article').textContent ?? '';
    expect(articleText).toContain('前の説明');
    expect(articleText).toContain('中間の説明');
    expect(articleText).toContain('後ろの説明');
    expect(mocks.downloadSharedImage).toHaveBeenCalledTimes(2);
  });

  it("Windowsと同じチェック記号と完了線を表示し、編集時だけ切り替えられる（一つの本文欄）", async () => {
    const original="- [ ] 牛乳\n- [x] 卵";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"- [x] 牛乳\n- [x] 卵"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"- [x] 牛乳\n- [x] 卵",backgroundColor:'#80d8ff',images:[]})));
  });

  it('空行と段落を保ち、空白のない長文もカード幅で折り返せる', async () => {
    const longLine = '折り返し確認'.repeat(80);
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote(`一行目\n二行目\n\n四行目\n${longLine}`, '改行確認')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText(longLine);

    const article = screen.getByRole('article');
    const paragraphs = [...article.querySelectorAll('p')].map((paragraph) => paragraph.textContent);
    expect(paragraphs).toEqual(['一行目', '二行目', '', '四行目', longLine]);
    expect(article.style.overflowWrap).toBe('anywhere');
    expect((screen.getByText(longLine) as HTMLElement).style.whiteSpace).toBe('pre-wrap');
  });

  it("編集時も題名を二重表示せず、元のMarkdownと空行を保って保存する（一つの本文欄）", async () => {
    const original="思い出プロンプト\n\n説明の一行目\n\n説明の二行目";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"思い出プロンプト\n\n説明の一行目\n\n説明の二行目"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"思い出プロンプト\n\n説明の一行目\n\n説明の二行目",backgroundColor:'#80d8ff',images:[]})));
  });

  it('Windowsと同じ赤い太字を表示し、コード内とエスケープされた記号は強調しない', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote('通常 **重要** / `**コード**` / \\**記号のまま**\n```md\n**コードブロック**\n- [ ] これはコード\n```', '強調')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('1件の付箋を読み込みました。');

    const article = screen.getByRole('article');
    await screen.findByText('重要', { selector: 'strong' });
    const strong = article.querySelectorAll('strong');
    expect(strong).toHaveLength(1);
    expect(strong[0].textContent).toBe('重要');
    expect((strong[0] as HTMLElement).style.color).toBe('red');
    expect(article.textContent).toContain('`**コード**`');
    expect(article.textContent).toContain('\\**記号のまま**');
    expect(article.textContent).toContain('**コードブロック**');
    expect(screen.queryByRole('checkbox', { name: 'これはコード' })).toBeNull();
  });

  it('見出し6段階と箇条書き・番号付き項目を構造表示し、保存Markdownを変えない', async () => {
    const markdown = '# 大見出し\n## 小見出し **強調**\n### 見出し3\n#### 見出し4\n##### 見出し5\n###### 見出し6\n- 箇条書き\n* 別の箇条書き\n+ **強調付き**\n1. 順序1\n2) 順序2';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote(markdown, '構造表示')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByRole('heading', { name: '大見出し' });
    expect(screen.getByRole('heading', { name: '小見出し 強調', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '見出し3', level: 3 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '見出し4', level: 4 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '見出し5', level: 5 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '見出し6', level: 6 })).toBeTruthy();
    expect(screen.getByText('箇条書き')).toBeTruthy();
    expect(screen.getByText('別の箇条書き')).toBeTruthy();
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('2)')).toBeTruthy();

    await editCurrentNote();
    const body = await screen.findByRole('textbox', { name: '付箋本文' }) as HTMLTextAreaElement;
    expect(body.value).toBe(markdown);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(mocks.appendWebEdit).toHaveBeenCalledWith(
      'test-token', expect.anything(), expect.objectContaining({ markdown }),
    ));
  });

  it('画像入り見出し・箇条書きもMarkdown構造を保ち、番号付き項目の番号を読める', async () => {
    const hash = 'd'.repeat(64);
    const imageRef = `![写真](ore-fusen-image://img-${hash})`;
    const note = sharedNote(`## 写真の見出し ${imageRef}\n- 写真の箇条書き ${imageRef}\n1. 番号付き写真 ${imageRef}`, '画像と構造');
    note.operation.payload.images = [{ imageId: `img-${hash}`, mimeType: 'image/png', sizeBytes: 10, sha256: hash }];
    mocks.loadSharedNotes.mockResolvedValue({ notes: [note], files: [{ id: 'image-file', name: `image-${hash}` }] });
    mocks.downloadSharedImage.mockResolvedValue('blob:structured-image');
    render(<SharedNotesPage />);
    await screen.findByRole('heading', { name: '写真の見出し 写真', level: 2 });
    expect(screen.getAllByRole('img', { name: '写真' })).toHaveLength(3);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const listItems = screen.getAllByRole('listitem');
    expect(listItems[1].textContent).toContain('1.');
    expect(listItems[1].querySelector('span')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('Mermaid図を複数表示し、スマホ用横スクロールを付ける', async () => {
    const first = 'graph TD\n A-->B';
    const second = 'sequenceDiagram\n A->>B: hello';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote(`\`\`\`mermaid\n${first}\n\`\`\`\n説明\n\`\`\`mermaid\n${second}\n\`\`\``, '図')], files: [] });
    render(<SharedNotesPage />);
    const diagrams = await screen.findAllByRole('img', { name: 'Mermaid図' });
    expect(diagrams).toHaveLength(2);
    expect((diagrams[0] as HTMLElement).style.overflowX).toBe('auto');
    expect(mocks.renderSecureMermaid).toHaveBeenCalledTimes(2);
    expect(mocks.renderSecureMermaid).toHaveBeenCalledWith(expect.any(String), first);
    expect(mocks.renderSecureMermaid).toHaveBeenCalledWith(expect.any(String), second);
    expect(mocks.renderSecureMermaid.mock.calls[0][0]).not.toBe(mocks.renderSecureMermaid.mock.calls[1][0]);
  });

  it('連続する箇条書きは1つのリストとして読み上げる', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote('- りんご\n- みかん\n- ぶどう\n\n1. 買う\n2. 食べる', 'リスト')], files: [] });
    render(<SharedNotesPage />);
    const lists = await screen.findAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(lists[0].querySelectorAll('[role="listitem"]')).toHaveLength(3);
    expect(lists[1].querySelectorAll('[role="listitem"]')).toHaveLength(2);
  });

  it('通常の箇条書きとチェック項目が隣接しても欠落・重複しない', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote('- [ ] 牛乳\n- 説明\n- [x] 卵\n- [ ] パン\n- 店で買う', '混在リスト')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByRole('checkbox', { name: '牛乳' });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['•説明', '•店で買う']);
    expect(screen.getAllByRole('checkbox').map((checkbox) => checkbox.getAttribute('aria-label'))).toEqual(['牛乳', '卵', 'パン']);
  });

  it('http/httpsだけをリンクにし、危険なURLは文字として表示する', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote('[安全](https://example.com/path) [危険](javascript:alert(1)) [ローカル](file:///C:/secret.txt) **強調** `**コード**`', 'リンク')], files: [] });
    render(<SharedNotesPage />);
    const link = await screen.findByRole('link', { name: '安全' });
    expect(link.getAttribute('href')).toBe('https://example.com/path');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('link', { name: '危険' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'ローカル' })).toBeNull();
    expect(screen.getByText('強調').tagName).toBe('STRONG');
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.includes('`**コード**`') === true)).toBeTruthy();
  });

  it('コードフェンスをコード枠で表示し、中のリンクや画像を実行しない', async () => {
    const code = '```text\n[リンク](https://example.com) ![画像](ore-fusen-image://img-' + 'a'.repeat(64) + ')\n```';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote(code, 'コード表示')], files: [] });
    render(<SharedNotesPage />);
    const pre = await screen.findByText((_, element) => element?.tagName === 'CODE' && element.textContent?.includes('[リンク]') === true);
    expect(pre.closest('pre')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'リンク' })).toBeNull();
    expect(screen.queryByRole('img', { name: '画像' })).toBeNull();
  });

  it('Mermaidは閉じたフェンスだけ図にし、コードフェンス行は削らない', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote('````text\n行1\n```\n~~~~mermaid\nノード\n~~~~', 'コード')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText((_, element) => element?.tagName === 'CODE' && element.textContent?.startsWith('行1\n```') === true);
    expect(mocks.renderSecureMermaid).not.toHaveBeenCalled();
    expect(screen.getByText((_, element) => element?.tagName === 'CODE' && element.textContent?.includes('ノード') === true)).toBeTruthy();
  });

  it('Mermaid描画が失敗したときは危険なSVGを出さず元コードへ戻す', async () => {
    const source = 'graph TD\n A-->B';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote(`\`\`\`mermaid\n${source}\n\`\`\``, '図失敗')], files: [] });
    mocks.renderSecureMermaid.mockRejectedValue(new Error('bad diagram'));
    render(<SharedNotesPage />);
    const fallback = await screen.findByText('図を表示できません。図のコードを表示します。');
    expect(fallback.parentElement?.querySelector('pre code')?.textContent).toBe(source);
    expect(screen.queryByRole('img', { name: 'Mermaid図' })).toBeNull();
  });

  it('チェック項目と画像前後の太字を描画し、コード内の画像・チェックを実行表示しない', async () => {
    const hash = 'c'.repeat(64);
    const imageRef = `![図](ore-fusen-image://img-${hash})`;
    const note = sharedNote(`- [ ] **強調チェック** ${imageRef}\n前 **強調前** ${imageRef} 後 **強調後**\n\`${imageRef}\`\n\`\`\`md\n- [ ] **コード中** ${imageRef}\n\`\`\``, '混在');
    note.operation.payload.images = [{ imageId: `img-${hash}`, mimeType: 'image/png', sizeBytes: 10, sha256: hash }];
    mocks.loadSharedNotes.mockResolvedValue({ notes: [note], files: [{ id: 'image-file', name: `image-${hash}` }], });
    mocks.downloadSharedImage.mockResolvedValue('blob:test-image');

    render(<SharedNotesPage />);
    await screen.findByText('強調後', { selector: 'strong', exact: true });
    await screen.findAllByRole('img', { name: '図' });
    expect(screen.getByText('強調チェック', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('強調前', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('強調後', { selector: 'strong' })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: '図' })).toHaveLength(2);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: /コード中/ })).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByRole('article').textContent).toContain(`\`${imageRef}\``);
  });

  it("チェック項目入力の $&, $1, $$ を文字どおり保存する（一つの本文欄）", async () => {
    const original="- [ ] 元の項目";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"- [ ] $& / $1 / $$"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"- [ ] $& / $1 / $$",backgroundColor:'#80d8ff',images:[]})));
  });

  it("コードフェンスを複数行の独立欄として編集し、前後の本文を重複させず保存する（一つの本文欄）", async () => {
    const original="前の本文\n```md\n- [ ] コード中の見本\n```\n後の本文";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"前の本文\n```md\n- [ ] コード中の見本\n追加行\nさらに追加\n```\n後の本文"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"前の本文\n```md\n- [ ] コード中の見本\n追加行\nさらに追加\n```\n後の本文",backgroundColor:'#80d8ff',images:[]})));
  });

  it("編集中にコードフェンス記号を変えても同じ入力欄で続けて編集できる（一つの本文欄）", async () => {
    const original="```md\n例\n```\n本文";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"``mdx\n例を更新\n```\n本文"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"``mdx\n例を更新\n```\n本文",backgroundColor:'#80d8ff',images:[]})));
  });

  it('Quick Launcher風の検索で題名と本文を絞り込み、Driveを再読込しない', async () => {
    const shopping = sharedNote('牛乳を買う');
    shopping.operation.operationId = 'op-shopping';
    shopping.scope.noteId = 'note-shopping';
    shopping.operation.scope.noteId = 'note-shopping';
    const trip = sharedNote('旅行にパンを持っていく', '旅行');
    trip.operation.operationId = 'op-trip';
    trip.scope.noteId = 'note-trip';
    trip.operation.scope.noteId = 'note-trip';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [shopping, trip], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('2件の付箋を読み込みました。');

    const search = screen.getByRole('searchbox', { name: '付箋を検索' });
    fireEvent.change(search, { target: { value: '旅行' } });
    expect(await screen.findByRole('heading', { name: '旅行' })).toBeTruthy();
    expect(screen.getByText('1 / 2 件')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /テスト付箋/ })).toBeNull();
    expect(mocks.loadSharedNotes).toHaveBeenCalledTimes(1);

    fireEvent.change(search, { target: { value: 'パン' } });
    expect(await screen.findByRole('heading', { name: '旅行' })).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(await screen.findByText('2 / 2 件')).toBeTruthy();
    expect(screen.getByRole('button', { name: /テスト付箋/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /旅行/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '旅行' })).toBeTruthy();

    fireEvent.change(search, { target: { value: '該当なし' } });
    expect(await screen.findByText('一致する付箋がありません。')).toBeTruthy();
  });

  it('Windowsから届いたタグで一覧を絞り、すべてに戻せる', async () => {
    const shopping = sharedNote('牛乳を買う', '買い物付箋');
    shopping.operation.operationId = 'op-tag-shopping';
    shopping.operation.payload.tags = ['買い物'];
    shopping.scope.noteId = 'note-tag-shopping';
    shopping.operation.scope.noteId = 'note-tag-shopping';
    const home = sharedNote('掃除をする', '家の用事');
    home.operation.operationId = 'op-tag-home';
    home.operation.payload.tags = ['家'];
    home.scope.noteId = 'note-tag-home';
    home.operation.scope.noteId = 'note-tag-home';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [shopping, home], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('2件の付箋を読み込みました。');

    const filters = screen.getByRole('group', { name: 'タグで絞り込み' });
    fireEvent.click(screen.getByRole('button', { name: '家', pressed: false }));
    expect(await screen.findByRole('heading', { name: '家の用事' })).toBeTruthy();
    expect(screen.getByText('1 / 2 件')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /買い物付箋/ })).toBeNull();
    expect(mocks.loadSharedNotes).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'すべて', pressed: false }));
    expect(await screen.findByText('2 / 2 件')).toBeTruthy();
    expect(screen.getByRole('button', { name: /買い物付箋/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /家の用事/ })).toBeTruthy();
    expect(filters).toBeTruthy();
  });

  it('タグ切替で未保存編集を失わない', async () => {
    const first = sharedNote('本文1', '付箋1');
    first.operation.payload.tags = ['家'];
    const second = sharedNote('本文2', '付箋2');
    second.operation.payload.tags = ['買い物'];
    second.operation.operationId = 'op-second';
    second.scope.noteId = 'note-second';
    second.operation.scope.noteId = 'note-second';
    mocks.loadSharedNotes.mockResolvedValue({ notes: [first, second], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('2件の付箋を読み込みました。');
    await editCurrentNote();
    const all = screen.getByRole('button', { name: 'すべて', pressed: true });
    const home = screen.getByRole('button', { name: '家', pressed: false });
    expect((all as HTMLButtonElement).disabled).toBe(true);
    expect((home as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: '付箋本文' }) as HTMLTextAreaElement).value).toBe('本文1');
  });

  it('Windows側で選択中のタグがなくなった後もすべての付箋へ戻れる', async () => {
    const tagged = sharedNote('家の本文', '家の付箋');
    tagged.operation.payload.tags = ['家'];
    mocks.loadSharedNotes
      .mockResolvedValueOnce({ notes: [tagged], files: [] })
      .mockResolvedValueOnce({ notes: [sharedNote('タグなし本文', 'タグなし')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('1件の付箋を読み込みました。');
    fireEvent.click(screen.getByRole('button', { name: '家', pressed: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Webを更新' }));
    expect(await screen.findByRole('heading', { name: 'タグなし' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'すべて', pressed: true })).toBeTruthy();
    expect(screen.getByText('1 / 1 件')).toBeTruthy();
  });

  it('更新でタグの大文字小文字だけ変わっても選択中と分かる', async () => {
    const original = sharedNote('本文', '仕事');
    original.operation.payload.tags = ['Work'];
    const updated = sharedNote('本文', '仕事');
    updated.operation.payload.tags = ['work'];
    updated.operation.operationId = 'op-updated';
    mocks.loadSharedNotes
      .mockResolvedValueOnce({ notes: [original], files: [] })
      .mockResolvedValueOnce({ notes: [updated], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('1件の付箋を読み込みました。');
    fireEvent.click(screen.getByRole('button', { name: 'Work', pressed: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Webを更新' }));
    expect(await screen.findByRole('button', { name: 'work', pressed: true })).toBeTruthy();
  });

  it("edits ordinary note text in one multiline field and preserves line breaks on save（一つの本文欄）", async () => {
    const original="買い物メモ\n牛乳を買う\n- [ ] 牛乳";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"買い物メモ\n牛乳を買う\n卵を買う\n- [ ] 牛乳"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"買い物メモ\n牛乳を買う\n卵を買う\n- [ ] 牛乳",backgroundColor:'#80d8ff',images:[]})));
  });

  it("shows a title copied to the first body line once and preserves the full edit on save（一つの本文欄）", async () => {
    const original="\nWeb下りテスト\n\nあいうえお\nWeb下りテスト\n- [ ] 牛乳";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"\nWeb下りテスト\n\nあいうえお\nWeb下りテスト\n追記\n- [x] 牛乳\n- [x] 新しい項目"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"\nWeb下りテスト\n\nあいうえお\nWeb下りテスト\n追記\n- [x] 牛乳\n- [x] 新しい項目",backgroundColor:'#80d8ff',images:[]})));
  });

  it('keeps the editor mounted when body text becomes equal to the title', async () => {
    mocks.loadSharedNotes.mockResolvedValue({ notes: [sharedNote('最初の本文', '題名')], files: [] });
    render(<SharedNotesPage />);
    await screen.findByText('1件の付箋を読み込みました。');
    await editCurrentNote();
    const body = await screen.findByRole('textbox', { name: '付箋本文' }) as HTMLTextAreaElement;

    fireEvent.change(body, { target: { value: '題名' } });
    const stillMounted = screen.getByRole('textbox', { name: '付箋本文' }) as HTMLTextAreaElement;
    expect(stillMounted.value).toBe('題名');
    fireEvent.change(stillMounted, { target: { value: '題名\n続き' } });
    expect((screen.getByRole('textbox', { name: '付箋本文' }) as HTMLTextAreaElement).value).toBe('題名\n続き');
  });

  it("lets a title-only note gain body text without duplicating or deleting its original title line（一つの本文欄）", async () => {
    const original="買い物";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"買い物\n牛乳を買う"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"買い物\n牛乳を買う",backgroundColor:'#80d8ff',images:[]})));
  });

  it("preserves a duplicated title and checklist when no optional body is added（一つの本文欄）", async () => {
    const original="買い物\n- [ ] 牛乳";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"買い物\n- [ ] 牛乳"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"買い物\n- [ ] 牛乳",backgroundColor:'#80d8ff',images:[]})));
  });

  it("does not hide a checklist when editing removes a duplicated title after a leading blank（一つの本文欄）", async () => {
    const original="\n題名\n- [ ] 牛乳";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"メモ\n- [ ] 牛乳"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"メモ\n- [ ] 牛乳",backgroundColor:'#80d8ff',images:[]})));
  });

  it("keeps a text area stable while a user types a checklist line（一つの本文欄）", async () => {
    const original="メモ";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"メモ\n- [ ] 牛乳"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"メモ\n- [ ] 牛乳",backgroundColor:'#80d8ff',images:[]})));
  });

  it("adds a real checklist item while keeping the body as free-form text（一つの本文欄）", async () => {
    const original="自由な文章";
    mocks.loadSharedNotes.mockResolvedValue({notes:[sharedNote(original,'試験題名')],files:[]});
    render(<SharedNotesPage/>);
    await screen.findByRole('article');
    await editCurrentNote();
    const body=screen.getByRole('textbox',{name:'付箋本文'}) as HTMLTextAreaElement;
    expect(body.value).toBe(original);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'＋ チェック項目を追加'})).toBeNull();
    fireEvent.change(body,{target:{value:"自由な文章\n- [ ] 新しい項目"}});
    fireEvent.blur(body);
    expect(screen.getByRole('textbox',{name:'付箋本文'})).toBe(body);
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await waitFor(()=>expect(mocks.appendWebEdit).toHaveBeenCalledWith('test-token',expect.anything(),expect.objectContaining({markdown:"自由な文章\n- [ ] 新しい項目",backgroundColor:'#80d8ff',images:[]})));
  });

});

