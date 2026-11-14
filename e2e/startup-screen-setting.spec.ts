import {expect,test} from '@playwright/test';
import {mockTauriAPI} from './mock-tauri';

for(const language of ['ja','en'] as const) {
  test(`一般⑧で起動画面をオフに保存し、再表示後も保持する (${language})`,async({page},info)=>{
    await mockTauriAPI(page,{language});await page.goto('/');
    await expect.poll(()=>page.evaluate(()=>(window as any).__MOCK_HAS_LISTENER__?.('fusen:open_settings')??false)).toBe(true);
    await page.evaluate(()=>(window as any).__MOCK_EMIT__('fusen:open_settings',{tab:'general'}));
    const title=language==='ja'?'起動中の画面を表示する':'Show startup screen';
    const card=page.locator('details').filter({has:page.locator('summary').filter({hasText:title})});
    await expect(card.locator('summary')).toContainText('8');await card.locator('summary').click();
    const toggle=card.getByRole('switch',{name:title});await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();
    await page.screenshot({path:info.outputPath(`startup-screen-setting-${language}.png`)});
    await page.getByRole('button',{name:language==='ja'?'設定完了':'Save Settings',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mock-hotkeys')??'{}').show_startup_screen)).toBe(false);
    await page.reload();await expect.poll(()=>page.evaluate(()=>(window as any).__MOCK_HAS_LISTENER__?.('fusen:open_settings')??false)).toBe(true);
    await page.evaluate(()=>(window as any).__MOCK_EMIT__('fusen:open_settings',{tab:'general'}));
    await card.locator('summary').click();await expect(toggle).not.toBeChecked();
  });
}

test('起動画面オフでも状態同期失敗の案内を表示する',async({page})=>{
  await mockTauriAPI(page,{settings:{show_startup_screen:false},startupStateFailure:true});
  await page.goto('/');await expect(page.getByText('同期に失敗しました',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__MOCK_IPC_CALLS__.includes('plugin:window|show'))).toBe(true);
});
