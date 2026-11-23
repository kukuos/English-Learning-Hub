# 零基础英语学习工作台 · 项目源码

一个跑在 WorkBuddy 资料库里的 **Page workbench**：单文件 HTML 前端 + 私有 JS 后端 + 两张资料库数据表。
面向英语零基础用户的 30 天学习工具，核心是 SRS 间隔复习、音标入门、场景对话、跟读与打卡统计。

导出版本：**页面 v11**（2026-11-23）

---

## 1. 线上位置

| 项 | 值 |
|---|---|
| 页面节点 ID | `ygn2SF6n64e2cckVAaHgzY` |
| 编辑态 | https://www.workbuddy.cn/space/d/ygn2SF6n64e2cckVAaHgzY |
| 公开链接 | https://workbuddy.link/p/ygn2SF6n64e2cckVAaHgzY |
| 卡片表 `CARDS_DB` | `<CARDS_DB_ID>`（英语学习卡片，54 条） |
| 打卡表 `LOGS_DB` | `<LOGS_DB_ID>`（英语打卡记录） |
| 已解绑旧表 | `<OLD_LOGS_DB_ID>`（英语学习日志·旧表，可删除） |

> **真实表 ID 只存私有环境**：本仓库是公开仓库，README 与 `data/*.schema.json` 中的表 ID 已替换为占位符，真实 ID 只保存在私有环境（`private/backend.js`）。请勿把真实 ID 写回本文档。

### 在线访问（GitHub Pages）

GitHub Pages 上有部署好的**只读演示版**，打开即可浏览界面与示例数据；写操作只在当前页面会话内生效，刷新即还原，不会写入资料库：

- https://kukuos.github.io/English-Learning-Hub/

需要真实读写与打卡，请使用上表的 WorkBuddy 公开链接。演示版由 `.github/workflows/pages.yml` 在每次推送 `main` 时自动构建。

---

## 2. 目录结构

```
English/
├── README.md                      ← 本文件
├── AGENTS.md                      ← 给 AI 智能体的极简规则（先读这个）
├── frontend/                      ← 公开产物，会原样发到 CDN
│   ├── 零基础英语学习工作台.html      ← 全部前端（HTML+CSS+JS 单文件，约 2400 行）
│   ├── manifest.json               ← PWA 清单
│   ├── sw.js                       ← Service Worker（network-first）
│   └── icon.svg                    ← 图标
├── private/                       ← 私有源码，永不出现在公开产物里
│   ├── backend.js                  ← 后端 9 个 Tool 的实现（ESM）
│   └── workbench.json              ← Tool 描述与 JSON Schema（1–64 个 Tool）
├── data/                          ← 只读快照，方便理解数据，不要当数据源改
│   ├── cards.schema.json           ← 卡片表结构
│   ├── logs.schema.json            ← 打卡表结构
│   └── cards.csv                   ← 54 张卡片当前内容
├── tools/                         ← 构建脚本
│   └── build-pages.mjs             ← 生成 Pages 演示版（注入内嵌示例数据桩）
└── .github/
    └── workflows/
        └── pages.yml               ← GitHub Pages 自动部署
```

> `data/` 是导出时的快照。真正生效的数据在资料库表里，改本地 CSV 不会同步上线。

---

## 3. 运行机制（务必先理解）

这三个文件不是「本地打开的静态网页」，它们依靠平台注入的桥接对象运行：

```js
// 前端唯一的数据通道
window.__SMART_PAGE__.workbench.callTool(name, payload)  // → Promise<{isError, structuredContent}>
```

- 平台在 `<head>` 注入 `/page/page_comm/inject.js`，由它把 `__SMART_PAGE__` 塞进页面。
- 前端 **完全不做数据库 CRUD**，只调 `callTool`；所有读写都落在 `private/backend.js`。
- 后端通过 `ctx.db.query / addRecord / updateRecord / deleteRecord` 访问两张表。
- `frontend/` 与 `private/` 物理隔离：私有文件只能通过 `--target backend` 单独上传，绝不能被 zip 进公开产物。

### 本地预览（不接平台时）

直接双击 HTML 会显示「当前环境没有连接工作台能力」，因为 `window.__SMART_PAGE__` 不存在。
要在本地调 UI，就在 HTML 的 `</head>` 前插一段桩代码：

