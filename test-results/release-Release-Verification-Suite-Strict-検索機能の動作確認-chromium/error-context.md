# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]
    - main [ref=e4]:
      - article [ref=e5]:
        - generic [ref=e6]:
          - generic [ref=e7]:
            - generic "完了にする" [ref=e8] [cursor=pointer]: ☐
            - generic [ref=e9]: タスク1
          - generic [ref=e10]:
            - generic "未完了にする" [ref=e11] [cursor=pointer]: ☑
            - generic [ref=e12]: タスク2
          - generic [ref=e14]: これはテスト本文です。
      - generic "ドラッグで移動 / クリックで保存" [ref=e15]
  - alert [ref=e16]
  - generic [ref=e19] [cursor=pointer]:
    - img [ref=e20]
    - generic [ref=e22]: 1 error
    - button "Hide Errors" [ref=e23]:
      - img [ref=e24]
```