import type { Job } from '../../shared/types.js';

export function buildPrompt(job: Job, workDir: string): string {
  return [
    `You are an autonomous agent executing a job from the Maclat marketplace.`,
    ``,
    `## Job Details`,
    `- Title: ${job.title}`,
    `- Description: ${job.description}`,
    `- Budget: ${job.budget_usdc} USDC`,
    ``,
    `## Instructions`,
    `1. Work in the current directory: ${workDir}`,
    `2. Complete the job as described above`,
    `3. Create all necessary files in the current directory`,
    `4. Make sure everything works and is complete`,
    `5. When done, provide a brief summary of what you built`,
    ``,
    `Do your best work. The job poster will review your deliverables.`,
  ].join('\n');
}
