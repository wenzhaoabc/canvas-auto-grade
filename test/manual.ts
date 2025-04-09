import * as fs from 'fs';
import * as path from 'path';

import { GradingResult } from '../src/types';


export async function GeneratePeopleBook(): Promise<void> {
    const fileContent = await fs.promises.readFile('results/people.csv', 'utf-8')
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(',').map(header => header.trim());
    const results: Record<string, string>[] = []; // Initialize an empty array to store results
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(value => value.trim());
        const p: Record<string, string> = {};

        for (let j = 0; j < headers.length; j++) {
            const header = headers[j].trim();
            const value = values[j] ? values[j].trim() : '';
            p[header] = value;
        }
        results.push(p); // Push the object into the results array
    }

    const manualGradeBook: GradingResult[] = results.map((result) => {
        const studentId = result['student_id'];
        const grade = 6; // Default to 0 if parsing fails

        return {
            studentId,
            questionId: '233880',
            grade,
            comment: '', // Add feedback if needed
            gradedAt: new Date().toLocaleString(), // Use the current date and time
        };
    }
    );

    await fs.promises.writeFile(
        path.join('results', 'manual-grade-book.json'),
        JSON.stringify(manualGradeBook, null, 2),
    )

}

GeneratePeopleBook().then(() => {
    console.log('Manual grade book generated successfully!');
}).catch((error) => {
    console.error('Error generating manual grade book:', error);
});


export async function GeneratePeopleBookV2(): Promise<void> {
    const fileContent = await fs.promises.readFile('results/assignment_82751_grade.json', 'utf-8')
    const gre: GradingResult[] = JSON.parse(fileContent)

    // delete duplicate studentIds
    const uniqueStudentIds = new Set<string>();
    const stuIds: string[] = [];
    for (const result of gre) {
        if (!uniqueStudentIds.has(result.studentId)) {
            uniqueStudentIds.add(result.studentId);
            stuIds.push(result.studentId);
        }
    }


    const manualGradeBook: GradingResult[] = stuIds.map((stuId) => {
        const grade = 6; // Default to 0 if parsing fails

        return {
            studentId: stuId,
            questionId: '233880',
            grade,
            comment: '', // Add feedback if needed
            gradedAt: new Date().toLocaleString(), // Use the current date and time
        };
    }
    );

    await fs.promises.writeFile(
        path.join('results', 'manual-grade-book-v2.json'),
        JSON.stringify(manualGradeBook, null, 2),
    )

}

export async function MergeGradeBook(): Promise<void> {
    const fileContent = await fs.promises.readFile('results/assignment_82751_grade.json', 'utf-8')
    const manualGradeBook: GradingResult[] = JSON.parse(fileContent)

    const fileContent2 = await fs.promises.readFile('results/manual-grade-book-v2.json', 'utf-8')
    const manualGradeBookV2: GradingResult[] = JSON.parse(fileContent2)

    const mergedGradeBook = [...manualGradeBook, ...manualGradeBookV2]

    await fs.promises.writeFile(
        path.join('results', 'grade-book-82751.json'),
        JSON.stringify(mergedGradeBook, null, 2),
    )
    console.log('Merged grade book generated successfully!');

}