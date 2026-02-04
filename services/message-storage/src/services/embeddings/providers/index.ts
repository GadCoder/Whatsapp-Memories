import { IEmbeddingProvider, ProviderType } from '../types';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';

export interface ProviderConfig {
  provider: ProviderType;
  openai: {
    apiKey: string;
    model: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  debug?: boolean;
}

export function createEmbeddingProvider(
  type: ProviderType,
  config: ProviderConfig
): IEmbeddingProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
        debug: config.debug,
      });
    
    case 'gemini':
      if (!config.gemini.apiKey) {
        throw new Error('Gemini API key is required when using Gemini provider');
      }
      return new GeminiProvider({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        debug: config.debug,
      });
    
    default:
      throw new Error(`Unknown embedding provider: ${type}`);
  }
}
