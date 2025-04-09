import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

import { logger } from '../../utils/logger';
import { ContentExtractor } from '../../types';

import { ExcelExtractor } from './excel';

const execAsync = promisify(exec);
const SEVENZIP_PATH = 'C:\\Program Files\\7-Zip\\7z.exe';

export class ZipExtractor implements ContentExtractor {
    canHandle(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.zip', '.rar', '.7z'].includes(ext);
    }

    async extractContent(filePath: string): Promise<string> {
        try {
            // 检查7zip是否存在
            if (!fs.existsSync(SEVENZIP_PATH)) {
                logger.error(`7zip not found at ${SEVENZIP_PATH}`);
                return `[Error: 7zip executable not found. Please ensure it's installed at ${SEVENZIP_PATH}]`;
            }

            // 创建临时解压目录
            const tempDir = path.join(os.tmpdir(), `auto_grade_extract`, path.basename(filePath, path.extname(filePath)));
            if (fs.existsSync(tempDir)) {
                this.cleanupTempDir(tempDir); // 清理旧的临时目录
            }
            fs.mkdirSync(tempDir, { recursive: true });

            // 使用7zip解压文件
            await this.extract7zip(filePath, tempDir);

            // 读取所有解压后的文件内容
            const content = await this.readExtractedFiles(tempDir);

            // 清理临时目录
            this.cleanupTempDir(tempDir);

            return content || `[No readable text content in: ${path.basename(filePath)}]`;
        } catch (error) {
            logger.error(`Error extracting ${filePath}: ${error}`);
            return `[Failed to extract: ${path.basename(filePath)}]`;
        }
    }

    private async extract7zip(filePath: string, outputDir: string): Promise<void> {
        try {
            // 使用完整路径调用7zip
            const quotedFilePath = `"${filePath}"`;
            const quotedOutputDir = `"${outputDir}"`;

            // 构建7zip命令，使用绝对路径
            const command = `"${SEVENZIP_PATH}" x ${quotedFilePath} -o${quotedOutputDir} -y`;

            logger.info(`Executing: ${command}`);
            const { stdout, stderr } = await execAsync(command);

            if (stderr) {
                logger.warn(`7zip stderr: ${stderr}`);
            }
        } catch (error) {
            logger.error(`7zip extraction error: ${error}`);
            if (error instanceof Error) {
                throw new Error(`Failed to extract with 7zip: ${error.message}`);
            } else {
                throw new Error('Failed to extract with 7zip: Unknown error');
            }
        }
    }

    private async readExtractedFiles(directory: string): Promise<string> {
        let content = '';
        const textFileExtensions = ['.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts', '.csv'];
        const codeFileExtensions = ['.py', '.java', '.c', '.cpp', '.h', '.go', '.rb', '.php', '.swift'];
        const allFileExtensions = [...textFileExtensions, ...codeFileExtensions];

        const readDir = async (dir: string) => {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await readDir(fullPath);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (allFileExtensions.includes(ext.toLowerCase()) || !ext) {
                        try {
                            const fileContent = await fs.promises.readFile(fullPath, 'utf8');
                            content += `--- ${path.relative(directory, fullPath)} ---\n${fileContent}\n\n`;
                        } catch (error) {
                            throw new Error(`Error reading file ${fullPath}: ${error}`);
                        }
                    }
                    if (ExcelExtractor.prototype.canHandle(fullPath)) {
                        const excelExtractor = new ExcelExtractor();
                        try {
                            const excelContent = await excelExtractor.extractContent(fullPath);
                            content += `--- ${path.relative(directory, fullPath)} ---\n${excelContent}\n\n`;
                        } catch (error) {
                            throw new Error(`Error reading Excel file ${fullPath}: ${error}`);
                        }
                    }
                }
            }
        };

        await readDir(directory);
        return content;
    }

    private cleanupTempDir(directory: string): void {
        try {
            fs.rmSync(directory, { recursive: true, force: true });
        } catch (error) {
            logger.warn(`Error cleaning up temp directory ${directory}: ${error}`);
        }
    }
}