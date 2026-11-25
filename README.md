# Markdown Review Mode

[中文](#中文) · [English](#english)

**看到哪里要改，就在那里写下来 —— 看完之后交给 Agent 一次改完。**

A DeepSeek Harness plugin for reviewing AI-generated Markdown: put each
comment exactly where you read the problem, then submit them all at once for
the agent to apply in a single pass.

---

## 中文

### 为什么要做这个

AI 生成的文稿，几乎总要改。问题不在于改，而在于**怎么把"要改什么"准确地告诉它**。

通常的做法很别扭：

- 把意见写在对话里 —— "第三段那句太长了""第二节的逻辑顺序不对"。AI 得先猜你说的是哪一段，猜错了越改越乱；
- 或者复制粘贴到文档末尾、另开一个文件记着 —— 意见和它针对的文字隔得越来越远，回头看时对不上号；
- 一条一条说、一条一条改 —— 每改一次都要重新通读，来回很多轮。

**这个插件的想法很简单：意见应该长在它针对的那句话上。**

你正常读文档，读到哪里觉得不对，就在那里选中文字、写下意见。批注直接以下划线标在原文里，你看到的就是"这句话 + 这句话的问题"。整篇读完，所有意见都留在它们各自的位置上，然后**一次提交**：当前会话的 Agent 把所有批注读走，统一返工，逐条回执改了什么。

一句话：**像在纸上看稿子时用笔在旁边写意见，看完把整本交给助手一次改好。**

### 它怎么做到的

打开任意 `.md` 文件，右边栏的渲染器下拉里会多出一个 **审阅** 选项。选它之后：

- 文档以渲染后的样子呈现（标题、粗体、斜体、列表、表格、脚注都正常显示），点某一段则展开成源码；
- 读到要改的地方，选中文字 → 工具栏点 **批注** 写下意见，或点 **锁定** 标明这段不许动；
- 每条批注就地以下划线标在原文上，点它可以查看、编辑、删除；
- 全部看完，点 **提交批注** —— Agent 一次读取所有批注返工，改动高亮，每条意见都有回执；
- 如果你只是自己想改文字，点 **保存** 直接写回文件，不必经过 Agent。

批注被当作针对那一段文字的**指令**，不是"帮忙润色"的泛泛请求。程序会校验 Agent 的改动：没有被批注覆盖的块不许改，锁定的块必须逐字节保持原样 —— 所以它改的范围，正好是你圈出来的范围。

### 安装

**方式一：让 DSH 安装（推荐）**

在 DSH 的 **插件 → 添加插件** 里填入本仓库地址：

```
git@github.com:Angus-169/Markdown-Review-Mode.git
```

HTTPS 地址也可以：

```
https://github.com/Angus-169/Markdown-Review-Mode.git
```

仓库里已包含编译好的 `lib/`，所以装完即可用，不需要本地 Node 环境。

**方式二：从源码构建**

```bash
git clone https://github.com/Angus-169/Markdown-Review-Mode.git
cd Markdown-Review-Mode
npm install
npm run build
npm run verify
```

然后在 **插件 → 添加插件** 里填这个目录的绝对路径。

### 配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `maxRounds` | `20` | 内存中保留的审阅轮次上限 |
| `stylesheet` | 空 | 用户样式表路径；留空时读取 `~/.dsh/review.css` |

面板样式可以用自己的 CSS 覆盖，详见 [中文档情页](docs/DETAIL.zh.md)。

### 需要什么

- DSH `0.2.2-rc.5`（依赖其 Cordis / 文档预览 / 文件系统 / 存储等服务）；
- 文档必须位于当前会话的工作目录内，且该会话挂载了文件系统服务；
- 沙箱模式为 `read-only` 时无法写回文档，审阅提交会被拒绝并说明原因。

### 已知限制

- 没有版本历史、没有整篇 diff、不能整篇回滚；只能把单个块恢复到审阅时的版本。
- 代码块、表格、HTML 块和图片按整块处理，选中其中一部分会吸附到整块。
- Agent 不能改动没有任何批注覆盖的块。
- 脚注的定义留在原文位置，不会移到文末。

---

## English

### Why this exists

AI-generated drafts almost always need changes. The hard part is not the
changing — it is saying **exactly what to change, and where**.

The usual ways are awkward:

- Put the comments in the chat — "that sentence in section three is too long",
  "the order in section two is wrong". The agent has to guess which passage you
  mean, and a wrong guess makes things worse.
- Paste comments at the end of the document or into a separate file — the note
  drifts away from the text it refers to, and by review time you cannot match
  them up.
- Go one comment at a time — re-reading the whole draft between every tiny
  edit, over many rounds.

**The idea here is simple: a comment should live on the sentence it is about.**

You read the document normally. When something is wrong, select the passage
right there and write what needs to change. The comment underlines the original
text, so what you see is "this sentence + what is wrong with it". By the end,
every comment sits exactly where it belongs — then you **submit once**. The
agent in the current session reads all of them, reworks the draft in a single
pass, and reports what it did for each one.

In short: **like marking up a paper draft with a pen, then handing the whole
marked-up copy to an assistant to fix in one go.**

### How it works

Open any `.md` file and a **审阅** renderer appears in the right sidebar's
dropdown beside the product's own Markdown view. In review mode:

- The document renders as a document — headings, emphasis, lists, tables and
  footnotes display normally; click a paragraph to open its source.
- When you find something to change, select the passage → click **批注** to
  write the comment, or **锁定** to mark it as not-to-be-touched.
- Each comment underlines its passage; click one to read, edit or remove it.
- When you are done reading, click **提交批注** — the agent reads every comment,
  reworks the draft in one pass, highlights the changes, and reports one
  receipt per comment.
- If you just want to edit the text yourself, click **保存** to write it to the
  file without going through the agent.

A comment is treated as an **instruction about that passage**, not a vague
"please polish this". The plugin checks the agent's work against your marks:
blocks no comment covers must not change, and a locked block must come back
byte-identical — so the agent changes exactly what you circled.

### Installation

**Option 1 — let DSH install it (recommended)**

In **Plugins → Add plugin**, enter this repository's address:

```
git@github.com:Angus-169/Markdown-Review-Mode.git
```

An HTTPS URL works too:

```
https://github.com/Angus-169/Markdown-Review-Mode.git
```

The compiled `lib/` is committed, so the plugin works right after installation
— no local Node toolchain required.

**Option 2 — build from source**

```bash
git clone https://github.com/Angus-169/Markdown-Review-Mode.git
cd Markdown-Review-Mode
npm install
npm run build
npm run verify
```

Then add the directory's absolute path in **Plugins → Add plugin**.

### Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `maxRounds` | `20` | How many review rounds are kept in memory |
| `stylesheet` | empty | User stylesheet path; empty reads `~/.dsh/review.css` |

The panel's look can be changed with your own CSS; see the
[English detail page](docs/DETAIL.md).

### Requirements

- DSH `0.2.2-rc.5` (its Cordis, document-preview, filesystem and storage
  services).
- The document must live inside the session's working directory, with a
  filesystem service mounted for that session.
- Under the `read-only` sandbox mode the document cannot be written, so a
  rework submission is refused with an explanation.

### Known limitations

- No version history, no whole-document diff, no full rollback; a single block
  can be restored to its reviewed version.
- Code blocks, tables, HTML blocks and images are addressed as whole blocks; a
  selection inside them snaps to the whole block.
- The agent cannot change a block no comment covers.
- A footnote's definition stays where the source puts it, rather than moving
  to the end of the document.

---

## Development

```bash
npm install          # workspace-local npm cache; see .npmrc.example
npm run verify       # encoding, typecheck, tests, build, package checks
```

The verification pipeline checks: source encoding, TypeScript types, the unit
test suite, a clean build, and that the packaged bundle is well formed (exports
resolve, CSS classes match the decorations, the bundle is not stale).

`lib/` is committed so the plugin installs from git without a build step. Keep
it in sync: run `npm run build` after changing anything under `src/`.

## License

MIT
