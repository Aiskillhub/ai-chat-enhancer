# AI Chat Enhancer — Chrome Extension 矩阵

一个代码库生成多个 Chrome 扩展变体。Manifest V3，纯原生 JS，Payhip Pro $5/月。

## 项目位置

| 目录 | 平台 | 状态 |
|------|------|------|
| `/Users/liao/ai-chat-enhancer/` | ChatGPT / Claude / DeepSeek 通用 | 已发布 |

## 核心文件

```
├── manifest.json    # 覆盖 6 平台
├── content.js       # 主逻辑：侧边栏 UI + 4 功能标签
├── content.css      # 深色主题，紫色渐变
├── background.js    # Service Worker：模板、用量限制、激活
├── popup.html/js    # 弹出窗口
└── icons/  store/   # 素材
```

## 功能

Templates（25 内置 + 自定义，`{{变量}}`、拖拽排序）、Folders（文件夹树、颜色标记）、Export（MD/Text/JSON/PDF）、Search、Draft Auto-save（1.5s）、Keyboard Shortcut

## 创建新变体只需改

manifest.json（name/host_permissions）、popup.html/js（品牌名/默认按钮）、icons/ + store/。content.js、background.js、content.css 不用改。

## Payhip Pro

`https://payhip.com/b/WiVe1`，$5/月，免费 10 次/天。

## 开发

无构建步骤，Chrome 直接加载目录。GitHub: https://github.com/Aiskillhub/ai-chat-enhancer
