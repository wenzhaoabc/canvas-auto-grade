import * as fs from 'fs';
import * as path from 'path';
import { OpenAI } from 'openai';

import { config } from '../config';
import { logger } from '../utils/logger';

export class LLMService {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.llm.apiKey,
            baseURL: config.llm.baseUrl,
        });
    }

    async getResponse(prompt: string, system_prompt?: string): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: config.llm.model,
                messages: [
                    { role: 'system', content: system_prompt || config.llm.basePrompt },
                    { role: 'user', content: prompt }
                ],
                max_tokens: config.llm.maxTokens,
                stream: false,
                response_format: { type: 'json_object' },
            });

            if (!response.choices[0]?.message?.content) {
                throw new Error('Empty response from LLM');
            }

            logger.debug(`LLM response: ${response.choices[0].message.content}`);

            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error getting response from LLM:', error);
            throw error;
        }
    }
    async getResponseStream(prompt: string): Promise<ReadableStream> {
        try {
            const stream = await this.client.chat.completions.create({
                model: config.llm.model,
                messages: [
                    { role: 'system', content: config.llm.basePrompt },
                    { role: 'user', content: prompt }
                ],
                max_tokens: config.llm.maxTokens,
                stream: true,
            });

            return new ReadableStream({
                async start(controller) {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || '';
                        if (content) {
                            controller.enqueue(content);
                        }
                    }
                    controller.close();
                }
            });
        } catch (error) {
            console.error('Error getting response from LLM:', error);
            throw error;
        }
    }

    private async createBatchTask(
        folderPath: string,
    ): Promise<string> {
        const exists = async (path: string) => {
            try {
                await fs.promises.stat(path);
                return true;
            } catch (error) {
                return false;
            }
        }

        if (!(await exists(folderPath))) {
            await fs.promises.mkdir(folderPath, { recursive: true });
            logger.info(`Folder ${folderPath} created`);
        }

        const filePath = path.join(folderPath, `input_file.jsonl`);
        if (!(await exists(filePath))) {
            throw new Error(`No file named input_file.jsonl in the folder ${folderPath}`);
        }

        logger.info(`Locate the file input_file.jsonl, starting to upload...`);
        const fileCreated = await this.client.files.create({
            file: fs.createReadStream(filePath),
            purpose: 'batch',
        });
        const inputFileId = fileCreated.id;
        if (!inputFileId) {
            throw new Error('Upload input file failed, file ID not found in the response');
        }
        await fs.promises.writeFile(path.join(folderPath, `input_file_id.txt`), inputFileId, 'utf-8')
        logger.info(`Upload input file successfully, file ID: ${inputFileId}`);

        const batch = await this.client.batches.create({
            input_file_id: inputFileId,
            endpoint: '/v1/chat/completions', // /v1/chat/ds-test
            completion_window: "24h",
        });
        if (!batch.id) {
            throw new Error('Create batch task failed, batch ID not found in the response');
        }
        await fs.promises.writeFile(path.join(folderPath, `batch_id.txt`), batch.id, 'utf-8')
        logger.info(`Batch created successfully, batch_id: ${batch.id}`);

        return batch.id; // Return the batch ID to get results later
    }

    /**
     * Retrieve the result of a batch task.
     * 
     * @param folderPath - The path to the folder containing the files to be processed.
     * @param batchId - The ID of the batch to retrieve results for.
     * @throws Error if the batch task fails or if the output file is not found.
     * @returns  {string} - The path to the output file.
     */
    public async getBatchResult(
        folderPath: string,
        batchId: string,
    ): Promise<string> {
        const batchCompleted = await this.client.batches.retrieve(batchId);
        logger.info(`Batch process status: ${batchCompleted.status}`);
        if (batchCompleted.status === 'completed') {
            logger.info(`Batch completed successfully, batchId: ${batchId}`);
        }
        await fs.promises.writeFile(path.join(folderPath, `batch_completed.json`),
            JSON.stringify(batchCompleted, null, 2),
            'utf-8')

        const outputFileId = batchCompleted.output_file_id;
        const errorFileId = batchCompleted.error_file_id;
        if (outputFileId) {
            const outputFilePath = path.join(folderPath, 'output_file.jsonl');
            const outputFile = await this.client.files.content(outputFileId);
            const textContent = await outputFile.text();
            await fs.promises.writeFile(outputFilePath, textContent, 'utf-8');
            logger.info(`Output file saved successfully: ${outputFilePath}`);
            return outputFilePath; // Return the path to the output file
        } else {
            logger.error(`Batch task execute failed, error reason: ${batchCompleted.errors?.object || 'No error details'}`);
        }

        if (errorFileId) {
            const errorFilePath = path.join(folderPath, 'error_file.jsonl');
            const errorFile = await this.client.files.content(errorFileId);
            const textContent = await errorFile.text();
            await fs.promises.writeFile(errorFilePath, textContent, 'utf-8');
            logger.info(`Error file saved successfully: ${errorFilePath}`);
        }

        throw new Error(`Batch task execute failed, error reason: ${batchCompleted.errors?.object || 'No error details'}`);
    }

    /**
     * Batch process LLM requests using the OpenAI API.
     * 
     * @param folderPath - The path to the folder containing the files to be processed.
     * @returns filePath - The path to the processed file.
     */
    public async batchProcess(
        folderPath: string,
        waitForCompletion: boolean = true,
    ): Promise<string> {
        // create batch task
        const batchId = await this.createBatchTask(folderPath)
        if (!waitForCompletion) {
            return batchId; // Return the batch ID to get results later
        }

        // return until the batch is completed
        const checkStatus = new Promise<string>((resolve, reject) => {
            const interval = setInterval(async () => {
                try {
                    const batchStatus = await this.client.batches.retrieve(batchId);
                    logger.info(`Batch status: ${batchStatus.status}, progress: ${batchStatus.completed_at || 'in progress'}`);

                    if (batchStatus.status === 'completed') {
                        clearInterval(interval);
                        resolve(batchStatus.id); // Resolve with the batch ID to get results later
                    } else if (['failed', 'cancelled', 'expired'].includes(batchStatus.status)) {
                        clearInterval(interval);
                        resolve(batchStatus.id); // Resolve with the batch ID to get results later
                        // reject(new Error(`Batch ${batchStatus.status}: ${batchStatus.errors?.data || 'No error details'}`));
                    }
                } catch (error) {
                    clearInterval(interval);
                    reject(new Error(`Error checking batch status: ${error}`));
                }
            }, 60000); // 1 minute interval

            // Add timeout after 24 hours
            setTimeout(() => {
                clearInterval(interval);
                reject(new Error('Batch processing timeout after 24 hours'));
            }, 24 * 60 * 60 * 1000);
        });

        await checkStatus;

        return this.getBatchResult(folderPath, batchId);
    }
}