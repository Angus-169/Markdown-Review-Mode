# Markdown Review Mode

[中文](#中文) · [English](#english)

A DeepSeek Harness plugin that adds a review layer to Markdown documents in
the right sidebar: select text, write a comment, and let the agent rework the
draft with every change highlighted and every comment answered.

---

## 中文

### 它做什么

打开任意 `.md` 文件，右边栏的渲染器下拉里会多出一个 **审阅** 选项。选它之后：

- 文档以渲染后的样子呈现（标题、粗体、斜体、列表、表格、脚注都正常显示），点某一段则展开成源码；
- 选中一段文字，旁边浮出工具栏：**批注**（写下哪里要改）或 **锁定**（这段不许动）；
- 批注在原文里以下划线标出，点它可以查看、编辑、删除；
- 点 **提交批注**，当前会话里的 Agent 会收到批注、逐条返工，并回执每条的处理结果；
- 自己直接改的文字，点 **保存** 即可写回文件 —— 不必经过 Agent。

批注是关于文字的指令，不是"帮忙润色"的请求。程序会校验 Agent 的改动：没有被批注覆盖的块不许改，锁定的块必须逐字节保持原样。

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

### What it does

Open any `.md` file and a **审阅** renderer appears in the right sidebar's
dropdown beside the product's own Markdown view. In review mode:

- The document renders as a document — headings, emphasis, lists, tables and
  footnotes display normally; click a paragraph to open its source.
- Select a passage and a toolbar offers **批注** (write what is wrong) or
  **锁定** (freeze it).
- Comments underline their passage; click one to read, edit or remove it.
- **提交批注** wakes the current session's agent. It reads the annotations,
  reworks the draft, and reports one receipt per annotation.
- **保存** writes your own text edits straight to the file, without the agent.

A comment is an instruction about the text, not a request for better wording.
The plugin checks the agent's work: blocks no comment covers must not change,
and a locked block must come back byte-identical.

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
