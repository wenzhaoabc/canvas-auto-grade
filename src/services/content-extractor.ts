import * as fs from 'fs';
import * as path from 'path';
import { ContentExtractor, FileType } from '../types';
import { logger } from '../utils/logger';
import { ExcelExtractor } from './extractors/excel';
import { ZipExtractor } from './extractors/compress';

/**
 * Text file content extractor
 */
class TextExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.txt', '.js', '.py', '.java', '.c', '.cpp', '.cs', '.html', '.css', '.json', '.ts'].includes(ext);
    }

    async extractContent(filePath: string): Promise<string> {
        return fs.promises.readFile(filePath, 'utf-8');
    }
}

/**
 * PDF file content extractor (placeholder for future implementation)
 */
class PDFExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.pdf';
    }

    async extractContent(filePath: string): Promise<string> {
        // Placeholder for PDF extraction logic
        // Would require a PDF parsing library like pdf-parse or pdf2json
        logger.warn(`PDF extraction not implemented yet. Returning file path for ${filePath}`);
        return `[PDF file: ${path.basename(filePath)}]`;
    }
}

/**
 * DOCX file content extractor (placeholder for future implementation)
 */
class DocxExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.docx';
    }

    async extractContent(filePath: string): Promise<string> {
        // Placeholder for DOCX extraction logic
        // Would require a library like mammoth or docx
        logger.warn(`DOCX extraction not implemented yet. Returning file path for ${filePath}`);
        return `[DOCX file: ${path.basename(filePath)}]`;
    }
}


/**
 * Fallback extractor for unsupported file types
 */
class DefaultExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        return true; // Handles any file type as a fallback
    }

    async extractContent(filePath: string): Promise<string> {
        logger.warn(`No suitable extractor found for ${filePath}. Returning file path.`);
        return `[Unsupported file: ${path.basename(filePath)}]`;
    }
}

/**
 * Content extraction service that uses registered extractors to handle different file types
 */
export class ContentExtractionService {
    private extractors: ContentExtractor[] = [];

    constructor() {
        // Register extractors in order of preference
        this.registerExtractor(new TextExtractor());
        this.registerExtractor(new ExcelExtractor()); // Add Excel extractor
        this.registerExtractor(new PDFExtractor());
        this.registerExtractor(new DocxExtractor());
        this.registerExtractor(new ZipExtractor());
        this.registerExtractor(new DefaultExtractor());
    }

    /**
     * Register a new content extractor
     */
    registerExtractor(extractor: ContentExtractor): void {
        this.extractors.push(extractor);
    }

    /**
     * Extract content from a file using the appropriate extractor
     */
    async extractContent(filePath: string): Promise<string> {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            for (const extractor of this.extractors) {
                if (extractor.canHandle(filePath)) {
                    logger.debug(`Using extractor ${extractor.constructor.name} for ${filePath}`);
                    return await extractor.extractContent(filePath);
                }
            }

            throw new Error(`No suitable extractor found for ${filePath}`);
        } catch (error) {
            logger.error(`Error extracting content from ${filePath}: ${error}`);
            return `Error extracting content: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
}
