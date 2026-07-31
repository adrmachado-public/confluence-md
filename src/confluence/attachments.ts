/**
 * Confluence attachment operations
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { HttpClient } from '@actions/http-client';
import { getLogger } from '../logger';
import type { ConfluenceAttachment, ImageReference } from '../types';
import type { ConfluenceClient } from './client';

/**
 * MIME type mapping based on file extension
 */
const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
};

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Find an existing attachment on a page by its filename.
 *
 * Returns undefined when no attachment with the given filename exists.
 */
async function findExistingAttachment(
	client: ConfluenceClient,
	pageId: string,
	filename: string
): Promise<ConfluenceAttachment | undefined> {
	const result = await client.get<{ results?: ConfluenceAttachment[] }>(
		`/wiki/rest/api/content/${pageId}/child/attachment?filename=${encodeURIComponent(filename)}`
	);

	return result.results?.[0];
}

/**
 * Extract a single attachment from an upload response.
 *
 * The create endpoint wraps the attachment in `{ results: [...] }`, while the
 * data-update endpoint returns the attachment object directly.
 */
function extractAttachment(result: unknown, filename: string): ConfluenceAttachment {
	const data = result as { results?: ConfluenceAttachment[]; id?: string };

	if (data.results && data.results.length > 0) {
		return data.results[0];
	}

	if (data.id) {
		return data as ConfluenceAttachment;
	}

	throw new Error(`Failed to upload attachment: ${filename}`);
}

/**
 * Upload an attachment to a page.
 *
 * Confluence rejects uploading a new attachment when one with the same filename
 * already exists (HTTP 400). To allow re-running the sync with unchanged
 * filenames, we update the existing attachment's data instead of creating a new
 * one when a same-named attachment is found.
 */
export async function uploadAttachment(
	client: ConfluenceClient,
	pageId: string,
	filename: string,
	content: Buffer
): Promise<ConfluenceAttachment> {
	const mimeType = getMimeType(filename);

	// Use v1 API for attachments (v2 doesn't support multipart upload well)
	const existing = await findExistingAttachment(client, pageId, filename);

	if (existing) {
		getLogger().info(`Updating existing attachment: ${filename}`);

		const result = await client.postMultipart<{ results?: ConfluenceAttachment[]; id?: string }>(
			`/wiki/rest/api/content/${pageId}/child/attachment/${existing.id}/data`,
			filename,
			content,
			mimeType
		);

		const attachment = extractAttachment(result, filename);
		getLogger().debug(`Attachment updated: ${attachment.id}`);
		return attachment;
	}

	getLogger().info(`Uploading attachment: ${filename}`);

	const result = await client.postMultipart<{ results?: ConfluenceAttachment[]; id?: string }>(
		`/wiki/rest/api/content/${pageId}/child/attachment`,
		filename,
		content,
		mimeType
	);

	const attachment = extractAttachment(result, filename);
	getLogger().debug(`Attachment uploaded: ${attachment.id}`);
	return attachment;
}

/**
 * Upload multiple attachments from image references
 */
export async function uploadAttachments(
	client: ConfluenceClient,
	pageId: string,
	images: ImageReference[],
	attachmentsBase: string
): Promise<number> {
	let uploadedCount = 0;

	for (const image of images) {
		if (!image.attachmentFilename) {
			continue;
		}

		try {
			let content: Buffer;

			if (image.isRemote && image.src) {
				// Download remote image
				getLogger().debug(`Downloading remote image: ${image.src}`);
				content = await downloadImage(image.src);
			} else {
				// Read local file
				const localPath = path.resolve(attachmentsBase, image.src);
				getLogger().debug(`Reading local image: ${localPath}`);

				// Security check: path must stay within attachmentsBase, or at
				// least within the repository checkout root (allows
				// Docusaurus-style ../../../static/... references).
				const resolvedBase = path.resolve(attachmentsBase);
				const allowedRoot = path.resolve(process.cwd());
				if (!localPath.startsWith(resolvedBase) && !localPath.startsWith(allowedRoot)) {
					throw new Error(`Path traversal detected: ${image.src}`);
				}

				if (!fs.existsSync(localPath)) {
					getLogger().warning(`Image not found: ${localPath}`);
					continue;
				}

				content = fs.readFileSync(localPath);
			}

			await uploadAttachment(client, pageId, image.attachmentFilename, content);
			uploadedCount++;
		} catch (error) {
			getLogger().warning(
				`Failed to upload image ${image.src}: ${error instanceof Error ? error.message : error}`
			);
		}
	}

	return uploadedCount;
}

/**
 * Download an image from a URL
 */
async function downloadImage(url: string): Promise<Buffer> {
	const http = new HttpClient('confluence-md');
	const response = await http.get(url);

	if (response.message.statusCode !== 200) {
		throw new Error(`Failed to download image: HTTP ${response.message.statusCode}`);
	}

	if (!response.readBodyBuffer) {
		throw new Error('Binary download requires HttpClientResponse.readBodyBuffer');
	}

	return response.readBodyBuffer();
}
