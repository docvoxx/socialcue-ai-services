import { createServiceLogger } from '@socialcue-ai-services/shared';
import { UserStyle, RAGContext } from '@socialcue-ai-services/shared';
import fs from 'fs/promises';
import path from 'path';

export interface PromptTemplate {
  name: string;
  version: string;
  template: string;
  variables: string[];
  description: string;
}

export interface PromptContext {
  conversation_context: string;
  rag_context: RAGContext;
  user_style: UserStyle;
  constraints: string[];
  scenario?: string;
  goal?: string;
  tone?: string;
}

export class PromptManager {
  private logger = createServiceLogger('prompt-manager');
  private templates: Map<string, PromptTemplate> = new Map();
  private currentVersion: string = 'v2.1';
  private promptsPath: string;

  constructor() {
    this.promptsPath = process.env.PROMPTS_PATH || path.join(process.cwd(), 'prompts');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Prompt Manager');
    
    try {
      await this.loadPromptTemplates();
      this.logger.info('Prompt Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Prompt Manager', error as Error);
      // Initialize with default templates if loading fails
      this.initializeDefaultTemplates();
    }
  }

  private async loadPromptTemplates(): Promise<void> {
    try {
      const templatesPath = path.join(this.promptsPath, 'templates.json');
      const templatesData = await fs.readFile(templatesPath, 'utf-8');
      const templates = JSON.parse(templatesData);
      
      for (const template of templates.prompts) {
        this.templates.set(template.name, template);
      }
      
      this.logger.info(`Loaded ${this.templates.size} prompt templates`);
    } catch (error) {
      this.logger.warn('No prompt templates file found, using defaults');
      throw error;
    }
  }

  private initializeDefaultTemplates(): void {
    // Default Vietnamese conversation suggestion template
    const defaultTemplate: PromptTemplate = {
      name: 'suggest-vietnamese',
      version: this.currentVersion,
      template: `Bạn là một trợ lý AI chuyên về giao tiếp tiếng Việt. Nhiệm vụ của bạn là đưa ra 3 gợi ý trả lời (A, B, C) cho cuộc hội thoại sau.

NGỮ CẢNH CUỘC HỘI THOẠI:
{{conversation_context}}

THÔNG TIN BỔ SUNG:
{{rag_context}}

PHONG CÁCH NGƯỜI DÙNG:
- Mức độ từ vựng: {{user_style.vocabulary_level}}
- Sử dụng emoji: {{user_style.emoji_usage}}
- Độ dài tin nhắn: {{user_style.message_length}}
- Cách xưng hô: {{user_style.addressing_style}}
- Tông giọng ưa thích: {{user_style.preferred_tones}}

{{#if scenario}}TÌNH HUỐNG: {{scenario}}{{/if}}
{{#if goal}}MỤC TIÊU: {{goal}}{{/if}}
{{#if tone}}TÔNG GIỌNG: {{tone}}{{/if}}

{{#if constraints}}
RÀNG BUỘC:
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}

Hãy tạo ra 3 gợi ý trả lời khác nhau (A, B, C) với:
1. Mỗi gợi ý phải phù hợp với ngữ cảnh và phong cách người dùng
2. 3 gợi ý phải có sự khác biệt về tông giọng và cách tiếp cận
3. Mỗi gợi ý kèm theo giải thích ngắn gọn (tối đa 80 ký tự)
4. Gán điểm từ 0.0 đến 1.0 cho mỗi gợi ý
5. Thêm tối đa 5 thẻ tag cho mỗi gợi ý

Trả lời theo định dạng JSON:
{
  "candidates": [
    {
      "id": "A",
      "text": "...",
      "tags": ["tag1", "tag2"],
      "score": 0.95,
      "explanation": "..."
    },
    {
      "id": "B", 
      "text": "...",
      "tags": ["tag1", "tag2"],
      "score": 0.87,
      "explanation": "..."
    },
    {
      "id": "C",
      "text": "...", 
      "tags": ["tag1", "tag2"],
      "score": 0.82,
      "explanation": "..."
    }
  ]
}`,
      variables: ['conversation_context', 'rag_context', 'user_style', 'constraints', 'scenario', 'goal', 'tone'],
      description: 'Main template for generating Vietnamese conversation suggestions'
    };

    this.templates.set(defaultTemplate.name, defaultTemplate);
    this.logger.info('Initialized with default prompt templates');
  }

