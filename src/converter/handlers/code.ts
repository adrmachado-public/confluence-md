/**
 * Code block handlers
 */

import type { Code } from 'mdast';
import { createMacro } from '../xml';
import type { NodeHandler } from './types';

/**
 * Handle code block nodes (including mermaid)
 */
export const codeHandler: NodeHandler = (node, state) => {
	const code = node as unknown as Code;
	const lang = code.lang || '';
	const value = code.value || '';

	// Handle Mermaid diagrams. The macro name is configurable so it can match
	// whichever Mermaid app is installed in the target Confluence site.
	// mermaid_macro: "code" opts into the plain Code Block macro with
	// language=mermaid, for sites that render Mermaid natively (no app installed).
	if (lang.toLowerCase() === 'mermaid') {
		const macroName = state?.context?.mermaidMacro || 'mermaid';
		if (macroName === 'code') {
			return createMacro('code', { language: 'mermaid' }, value, 'plain-text');
		}
		return createMacro(macroName, undefined, value, 'plain-text');
	}

	// Regular code block with optional language parameter
	const params = lang ? { language: lang } : undefined;
	return createMacro('code', params, value, 'plain-text');
};
