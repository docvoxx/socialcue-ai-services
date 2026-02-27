// NOTE: node-llama-cpp is ESM-only and requires dynamic import or ESM setup
// Temporarily stubbed for deployment - will need proper ESM migration
// import { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import { createServiceLogger } from '@socialcue-ai-services/shared';
import fs from 'fs/promises';
import path from 'path';

export interface ModelConfig {
  name: string;
  path: string;
  version: string;
  contextSize: number;
  gpuLayers: number;
  threads: number;
}

export interface ModelMetrics {
  loadTime: number;
  memoryUsage: number;
  tokensPerSecond: number;
  lastUsed: Date;
}

// Stub types for node-llama-cpp
type LlamaModel = any;
type LlamaContext = any;
type LlamaChatSession = any;

export class ModelManager {
  private logger = createServiceLogger('model-manager');
  private models: Map<string, LlamaModel> = new Map();
  private contexts: Map<string, LlamaContext> = new Map();
  private sessions: Map<string, LlamaChatSession> = new Map();
  private currentModel: string | null = null;
  private modelConfigs: Map<string, ModelConfig> = new Map();
  private modelMetrics: Map<string, ModelMetrics> = new Map();
  private modelsPath: string;

  constructor() {
    this.modelsPath = process.env.MODELS_PATH || path.join(process.cwd(), '../../models');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Model Manager (STUB MODE - node-llama-cpp disabled)');
    
    try {
      await this.loadModelConfigs();
      // Stub: Skip actual model loading
      this.logger.warn('Model loading skipped - node-llama-cpp requires ESM migration');
      this.logger.info('Model Manager initialized successfully (stub mode)');
    } catch (error) {
      this.logger.error('Failed to initialize Model Manager', error as Error);
      throw error;
    }
  }

  private async loadModelConfigs(): Promise<void> {
    try {
      const configPath = path.join(this.modelsPath, 'config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const configs = JSON.parse(configData);
      
      for (const config of configs.models) {
        this.modelConfigs.set(config.name, config);
      }
      
      this.logger.info(`Loaded ${this.modelConfigs.size} model configurations`);
    } catch (error) {
      this.logger.warn('No model config found, using defaults');
      // Set default configuration
      this.modelConfigs.set('vistral-7b-v1.2', {
        name: 'vistral-7b-v1.2',
        path: path.join(this.modelsPath, 'vistral-7b-chat-q4_k_m.gguf'),
        version: '1.2',
        contextSize: 4096,
        gpuLayers: 35, // Optimized for 4GB VRAM
        threads: 4
      });
    }
  }

  async loadModel(modelName: string): Promise<void> {
    const startTime = Date.now();
    const config = this.modelConfigs.get(modelName);
    
    if (!config) {
      throw new Error(`Model configuration for ${modelName} not found`);
    }

    try {
      this.logger.info(`Loading model: ${modelName} (STUB MODE)`, { 
        service: 'llm-service',
        modelPath: config.path 
      });

      // STUB: Skip actual model loading
      // Store stub references
      this.models.set(modelName, {} as any);
      this.contexts.set(modelName, {} as any);

      // Record metrics
      const loadTime = Date.now() - startTime;
      this.modelMetrics.set(modelName, {
        loadTime,
        memoryUsage: process.memoryUsage().heapUsed,
        tokensPerSecond: 0,
        lastUsed: new Date()
      });

      this.logger.info(`Model ${modelName} loaded successfully (stub mode)`, {
        service: 'llm-service',
        loadTime: `${loadTime}ms`,
        memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
      });

    } catch (error) {
      this.logger.error(`Failed to load model ${modelName}`, error as Error);
      throw error;
    }
  }

  async unloadModel(modelName: string): Promise<void> {
    try {
      const model = this.models.get(modelName);
      const context = this.contexts.get(modelName);
      
      if (context) {
        // Note: dispose method may not be available in all llama.cpp versions
        // context.dispose();
        this.contexts.delete(modelName);
      }
      
      if (model) {
        // Note: dispose method may not be available in all llama.cpp versions  
        // model.dispose();
        this.models.delete(modelName);
      }

      // Clean up sessions for this model
      for (const [sessionId] of this.sessions.entries()) {
        if (sessionId.startsWith(modelName)) {
          this.sessions.delete(sessionId);
        }
      }

      this.modelMetrics.delete(modelName);
      
      this.logger.info(`Model ${modelName} unloaded successfully`);
    } catch (error) {
      this.logger.error(`Failed to unload model ${modelName}`, error as Error);
      throw error;
    }
  }

  async reloadModel(modelName: string): Promise<void> {
    this.logger.info(`Reloading model: ${modelName}`);
    
    if (this.models.has(modelName)) {
      await this.unloadModel(modelName);
    }
    
    await this.loadModel(modelName);
    
    if (this.currentModel === modelName) {
      this.logger.info(`Current model ${modelName} reloaded successfully`);
    }
  }

  async switchModel(modelName: string): Promise<void> {
    if (!this.modelConfigs.has(modelName)) {
      throw new Error(`Model ${modelName} not found in configurations`);
    }

    if (!this.models.has(modelName)) {
      await this.loadModel(modelName);
    }

    this.currentModel = modelName;
    this.logger.info(`Switched to model: ${modelName}`);
  }

  getCurrentModel(): string | null {
    return this.currentModel;
  }

  getModelConfig(modelName: string): ModelConfig | undefined {
    return this.modelConfigs.get(modelName);
  }

  getModelMetrics(modelName: string): ModelMetrics | undefined {
    return this.modelMetrics.get(modelName);
  }

  getAllModels(): string[] {
    return Array.from(this.modelConfigs.keys());
  }

  getLoadedModels(): string[] {
    return Array.from(this.models.keys());
  }

  async createChatSession(modelName?: string): Promise<string> {
    const targetModel = modelName || this.currentModel;
    
    if (!targetModel) {
      throw new Error('No model available for chat session');
    }

    const context = this.contexts.get(targetModel);
    if (!context) {
      throw new Error(`Context for model ${targetModel} not found`);
    }

    const sessionId = `${targetModel}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // STUB: Create stub session
    this.sessions.set(sessionId, {} as any);
    
    // Update last used time
    const metrics = this.modelMetrics.get(targetModel);
    if (metrics) {
      metrics.lastUsed = new Date();
    }

    this.logger.debug(`Created chat session: ${sessionId} (stub mode)`, { 
      service: 'llm-service',
      model: targetModel 
    });
    return sessionId;
  }

  getChatSession(sessionId: string): LlamaChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  async disposeChatSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.logger.debug(`Disposed chat session: ${sessionId}`);
    }
  }

  updateTokensPerSecond(modelName: string, tokensPerSecond: number): void {
    const metrics = this.modelMetrics.get(modelName);
    if (metrics) {
      metrics.tokensPerSecond = tokensPerSecond;
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Model Manager');
    
    // Dispose all sessions
    this.sessions.clear();
    
    // Dispose all contexts
    for (const _ of this.contexts.values()) {
      // Note: dispose method may not be available in all llama.cpp versions
      // context.dispose();
    }
    this.contexts.clear();
    
    // Dispose all models
    for (const _ of this.models.values()) {
      // Note: dispose method may not be available in all llama.cpp versions
      // model.dispose();
    }
    this.models.clear();
    
    this.logger.info('Model Manager cleanup completed');
  }
}