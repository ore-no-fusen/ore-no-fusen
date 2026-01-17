# Page snapshot

```yaml
- dialog "Unhandled Runtime Error" [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - navigation [ref=e8]:
          - button "previous" [disabled] [ref=e9]:
            - img "previous" [ref=e10]
          - button "next" [disabled] [ref=e12]:
            - img "next" [ref=e13]
          - generic [ref=e15]: 1 of 1 error
          - generic [ref=e16]:
            - text: Next.js (14.2.35) is outdated
            - link "(learn more)" [ref=e18] [cursor=pointer]:
              - /url: https://nextjs.org/docs/messages/version-staleness
        - button "Close" [ref=e19] [cursor=pointer]:
          - img [ref=e21]
      - heading "Unhandled Runtime Error" [level=1] [ref=e24]
      - paragraph [ref=e25]: "TypeError: Cannot read properties of undefined (reading 'label')"
    - generic [ref=e26]:
      - heading "Source" [level=2] [ref=e27]
      - generic [ref=e28]:
        - link "app\\page.tsx (428:33) @ getCurrentWindow" [ref=e30] [cursor=pointer]:
          - generic [ref=e31]: app\page.tsx (428:33) @ getCurrentWindow
          - img [ref=e32]
        - generic [ref=e36]: 426 | 427 | // デバッグ：起動時ウィンドウ情報 > 428 | const win = getCurrentWindow(); | ^ 429 | console.log('[BOOT] label=', win.label, 'pathParam=', !!searchParams.get('path')); 430 | 431 | // pathパラメータが無い場合（管理画面/初回起動ルート）は必ずcheckSetupを実行
      - heading "Call Stack" [level=2] [ref=e37]
      - button "Show collapsed frames" [ref=e38] [cursor=pointer]
```