  buildPrompt(templateName: string, context: PromptContext): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Prompt template ${templateName} not found`);
    }

    let prompt = template.template;

    // Replace conversation context
    prompt = prompt.replace(/\{\{conversation_context\}\}/g, context.conversation_context);

    // Replace RAG context
    const ragContextText = this.formatRAGContext(context.rag_context);
    prompt = prompt.replace(/\{\{rag_context\}\}/g, ragContextText);

    // Replace user style
    prompt = prompt.replace(/\{\{user_style\.vocabulary_level\}\}/g, context.user_style.vocabulary_level);
    prompt = prompt.replace(/\{\{user_style\.emoji_usage\}\}/g, context.user_style.emoji_usage);
    prompt = prompt.replace(/\{\{user_style\.message_length\}\}/g, context.user_style.message_length);
    prompt = prompt.replace(/\{\{user_style\.addressing_style\}\}/g, context.user_style.addressing_style);
    prompt = prompt.replace(/\{\{user_style\.preferred_tones\}\}/g, context.user_style.preferred_tones.join(', '));

    // Handle conditional sections
    prompt = this.handleConditionals(prompt, {
      scenario: context.scenario,
      goal: context.goal,
      tone: context.tone,
      constraints: context.constraints
    });

    return prompt;
  }

  private formatRAGContext(ragContext: RAGContext): string {
    if (!ragContext.chunks || ragContext.chunks.length === 0) {
      return 'Không có thông tin bổ sung.';
    }

    const formattedChunks = ragContext.chunks.map((chunk, index) => {
      return `${index + 1}. [${chunk.kb_type.toUpperCase()}] ${chunk.content} (độ liên quan: ${chunk.score.toFixed(2)})`;
    }).join('\n');

    return `Thông tin liên quan (${ragContext.chunks.length} mục, ${ragContext.total_tokens} tokens):\n${formattedChunks}`;
  }

  private handleConditionals(prompt: string, context: any): string {
    // Handle {{#if scenario}} blocks
    prompt = prompt.replace(/\{\{#if scenario\}\}(.*?)\{\{\/if\}\}/gs, (_, content) => {
      return context.scenario ? content.replace(/\{\{scenario\}\}/g, context.scenario) : '';
    });

    // Handle {{#if goal}} blocks
    prompt = prompt.replace(/\{\{#if goal\}\}(.*?)\{\{\/if\}\}/gs, (_, content) => {
      return context.goal ? content.replace(/\{\{goal\}\}/g, context.goal) : '';
    });

    // Handle {{#if tone}} blocks
    prompt = prompt.replace(/\{\{#if tone\}\}(.*?)\{\{\/if\}\}/gs, (_, content) => {
      return context.tone ? content.replace(/\{\{tone\}\}/g, context.tone) : '';
    });

    // Handle {{#if constraints}} blocks
    prompt = prompt.replace(/\{\{#if constraints\}\}(.*?)\{\{\/if\}\}/gs, (_, content) => {
      if (!context.constraints || context.constraints.length === 0) return '';
      
      // Handle {{#each constraints}} blocks within
      const processedContent = content.replace(/\{\{#each constraints\}\}(.*?)\{\{\/each\}\}/gs, (_: string, eachContent: string) => {
        return context.constraints.map((constraint: string) => 
          eachContent.replace(/\{\{this\}\}/g, constraint)
        ).join('');
      });
      
      return processedContent;
    });

    return prompt;
  }

  getTemplate(templateName: string): PromptTemplate | undefined {
    return this.templates.get(templateName);
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  async reloadTemplates(): Promise<void> {
    this.logger.info('Reloading prompt templates');
    this.templates.clear();
    await this.loadPromptTemplates();
  }

  async updateTemplate(template: PromptTemplate): Promise<void> {
    this.templates.set(template.name, template);
    this.logger.info(`Updated prompt template: ${template.name}`, { 
      service: 'llm-service',
      version: template.version 
    });
  }

  validateTemplate(template: PromptTemplate): boolean {
    // Basic validation
    if (!template.name || !template.version || !template.template) {
      return false;
    }

    // Check if all required variables are present in template
    const requiredVars = ['conversation_context', 'rag_context', 'user_style'];
    for (const variable of requiredVars) {
      if (!template.template.includes(`{{${variable}}`) && !template.template.includes(`{{user_style.`)) {
        return false;
      }
    }

    return true;
  }

  // A/B testing support
  async setTemplateVersion(templateName: string, version: string): Promise<void> {
    const template = this.templates.get(templateName);
    if (template) {
      template.version = version;
      this.logger.info(`Set template ${templateName} to version ${version}`);
    }
  }

  getTemplatesByVersion(version: string): PromptTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.version === version);
  }
}