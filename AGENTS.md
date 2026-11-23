# AGENTS.md

给接手这个项目的 AI 智能体。详细说明见 `README.md`，这里只列**必须先知道的硬约束**。

## 项目是什么

WorkBuddy 资料库里的一个 Page workbench：英语零基础 30 天学习工具。
`frontend/` 是公开产物，`private/` 是私有后端，数据在两张资料库表里（ID 见 README §1）。

## 三个文件，别搞混

| 文件 | 角色 |
|---|---|
| `frontend/零基础英语学习工作台.html` | 单文件前端（HTML+CSS+JS，约 2400 行）。只负责渲染，**不做数据库 CRUD** |
| `private/backend.js` | 后端 9 个 Tool 的实现，通过 `ctx.db.*` 读写两张表 |
| `private/workbench.json` | Tool 描述与 JSON Schema，必须与 `backend.js` 的 export 一一对应 |

## 硬约束

1. **私有文件绝不能被 zip 进公开产物**，也不能用普通上传通道。后端只能 `upload_page_artifact.py --target backend`，且 `backend.js` 与 `workbench.json` 必须一起传。
2. **前端的唯一数据通道是** `window.__SMART_PAGE__.workbench.callTool(name, payload)`，返回 `{isError, structuredContent}`。不要在前端直接写表。
3. **主键是 `_id`**。`ctx.db.query` 返回扁平记录，不是 `{id, properties}`。取错字段会导致「看起来成功但没落库」。
4. **不要删麦克风降级逻辑**（`micBlockedReason()` / `shadowRead()`）。公开链接的查看器 iframe 没有 `allow="microphone"`，录音必然失败，降级是唯一可用路径。
5. **音标符号不能直接送 TTS**，必须映射到例词（`SAMPLES`）。
6. **改在线页面要走事务**：`prepare_page_edit.py` → 改 → `finalize_page_edit.py --check-only` → 提交 → `publish_page.py`。不要试图覆盖 CDN 文件。
7. 提交前必须跑一次 `--check-only`，看到 `status: ready` 且 `warnings` 为空再提交。
8. `new Blob` / `new MediaRecorder` 写成 `window.Blob` / `window.MediaRecorder`，否则 lint 误报 HEDIT101。

## 改之前该读哪几节

- 改数据字段 → README §4 + §6
- 改后端逻辑 → README §5 + §9
- 改界面/交互 → README §7
- 发布/上线 → README §8

## 自检

```bash
# 语法
python3 - <<'EOF'
import re
s=open('frontend/零基础英语学习工作台.html',encoding='utf-8').read()
js=[b for b in re.findall(r'<script[^>]*>(.*?)</script>',s,re.S) if 'PHONEMES' in b][0]
open('/tmp/chk.js','w',encoding='utf-8').write(js)
EOF
node --check /tmp/chk.js
```

UI 自检：给 HTML 注入 `__SMART_PAGE__` 桩数据，在 390px 宽度下渲染，确认无横向溢出、无空白页、无 `undefined` 文案。