```html
<script>
window.__SMART_PAGE__ = { workbench: {
  callTool: function(name, payload){
    var M = { /* 按需伪造 get_dashboard / list_cards / get_review_queue … 的返回 */ };
    return Promise.resolve({ isError:false, structuredContent: JSON.parse(JSON.stringify(M[name] || {})) });
  },
  getContext: function(){ return Promise.resolve({ member:{ name:"预览" } }); }
}};
</script>
```

伪造数据的字段形状见 §5 各 Tool 的返回契约。

> GitHub Pages 演示版由 `tools/build-pages.mjs` 用同一手法生成：由 `data/cards.csv` 派生示例卡片，注入带读写模拟的 `window.__SMART_PAGE__` 桩。

---

## 4. 数据模型

### 卡片表 `<CARDS_DB_ID>`（英语学习卡片）

| 字段 | 类型 | 说明 / 选项 |
|---|---|---|
| 卡片内容 | text | 展示主体（单词、短语音标符号、句型） |
| 中文释义 | text | |
| 类型 | select | 音标 / 单词 / 短语 / 句型 / 语法 |
| 阶段 | select | W1 发音 / W2 高频词 / W3 句型 / W4 对话 |
| 音标 | text | 带斜杠，如 `/iː/` |
| 例句 | text | |
| 例句翻译 | text | |
| 熟练度 | number | 0–6，SRS 等级 |
| 下次复习 | date | 到期日，空视为今天到期 |
| 加入日期 | date | 用于「每日新卡上限」统计 |
| 遗忘次数 | number | 评「忘了」+1、「记得」−1，≥2 且 熟练度<4 进弱项池 |

当前 54 张：单词 18、音标 12、句型 12、短语 6、语法 6。

### 打卡表 `<LOGS_DB_ID>`（英语打卡记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| 记录 | text | `YYYY-MM-DD · 打卡`（人读标题） |
| 日期 | date | 一天一条，读取时按日期去重 |
| 学习时长 | number | 分钟 |
| 新学卡片 / 复习卡片 | number | |
| 完成度 | select | 全部完成 / 部分完成 |
| 今日心得 | text | |
| 辨音正确率 | number | 0–100 |
| 对话练习 | number | 今天演了几段 |
| 跟读句数 | number | 今天跟读了几句 |

---

## 5. 后端 Tools（9 个）

`private/workbench.json` 声明，`private/backend.js` 实现。名称必须匹配 `^[a-z][a-z0-9_]{0,63}$`。

| Tool | 入参 | 返回要点 |
|---|---|---|
| `get_dashboard` | `{date?}` | `stats{total,mastered,due,streak,totalMinutes,totalReviews,leech,todayAdded,dailyCap,newSevenDays}`、`levelDist[7]`、`byType{}`、`last14[14]`、`todayLog`、`recentLogs`、`dayIndex` |
| `list_cards` | `{date?,type?,stage?,keyword?,onlyDue?,leechOnly?,offset?,limit?}` | `{total, offset, cards[]}`，limit 上限 100 |
| `get_review_queue` | `{date?,limit?}` | `{total, cards[]}`，弱项卡排最后，limit 上限 60 |
| `add_card` | `{date?,content,meaning?,type?,stage?,ipa?,example?,exampleCn?,force?,cap?}` | `{ok,id,cap}`；超每日上限返回 `{ok:false,capped:true,todayAdded,cap}` |
| `update_card` | `{recordId, ...可选字段}` | `{ok,updated}` |
| `delete_card` | `{recordId}` | `{ok}` |
| `review_card` | `{recordId,grade:"again"|"hard"|"good",level,lapses,date?}` | `{ok,level,due,interval,lapses,leech}` |
| `reset_card` | `{recordId,date?}` | `{ok,due}`；**当前 UI 未调用**，保留给 agent 手动重置 |
| `save_daily_log` | `{date,minutes,newCards,reviews,done,note,quizRate?,dialogues?,shadows?}` | `{ok,mode:"updated"|"recreated"|"created",id}` |

卡片对象统一经 `normCard()` 扁平化：`{id,content,meaning,type,stage,ipa,example,exampleCn,level,lapses,due,added}`。

---

## 6. 业务规则（改代码前先看这里）

