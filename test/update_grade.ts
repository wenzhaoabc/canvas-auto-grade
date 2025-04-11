// This script is used to update the grading results for the course "计算机原理" and "不存在的书"
import * as fs from 'fs';
import { logger } from '../src/utils/logger';

import { GradingResult } from '../src/types';

export async function UpdateGradingRes(): Promise<void> {
    try {
        const filepath = "results/grade-book-85832.json";
        const conetnt = await fs.promises.readFile(filepath, 'utf-8');
        const grs: GradingResult[] = JSON.parse(conetnt);

        const n_grs: GradingResult[] = grs.map(gr => {
            let grade = gr.grade;
            if (gr.comment.includes('计算机原理') || gr.comment.includes('不存在的书')) {
                if (grade < 10) {
                    grade += 0.5;
                }
            }

            return {
                ...gr,
                grade: grade > 10 ? 10 : grade
            }
        });

        await fs.promises.writeFile("results/grade-book-85832-up.json", JSON.stringify(n_grs, null, 2), 'utf-8');

    } catch (error) {
        logger.error(`Error: ${error}`);
    }

    logger.info('Grading process completed successfully');

}
