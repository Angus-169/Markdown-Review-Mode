/**
 * The user's stylesheet for the review panel.
 *
 * The panel is rendered by the plugin, so the user's own CSS is how they make
 * it look the way they want. It is read through the filesystem service, so it
 * may live anywhere the Host may read, and a file that cannot be read simply
 * means the panel keeps its own styling.
 *
 * @module markdown-review-mode/host/stylesheet
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
/**
 * Where the user's stylesheet is read from when no path is configured.
 *
 * The Harness home, beside the profile's other state — a place the reader can
 * find without being told, and outside any repository they work in.
 *
 * @returns the path.
 */
export function defaultStylesheetPath() {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
    return join(home, 'review.css');
}
/**
 * Read the user's stylesheet.
 *
 * @param fs - the filesystem service.
 * @param path - the configured stylesheet path, if any.
 * @returns the stylesheet's text and where it came from.
 */
export async function readStylesheet(fs, path) {
    const target = path.trim().length > 0 ? path : defaultStylesheetPath();
    if (target.length === 0)
        return { css: '', path: '' };
    try {
        const resolved = await fs.resolve(target);
        const css = await fs.readText(resolved);
        return { css, path: target };
    }
    catch {
        // No stylesheet is not a failure: the panel has its own.
        return { css: '', path: target };
    }
}
//# sourceMappingURL=stylesheet.js.map