- **SRS 间隔**：`INTERVALS = [0,1,2,4,7,15,30]`，熟练度 0–6 对应索引。
- **评分**：`again` → level 0、今天再来；`hard` → 间隔×0.6；`good` → level+1、按新等级取间隔。
- **掌握**：`MASTER_LEVEL = 4`（level ≥ 4 计入 mastered）。
- **弱项池**：`LEECH_LAPSES = 2`，`遗忘次数≥2 且 level<4` 进池；`list_cards` 支持 `leechOnly`。
- **每日新卡上限**：`DAILY_CAP = 8`，按 `加入日期 == 今天` 计数；超限时前端弹窗确认后可带 `force:true` 强制添加。
- **打卡去重**：同一天只保留最后一条。`save_daily_log` 先 `updateRecord`，失败则 `delete + add`，再失败则直接追加，读取时 `dedupeLogs()` 按日期取最后一条。
- **连续天数**：`computeStreak()` 从今天（或昨天）向前数连续有打卡的日期。
- **dayIndex**：第一条打卡记录的日期为 Day 1；没有打卡则恒为 1。

---

## 7. 前端结构

单文件 `零基础英语学习工作台.html`。结构顺序：CSS 变量与组件样式 → 静态骨架（topbar/tabs/#view）→ 主 `<script>`。

### 视图路由

`state.view` 取值与渲染函数：

| view | 渲染 | 说明 |
|---|---|---|
| `today` | `renderToday()` | 今日任务、开口练习、复习/音标/辨音/对话入口、打卡表单、计时器 |
| `review` | `renderReview()` | SRS 刷卡，again/hard/good 三档评分 |
| `deck` | `renderDeck()` | 卡片库：搜索、类型/阶段筛选、增删改、新卡上限进度 |
| `progress` | `renderProgress()` | KPI、14 天柱图、等级分布、类型分布、近期打卡 |
| `guide` | `renderGuide()` | 入门指南长文（含「不熟音标怎么办」） |
| `phonics` | `renderPhonics()` | 音标入门，48 个音分 5 组（tab 高亮落在「入门指南」） |
| `quiz` | `renderQuiz()` | 辨音小测，10 题（tab 高亮落在「复习」） |
| `leech` | `renderLeech()` | 弱项池列表 + 认读单练（tab 同上） |
| `dialog` | `renderDialog()` / `renderDialogScene()` | 6 段场景对话：跟读模式 / 角色扮演 |

### 静态数据常量

| 常量 | 内容 |
|---|---|
| `PLAN` | 30 天课程表（每日主题 + 任务） |
| `STAGE_SAMPLES` | 按周分档的开口练习句，每档 5 句 |
| `DIALOGUES` | 6 段场景对话（见面/购物/救场/点单/问路/酒店） |
| `PAIRS` / `SAMPLES` | 最小对立对（如 `ɪ: ship/sheep`）与音标例词 |
| `QPAIRS` | 辨音小测题库，7 组对立对 |
| `PH_GROUPS` / `PHONEMES` | 音标 5 组 + 48 个音素（符号/组/例词/中文释义/中文近似/口型提示） |

### 发音链路

`speak(text, rate)`：优先真人词典音 `https://dict.youdao.com/dictvoice?type=2&audio=<text>`（`playReal`），失败回落 `speechSynthesis`（择优 Samantha/Ava/Allison），`playbackRate` 支持 0.6 倍速且 `preservesPitch`。
**音标符号本身不能送去 TTS**（会把 `/iː/` 念成符号），必须送例词。`speakChunk(text)` 做逐词 + 整句跟读。

### localStorage 键

| 键 | 用途 |
|---|---|
| `enwb.asrc` / `enwb.arate` | 音源（real/tts）与语速（1 / 0.6） |
| `enwb.tstart` | 学习计时器起点 |
| `enwb.tasks.<date>` | 今日任务勾选状态 |
| `enwb.shadow.<date>` | 今日跟读句数 |
| `enwb.dlg.<date>` | 今日完成的对话场景 |
| `enwb.quiz.<date>` | 今日辨音小测成绩 |
| `enwb.ph` | 音标「我会了」集合 `{符号:1}` |
| `enwb.cache.dash|queue|cards` | 联网时的数据快照（离线降级用） |
| `enwb.pending` | 离线写入队列，联网后 `flushPending()` 补发 |

---

## 8. 怎么改 / 怎么上线

### 方式 A：让 WorkBuddy 里的智能体改（推荐）

