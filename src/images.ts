/**
 * Image handling utilities
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImageReference } from './types';

export { getImageExtension } from './utils/filename';
// Re-export from utils for backward compatibility
export { isRemoteUrl } from './utils/url';

/**
 * Resolve a local image path relative to the attachments base
 */
export function resolveLocalImagePath(src: string, attachmentsBase: string): string {
	const localPath = path.resolve(attachmentsBase, src);
	const resolvedBase = path.resolve(attachmentsBase);
	const allowedRoot = path.resolve(process.cwd());

	// Security: prevent path traversal outside attachmentsBase, or at least
	// outside the repository checkout root (allows Docusaurus-style
	// ../../../static/... references).
	if (!localPath.startsWith(resolvedBase) && !localPath.startsWith(allowedRoot)) {
		throw new Error(`Path traversal detected: ${src}`);
	}

	return localPath;
}

/**
 * Check if a local image exists
 */
export function localImageExists(src: string, attachmentsBase: string): boolean {
	try {
		const localPath = resolveLocalImagePath(src, attachmentsBase);
		return fs.existsSync(localPath);
	} catch {
		return false;
	}
}

/**
 * Filter images that need to be uploaded as attachments
 */
export function getImagesToUpload(
	images: ImageReference[],
	imageMode: 'upload' | 'external',
	downloadRemoteImages: boolean
): ImageReference[] {
	return images.filter((img) => {
		// Skip images without attachment filename (external URLs)
		if (!img.attachmentFilename) {
			return false;
		}

		// Local images are always uploaded in 'upload' mode
		if (!img.isRemote) {
			return imageMode === 'upload';
		}

		// Remote images are only uploaded if downloadRemoteImages is enabled
		return downloadRemoteImages;
	});
}
