[English](#focusswitch) | [简体中文](#注意力开关)

# FocusSwitch
An extension helping keep focus on what you think matters, mute the rest including ads, relieving FOMO without hoarding data.

## The Problem
Social timelines are designed to hijack your attention. Even a highly curated following list spans multiple domains—one minute you are tracking breakthrough research, the next you are sucked into sports drama, corporate PR, or sponsored ads. 

Relying on raw willpower to stay focused doesn't work. On the other hand, traditional content blockers are too paternalistic—they delete elements entirely, breaking page layout physics and triggering your FOMO (*"What did I just miss?"*).

## The Solution
**Focus Switch** doesn't erase the timeline; it buffers it. It applies a heavy visual blur over posts matching your custom filter criteria, muting the psychological noise while keeping you in complete control.

- **Instant "Peek" Mechanic:** Hover your cursor over a blurred post to instantly lift the shield. Move your mouse away, and it locks back up instantly. 

- **No Algorithmic Battle:** Stop wasting hours trying to "train" the recommendation algorithm to match your shifting daily context. Just toggle your parameters instantly.

- **Perfect Ad Blocker:** Simply add `ad` as a filter keyword to cleanly blur out promoted posts.

## How It Works (Under the Hood)
To ensure 60fps scrolling without UI stuttering, Focus Switch splits UI mutations from evaluation:
1. **Layer 1 (Regex Routing):** Instantly parses high-frequency social elements, optimized for specific platform tags, handles, and system markers (like `#ad` or `@username`).

2. **Layer 2 (Local Phrase Chunking):** Uses a local, edge-based execution context to evaluate abstract context snippets without cloud latency.

3. **Friction Shield:** Injects a dynamic interactive layer over targeted DOM nodes, handling mouse entry/exit lifecycles smoothly.

## Installation

Since this project adheres to a strict **local-first philosophy**, all processing happens inside your browser. No data leaves your machine, no external APIs are called, and it works completely offline.

1. Clone this repository:
   
   ```bash
   git clone https://github.com/yourusername/focus-switch.git
   ```

2. Open Google Chrome and navigate to `chrome://extensions/`.

3. Enable **Developer mode** via the toggle switch in the top-right corner.

4. Click **Load unpacked** and select the `FocusSwitchExtension` directory of this project.

5. Pin the extension, add your current distraction keywords (case-insensitive), and take back your attention.

## Current Scope & Limitations

- **X/Twitter (Web):** Fully optimized with native boundary filtering.

- **Rednote/Xiaohongshu (Web):** Supported via global string matching. 
    - Note: Because Chinese text segmentation is loose in this iteration, keyword matching on single characters operates in a high-sensitivity "maximum defense" mode. Pull requests to refine Chinese token boundaries are welcome.


# 注意力开关

这是一个轻量级、本地优先（Local-first）、前额叶友好的 Chrome 浏览器插件，旨在为你的社交媒体信息流引入一层健康的"认知摩擦"。让你专注于真正重要的信息，屏蔽其余噪音（尤其是广告），无需通过囤积数据来消除 FOMO焦虑。

## 核心痛点

社交媒体的feed设计初衷之一就是为了劫持你的注意力、延长你的停留时间。即使是高度筛选的关注列表，内容也往往横跨多个领域——前一分钟你还在追踪突破性的 AI 科技进展，下一分钟就被迫卷入赛车八卦、企业公稿或商业广告中。

单靠意志力来保持专注是靠不住的，这会让本不富裕的注意力雪上加霜，一团乱麻的前额叶负重前行。然而，传统的广告/内容拦截工具又过于生硬——它们会直接删掉整个网页元素，不仅破坏了页面滚动的物理流畅度，还会触发更深层的焦虑：我刚才到底错过了什么？

## 解决方案

**Focus Switch** 并不抹去feed，而是对它进行"缓冲"。它会在匹配你自定义关键词的帖子上方叠加一层重度毛玻璃，在静音心理噪音的同时，将绝对的控制权重新交回你手中。

- **⚡ 即时"偷看"交互 (Peek)：** 将光标悬停在模糊的帖子上，即可无延迟解除遮罩；光标移开，帖子瞬间重新锁定制动。
- **🛑 拒绝被算法调教：** 别再浪费几个小时试图去"训练"推荐算法来迎合你每天多变的使用场景了。直接在插件里一键切换你的专注参数即可。
- **🎯 完美的广告净化：** 只需将 `ad` 添加为过滤关键词，即可完美模糊掉所有平台置顶和通稿广告。

## 工作原理 (技术底层)

为了确保 60fps 的丝滑滚动且不引发页面跳帧，Focus Switch 将界面渲染与后端逻辑进行了彻底解耦：

1. **第一层 (正则路由映射):** 毫秒级解析高频社交元素，针对特定平台的标签（Hashtags）、账号（Handles）和系统标记（如 `#ad` 或 `@username`）进行了极客级优化。
2. **第二层 (本地短语切片):** 采用纯端侧、本地化的执行上下文来评估抽象的内容文本，彻底告别云端 API 带来的高延迟。
3. **物理摩擦盾 (Friction Shield):** 在目标 DOM 节点上动态注入交互层，完美处理鼠标移入与移出的生命周期。

## 安装指南

本项目严格遵循 **本地优先 (Local-first) 哲学**，所有数据计算与推理 100% 在你的本地浏览器内完成。没有任何数据会离开你的设备，不调用任何云端 API，完全支持离线运行。

1. 克隆本项目仓库到本地：
   ```bash
   git clone https://github.com/yourusername/focus-switch.git
   ```

2. 打开 Google Chrome 浏览器，在地址栏输入并前往 `chrome://extensions/`。

3. 勾选右上角的 **"开发者模式" (Developer mode)** 开关。

4. 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)**，并选择本项目的 `FocusSwitchExtension` 文件夹。

5. 固定 (Pin) 该插件，打开弹窗输入你当前想屏蔽的打扰词（过滤不区分大小写），立刻夺回你的注意力主权。

## 当前适配范围与局限

- **X/Twitter (网页版):** 深度优化。原生支持单词边界过滤、账号及标签捕获。
    
- **小红书/Rednote (网页版):** 实验性支持。本插件未针对小红书进行深度定制开发，目前仅对卡片标题和正文文本有效（对原生 tag 标签和图片内文字无效）。
    
    - _注意：_ 由于当前版本的中文文本分词逻辑较为宽松，如果输入单个汉字作为关键词，可能会触发高灵敏度的"全盘防御模式"（包含该字的内容都会被模糊）。欢迎感兴趣的朋友提交 PR 来优化中文词界。
