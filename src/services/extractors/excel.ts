import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../utils/logger';
import { ContentExtractor } from '../../types';

// Need to properly import xlsx
import * as xlsx from 'xlsx';

export class ExcelExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.xlsx', '.xls'].includes(ext);
    }

    async extractContent(filePath: string): Promise<string> {
        try {
            logger.info(`Extracting content from Excel file: ${filePath}`);

            // Read the Excel file
            const workbook = xlsx.readFile(filePath);

            // Process each sheet into CSV format
            const allSheets: string[] = [];
            const sheetNum = workbook.SheetNames.length;
            for (const sheetName of workbook.SheetNames) {
                // Convert sheet to CSV
                const sheet = workbook.Sheets[sheetName];
                const csv = xlsx.utils.sheet_to_csv(sheet);

                // Add sheet name as header
                if (sheetNum > 1) {
                    allSheets.push(`--- Sheet: ${sheetName} ---`);
                }
                allSheets.push(csv);
            }

            // Join all sheets with clear separation
            return allSheets.join('\n\n');
        } catch (error) {
            logger.error(`Error extracting Excel content: ${error}`);
            return `Error extracting Excel content: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
}

export class WordExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.docx'].includes(ext);
    }

    async extractContent(filePath: string): Promise<string> {
        try {
            logger.info(`Extracting content from Word file: ${filePath}`);
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            logger.error(`Error extracting Word content: ${error}`);
            return `Error extracting Word content: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
}