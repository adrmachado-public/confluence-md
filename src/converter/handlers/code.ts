/**
 * Code block handlers
 */

import type { Code } from 'mdast';
import { createMacro } from '../xml';
import type { NodeHandler } from './types';

/**
 * Handle code block nodes.
 *
 * All fenced code (including ```mermaid) renders via the plain Code Block
 * macro with a language parameter, since this fork targets Confluence sites
 * that render Mermaid natively (no dedicated Mermaid app installed).
 */
export const codeHandler: NodeHandler = (node) => {
	const code = node as unknown as Code;
	const lang = code.lang || '';
	const value = code.value || '';

	const params = lang ? { language: lang } : undefined;
	return createMacro('code', params, value, 'plain-text');
};
