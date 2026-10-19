import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({webReceivers:vi.fn(),submitWebCreate:vi.fn()}));
vi.mock('./lib/drive',()=>mocks);
import {NewNote} from './NewNote';
describe('minimal Web creation',()=>{
  beforeEach(()=>{localStorage.clear();sessionStorage.clear();mocks.webReceivers.mockResolvedValue({account:'a@test',pcs:[{pcId:'pc1',name:'試験PC'}]});mocks.submitWebCreate.mockReset().mockResolvedValue(undefined);});
  afterEach(cleanup);
  it('keeps input and request ID after lost response; retry uses the identical request',async()=>{
    mocks.submitWebCreate.mockRejectedValueOnce(new Error('通信失敗'));
    const done=vi.fn();render(<NewNote token="token" onDone={done}/>);
    await screen.findByText('試験PC');
    fireEvent.change(screen.getByLabelText('新規付箋の本文'),{target:{value:'試験\n**太字**'}});
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await screen.findByText(/入力は保持/);
    expect((screen.getByLabelText('新規付箋の本文') as HTMLTextAreaElement).value).toBe('試験\n**太字**');
    fireEvent.click(screen.getByRole('button',{name:'同じ内容で再試行'}));
    await waitFor(()=>expect(done).toHaveBeenCalled());
    expect(mocks.submitWebCreate.mock.calls[0][1]).toEqual(mocks.submitWebCreate.mock.calls[1][1]);
    expect(sessionStorage.getItem('shared-create:a@test')).toBeNull();
  });
  it('restores account-scoped drafts and refuses image markup without freezing input',async()=>{
    sessionStorage.setItem('shared-create:a@test',JSON.stringify({body:'![画像](local.png)',target:'pc1',pending:null}));
    render(<NewNote token="token" onDone={vi.fn()}/>);await screen.findByText('試験PC');
    fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText(/画像参照には対応/);
    expect(mocks.submitWebCreate).not.toHaveBeenCalled();expect((screen.getByLabelText('新規付箋の本文') as HTMLTextAreaElement).disabled).toBe(false);
  });
  it('requires a receiver before saving',async()=>{
    mocks.webReceivers.mockResolvedValue({account:'a@test',pcs:[]});render(<NewNote token="token" onDone={vi.fn()}/>);
    await screen.findByText(/受取PCがありません/);expect((screen.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('can recheck receivers after Windows sync while keeping the typed draft',async()=>{
    mocks.webReceivers.mockResolvedValueOnce({account:'a@test',pcs:[]});
    render(<NewNote token="token" onDone={vi.fn()}/>);
    await screen.findByText(/受取PCがありません/);
    fireEvent.change(screen.getByLabelText('新規付箋の本文'),{target:{value:'入力を保持'}});
    fireEvent.click(screen.getByRole('button',{name:'受取PCを再確認'}));
    await screen.findByText('試験PC');
    expect((screen.getByLabelText('新規付箋の本文') as HTMLTextAreaElement).value).toBe('入力を保持');
    fireEvent.change(screen.getByLabelText('受取PC'),{target:{value:'pc1'}});
    expect((screen.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(false);
  });
  it('does not redirect an existing draft to another PC when its receiver disappears',async()=>{
    render(<NewNote token="token" onDone={vi.fn()}/>);
    await screen.findByText('試験PC');
    fireEvent.change(screen.getByLabelText('新規付箋の本文'),{target:{value:'元PC宛の本文'}});
    mocks.webReceivers.mockResolvedValue({account:'a@test',pcs:[{pcId:'pc2',name:'別のPC'}]});
    fireEvent.click(screen.getByRole('button',{name:'受取PCを再確認'}));
    await screen.findByText('別のPC');
    expect((screen.getByLabelText('受取PC') as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('新規付箋の本文') as HTMLTextAreaElement).value).toBe('元PC宛の本文');
  });
  it('restores a durable draft after tab-local storage is lost and keeps its request ID',async()=>{
    const id='33333333-3333-4333-8333-333333333333';
    localStorage.setItem(`shared-create:a@test:${id}`,JSON.stringify({body:'復元する本文',target:'pc1',pending:null,requestId:id}));
    render(<NewNote token="token" onDone={vi.fn()}/>);await screen.findByText('試験PC');
    fireEvent.change(screen.getByLabelText('保存済み下書きから復元'),{target:{value:`shared-create:a@test:${id}`}});
    expect((screen.getByLabelText('新規付箋の本文') as HTMLTextAreaElement).value).toBe('復元する本文');
    fireEvent.click(screen.getByRole('button',{name:'保存'}));await waitFor(()=>expect(mocks.submitWebCreate).toHaveBeenCalled());
    expect(mocks.submitWebCreate.mock.calls[0][1].noteId).toBe(id);
  });
  it('does not overwrite draft A when restoring, editing and sending draft B',async()=>{
    const keyB='shared-create:a@test:44444444-4444-4444-8444-444444444444';
    localStorage.setItem(keyB,JSON.stringify({body:'下書きB',target:'pc1',pending:null,requestId:'44444444-4444-4444-8444-444444444444'}));
    vi.spyOn(window,'confirm').mockReturnValue(true);
    render(<NewNote token="token" onDone={vi.fn()}/>);await screen.findByText('試験PC');
    fireEvent.change(screen.getByLabelText('新規付箋の本文'),{target:{value:'保持する下書きA'}});
    const keyA=Object.keys(localStorage).find(k=>k.startsWith('shared-create:')&&k!==keyB)!;
    fireEvent.change(screen.getByLabelText('保存済み下書きから復元'),{target:{value:keyB}});
    fireEvent.change(screen.getByLabelText('新規付箋の本文'),{target:{value:'Bを変更'}});
    fireEvent.click(screen.getByRole('button',{name:'保存'}));await waitFor(()=>expect(mocks.submitWebCreate).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem(keyA)!).body).toBe('保持する下書きA');
    expect(JSON.parse(localStorage.getItem(keyB)!).body).toBe('下書きB');
    vi.restoreAllMocks();
  });
});
