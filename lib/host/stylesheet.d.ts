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
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { ReviewStylesheet } from '../core/contract.ts';
/**
 * Where the user's stylesheet is read from when no path is configured.
 *
 * The Harness home, beside the profile's other state — a place the reader can
 * find without being told, and outside any repository they work in.
 *
 * @returns the path.
 */
export declare function defaultStylesheetPath(): string;
/**
 * Read the user's stylesheet.
 *
 * @param fs - the filesystem service.
 * @param path - the configured stylesheet path, if any.
 * @returns the stylesheet's text and where it came from.
 */
export declare function readStylesheet(fs: FileSystem, path: string): Promise<ReviewStylesheet>;
//# sourceMappingURL=stylesheet.d.ts.map