它会走「打开事务 → 下载 → 改 → 预检 → 提交 → 询问是否同步发布」的标准流程，自带 lint 与 diff 校验。

### 方式 B：手改后自己上传

平台要求按事务提交，不能直接覆盖文件：

```bash
SKILL=/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/library

# 1) 开事务，拿 transactionId / baseVersion，并下载要改的文件
python3 "$SKILL/page/prepare_page_edit.py" --node-id ygn2SF6n64e2cckVAaHgzY --path "零基础英语学习工作台.html"

# 2) 改完先预检（diff + lint）
python3 "$SKILL/page/finalize_page_edit.py" --check-only --work-dir "<work_dir>" --path "零基础英语学习工作台.html"

# 3) 提交（只上传改动过的文件）
python3 "$SKILL/page/finalize_page_edit.py" --work-dir "<work_dir>" --path "零基础英语学习工作台.html" \
  --message "本次改动说明"

# 4) 同步到公开链接
python3 "$SKILL/page/publish_page.py" --node-id ygn2SF6n64e2cckVAaHgzY
```

改后端时：`create_page_transaction.py` → `get_workbench_sources.py --base-version <v> --out-dir private` 取回私有文件，
改完用 `upload_page_artifact.py --path backend.js --file … --target backend` 同时上传 `backend.js` 和 `workbench.json`，再 commit。
**改后端必须两个文件一起传**，只传一个是坏的后端。

### 方式 C：自己托管

`frontend/` 里的 4 个文件是纯静态的，可以直接丢到任意静态托管上——但那样没有后端，所有 `callTool` 都会失败。
仅有 HTML 时页面会退化为「无数据」状态（顶部横幅提示未连接工作台）。

---

## 9. 平台坑（踩过的，别重复踩）

1. **主键字段是 `_id`**。`ctx.db.query` 返回扁平记录，不是 `{id, properties}` 结构；取错字段会让评分静默失效、打卡每次新增一行。
2. **某张表上 `updateRecord` / `deleteRecord` 会返回 400 `DATA_ACCESS_FAILED`**。当前打卡表已做三级兜底（update → delete+add → 纯追加），换表可能再遇到，`dedupeLogs()` 必须保留。
3. **CSP 只放行 `media-src https:`**，所以音频只能走 https 外链，不能用 `blob:` 之外的本地资源。
4. **公开链接的查看器 iframe 没有 `allow="microphone"`**，`getUserMedia` 必然 `NotAllowedError`，与用户浏览器权限无关。代码里有 `micBlockedReason()` 检测 + `shadowRead()` 节拍跟读降级，**不要删这段降级逻辑**。
5. **`/page/page_comm/inject.js` 是绝对路径**，换域名/自托管会导致桥接注入失败。
6. **lint 误报**：`finalize_page_edit` 的 `HEDIT101` 会把 `new Blob`、`new MediaRecorder` 当成裸函数调用，写成 `window.Blob` / `window.MediaRecorder` 即可。
7. **卡片「加入日期」不要写成导入当天**，否则首日 54 张直接触发每日上限；当前统一为 `2026-11-01`。
8. 页面上 `/iː/` 这类纯符号必须配 `SAMPLES` 例词才能发音。

---

## 10. 已知限制 / 未做

- 录音只存在内存 `Blob`，刷新即失效，未上传、未做声纹对比。
- 离线是「有限离线」：有缓存可刷卡评分、写入排队，但卡片库/打卡等必须联网。
- PWA 真离线安装不可行——页面嵌在查看器 iframe 里，安装主体是外层文档。
- 每日提醒/自动推送未接（可选方案：定时调 `get_dashboard` + `get_review_queue` 后推企业微信机器人）。
- 音标进度 `enwb.ph` 只存本机，不跨设备同步。

---

## 11. 版本历史（摘要）

| 版本 | 内容 |
|---|---|
| v4 | 初版：30 天课程表 + SRS + 打卡 |
| v5 | 真人词典音 + 0.6 倍速 + 音标例词 + 最小对立对 |
| v6 | 跟读录音对比、学习计时器、辨音小测 |
| v7 | 麦克风受限诊断 + 跟读节拍降级 |
| v10 | 七项补齐：弱项池、对话演练、每日新卡上限、离线队列、PWA、`_id` 关键 bug 修复 |
| v11 | 音标入门：48 个音分 5 组 + 口型提示 + 辨音对比 + 「我会了」进度 |
