import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

// The AppSetting key under which the AI analysis prompt is stored.
const AI_PROMPT_KEY = 'ai_analysis_prompt';

// The default AI analysis prompt. This is the single source of truth for the
// out-of-the-box instructions; the admin panel can override it, and "Reset to
// default" restores this exact text. Keep the heading format intact so the app
// can render star-rated sections (the UI degrades to plain text if it changes).
export const DEFAULT_AI_ANALYSIS_PROMPT = `You are an AI assistant for CaseOps, a public-records research platform that evaluates police/incident reports for video content potential.

Your task is to analyze the provided incident report and score it across four criteria, then provide an overall rating and a factual incident summary.

Score each criterion from 1 (weak) to 5 (exceptional):

1. Story Strength and Depth — Is there a clear narrative with a beginning, middle, and end? Are the people, motives, and events substantial enough to sustain a compelling story rather than a thin blotter item?

2. Stakes and Retention Potential — How high are the stakes (harm, injustice, danger, consequence)? Would the events hook a viewer and hold attention to the end?

3. Available Material and Video Length — Judging only from this report, how much usable material likely exists (bodycam, interviews, documents, timeline detail) and roughly how long a video it could support?

4. Unique or Surprising Element — Is there an unusual, ironic, or unexpected twist that sets this apart from routine cases?

Format your response EXACTLY as follows (use the headings verbatim):

**1. Story Strength and Depth — X/5**
[Your explanation]

**2. Stakes and Retention Potential — X/5**
[Your explanation]

**3. Available Material and Video Length — X/5**
[Your explanation]

**4. Unique or Surprising Element — X/5**
[Your explanation]

**Overall Rating: X/5**
[One-paragraph overall assessment noting the case's strongest and weakest points and whether it's recommended for production.]

**Incident Summary**
[A concise, strictly factual summary of what the report describes. Do not invent details that are not in the report.]

Replace each X with an integer from 1 to 5. Base every judgment only on the report text provided; if the report is thin or missing information, say so and score accordingly.`;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // Returns the effective prompt plus whether it's a custom override, so the
  // admin UI can show a "using default / customized" state and offer a reset.
  async getAiPrompt() {
    let row: any = null;
    try {
      row = await this.prisma.appSetting.findUnique({
        where: { key: AI_PROMPT_KEY },
      });
    } catch {
      row = null;
    }
    const isCustom = !!(row && row.value && row.value.trim());
    return {
      success: true,
      data: {
        prompt: isCustom ? row.value : DEFAULT_AI_ANALYSIS_PROMPT,
        isCustom,
        default: DEFAULT_AI_ANALYSIS_PROMPT,
        updatedAt: row?.updatedAt ?? null,
      },
    };
  }

  async setAiPrompt(prompt: string, userId?: number) {
    const value = (prompt ?? '').toString();
    const row = await this.prisma.appSetting.upsert({
      where: { key: AI_PROMPT_KEY },
      update: { value, updatedById: userId ?? null },
      create: { key: AI_PROMPT_KEY, value, updatedById: userId ?? null },
    });
    return {
      success: true,
      message: 'AI analysis prompt updated',
      data: { prompt: row.value, isCustom: true, updatedAt: row.updatedAt },
    };
  }

  // Reset = remove the override so the built-in default takes over again.
  async resetAiPrompt() {
    await this.prisma.appSetting
      .delete({ where: { key: AI_PROMPT_KEY } })
      .catch(() => null);
    return {
      success: true,
      message: 'AI analysis prompt reset to default',
      data: { prompt: DEFAULT_AI_ANALYSIS_PROMPT, isCustom: false },
    };
  }
}
