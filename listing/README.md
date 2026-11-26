# Plugin listing entry

`Angus-169__Markdown-Review-Mode.yml` is the entry that lists this plugin in
the community registries. It is **not** part of the plugin package — it is a
submission to someone else's list.

## Where it goes

Two lists accept it:

| List | How |
|---|---|
| **awesome-dsh-plugin** | Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>, add this file to `data/plugins/`, open a PR. The file name must be exactly `Angus-169__Markdown-Review-Mode.yml` — the listing derives it from the URL and rejects a mismatch. |
| **dsh.so** | Paste the repository URL into <https://www.dsh.so/submit/>. The listing fetches the repository and validates it on its own. |

## Before submitting

```bash
npm run check:listing-entry
```

That script applies the listing's own rules to this file — the derived file
name, the fields it reads and refuses, the repository the name claims, the
category, the one-line descriptions, and the icon's host and format. A green
run means the automatic checks will pass; the description is still read by a
human.

## What the entry says

The plugin is listed under `ui`: it adds a review mode to the right sidebar's
document preview.

The description leads with the workflow rather than the feature list — comment
on the passage that needs changing, submit every comment at once, and the
agent applies them in one pass.

## Before the PR

- Add the **`dsh-plugin` topic** to this repository (Repository → About →
  Topics). The listing looks for it, and the submission checklist asks for it.
- The repository must be at least a day old. It is.
