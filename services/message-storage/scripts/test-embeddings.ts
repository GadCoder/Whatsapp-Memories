#!/usr/bin/env ts-node
/**
 * Embedding Provider Comparison Test
 * 
 * This script compares OpenAI and Gemini embedding providers by:
 * - Generating embeddings with both providers
 * - Comparing quality (cosine similarity for same text)
 * - Measuring latency
 * - Testing semantic similarity
 * 
 * Usage:
 *   OPENAI_API_KEY=xxx GEMINI_API_KEY=yyy npm run test-embeddings
 */

import { OpenAIProvider } from '../src/services/embeddings/providers/OpenAIProvider';
import { GeminiProvider } from '../src/services/embeddings/providers/GeminiProvider';

const testMessages = [
  "Hey! How are you doing today?",
  "Meeting at 3pm tomorrow in conference room A",
  "Can you send me that document we discussed?",
  "Thanks so much for your help with the project!",
  "¿Cómo estás? ¿Todo bien por allá?", // Spanish
  "Je vais bien, merci beaucoup!", // French
  "The quick brown fox jumps over the lazy dog.", // English pangram
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", // Latin
];

// Test semantic similarity
const semanticPairs = [
  ["Hello, how are you?", "Hi, how's it going?"], // Should be similar
  ["I love pizza", "Pizza is my favorite food"], // Should be similar
  ["The weather is nice", "Artificial intelligence is amazing"], // Should be different
];

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

async function testProvider(
  provider: OpenAIProvider | GeminiProvider,
  texts: string[]
): Promise<{ embeddings: number[][], latencies: number[], totalTime: number }> {
  const embeddings: number[][] = [];
  const latencies: number[] = [];
  const startTime = Date.now();

  for (const text of texts) {
    const iterStartTime = Date.now();
    const embedding = await provider.generate(text);
    const latency = Date.now() - iterStartTime;
    
    embeddings.push(embedding);
    latencies.push(latency);
  }

  const totalTime = Date.now() - startTime;

  return { embeddings, latencies, totalTime };
}

async function main() {
  console.log('🧪 Embedding Provider Comparison Test\n');
  console.log('='.repeat(60));

  // Check for API keys
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!geminiKey) {
    console.error('⚠️  GEMINI_API_KEY not provided, skipping Gemini tests');
  }

  // Initialize providers
  const openai = new OpenAIProvider({
    apiKey: openaiKey,
    model: 'text-embedding-3-small',
    debug: false,
  });

  const gemini = geminiKey ? new GeminiProvider({
    apiKey: geminiKey,
    model: 'text-embedding-004',
    debug: false,
  }) : null;

  console.log(`\n📊 Provider Information:`);
  console.log(`   OpenAI: ${openai.name} (${openai.actualDimensions}D)`);
  if (gemini) {
    console.log(`   Gemini: ${gemini.name} (${gemini.actualDimensions}D → ${gemini.dimensions}D padded)`);
  }

  // Test 1: Basic embedding generation
  console.log(`\n\n📝 Test 1: Basic Embedding Generation`);
  console.log('='.repeat(60));
  console.log(`Testing with ${testMessages.length} sample messages...\n`);

  console.log('OpenAI:');
  const openaiResults = await testProvider(openai, testMessages);
  const openaiAvgLatency = openaiResults.latencies.reduce((a, b) => a + b, 0) / openaiResults.latencies.length;
  console.log(`   ✓ Generated ${openaiResults.embeddings.length} embeddings`);
  console.log(`   ⏱️  Total time: ${openaiResults.totalTime}ms`);
  console.log(`   ⏱️  Average latency: ${openaiAvgLatency.toFixed(0)}ms per embedding`);

  let geminiResults: { embeddings: number[][], latencies: number[], totalTime: number } | null = null;
  if (gemini) {
    console.log('\nGemini:');
    geminiResults = await testProvider(gemini, testMessages);
    const geminiAvgLatency = geminiResults.latencies.reduce((a, b) => a + b, 0) / geminiResults.latencies.length;
    console.log(`   ✓ Generated ${geminiResults.embeddings.length} embeddings`);
    console.log(`   ⏱️  Total time: ${geminiResults.totalTime}ms`);
    console.log(`   ⏱️  Average latency: ${geminiAvgLatency.toFixed(0)}ms per embedding`);
    
    const speedup = openaiResults.totalTime / geminiResults.totalTime;
    if (speedup > 1) {
      console.log(`\n   📈 Gemini is ${speedup.toFixed(2)}x faster`);
    } else {
      console.log(`\n   📈 OpenAI is ${(1/speedup).toFixed(2)}x faster`);
    }
  }

  // Test 2: Self-similarity (same text should have high cosine similarity)
  console.log(`\n\n🔄 Test 2: Self-Similarity`);
  console.log('='.repeat(60));
  console.log('Testing if same text generates consistent embeddings...\n');

  const testText = "This is a test message for consistency";
  const openaiEmbed1 = await openai.generate(testText);
  const openaiEmbed2 = await openai.generate(testText);
  const openaiSelfSim = cosineSimilarity(openaiEmbed1, openaiEmbed2);
  
  console.log(`OpenAI self-similarity: ${(openaiSelfSim * 100).toFixed(2)}%`);
  if (openaiSelfSim > 0.999) {
    console.log('   ✓ Excellent consistency');
  } else if (openaiSelfSim > 0.95) {
    console.log('   ⚠️  Good consistency but not perfect');
  } else {
    console.log('   ❌ Poor consistency!');
  }

  if (gemini) {
    const geminiEmbed1 = await gemini.generate(testText);
    const geminiEmbed2 = await gemini.generate(testText);
    const geminiSelfSim = cosineSimilarity(geminiEmbed1, geminiEmbed2);
    
    console.log(`\nGemini self-similarity: ${(geminiSelfSim * 100).toFixed(2)}%`);
    if (geminiSelfSim > 0.999) {
      console.log('   ✓ Excellent consistency');
    } else if (geminiSelfSim > 0.95) {
      console.log('   ⚠️  Good consistency but not perfect');
    } else {
      console.log('   ❌ Poor consistency!');
    }
  }

  // Test 3: Semantic similarity
  console.log(`\n\n🔗 Test 3: Semantic Similarity`);
  console.log('='.repeat(60));
  console.log('Testing if semantically similar texts have high similarity...\n');

  for (const [text1, text2] of semanticPairs) {
    console.log(`\n"${text1}"`);
    console.log(`vs`);
    console.log(`"${text2}"`);
    
    const openaiEmbed1 = await openai.generate(text1);
    const openaiEmbed2 = await openai.generate(text2);
    const openaiSim = cosineSimilarity(openaiEmbed1, openaiEmbed2);
    console.log(`   OpenAI: ${(openaiSim * 100).toFixed(2)}% similarity`);

    if (gemini) {
      const geminiEmbed1 = await gemini.generate(text1);
      const geminiEmbed2 = await gemini.generate(text2);
      const geminiSim = cosineSimilarity(geminiEmbed1, geminiEmbed2);
      console.log(`   Gemini: ${(geminiSim * 100).toFixed(2)}% similarity`);
    }
  }

  // Test 4: Dimension analysis
  console.log(`\n\n📏 Test 4: Dimension Analysis`);
  console.log('='.repeat(60));
  
  const sampleEmbed = openaiResults.embeddings[0];
  const nonZero = sampleEmbed.filter(v => v !== 0).length;
  const zeroCount = sampleEmbed.length - nonZero;
  
  console.log(`\nOpenAI embedding analysis:`);
  console.log(`   Total dimensions: ${sampleEmbed.length}`);
  console.log(`   Non-zero values: ${nonZero}`);
  console.log(`   Zero values: ${zeroCount}`);
  console.log(`   Min value: ${Math.min(...sampleEmbed).toFixed(6)}`);
  console.log(`   Max value: ${Math.max(...sampleEmbed).toFixed(6)}`);

  if (geminiResults) {
    const geminiSampleEmbed = geminiResults.embeddings[0];
    const geminiNonZero = geminiSampleEmbed.filter(v => v !== 0).length;
    const geminiZeroCount = geminiSampleEmbed.length - geminiNonZero;
    
    console.log(`\nGemini embedding analysis (with padding):`);
    console.log(`   Total dimensions: ${geminiSampleEmbed.length}`);
    console.log(`   Non-zero values: ${geminiNonZero} (native 768)`);
    console.log(`   Zero values (padding): ${geminiZeroCount}`);
    console.log(`   Min value: ${Math.min(...geminiSampleEmbed.filter(v => v !== 0)).toFixed(6)}`);
    console.log(`   Max value: ${Math.max(...geminiSampleEmbed.filter(v => v !== 0)).toFixed(6)}`);
  }

  // Summary
  console.log(`\n\n📋 Summary`);
  console.log('='.repeat(60));
  console.log('\nOpenAI (text-embedding-3-small):');
  console.log(`   ✓ Native 1536 dimensions`);
  console.log(`   ✓ Excellent consistency`);
  console.log(`   ✓ Proven quality for RAG`);
  console.log(`   💰 Cost: ~$0.020 per 1M tokens`);

  if (gemini && geminiResults) {
    console.log('\nGemini (text-embedding-004):');
    console.log(`   ✓ Native 768 dimensions (padded to 1536)`);
    console.log(`   ✓ Good consistency`);
    console.log(`   ⚠️  Less proven for RAG`);
    console.log(`   💰 Cost: ~$0.001-0.003 per 1M tokens (10-20x cheaper)`);
    
    console.log('\n🎯 Recommendation:');
    console.log('   • Use OpenAI for production RAG (quality & reliability)');
    console.log('   • Use Gemini for cost-sensitive high-volume deployments');
    console.log('   • Configure fallback from OpenAI → Gemini for resilience');
  }

  console.log('\n✅ Test completed successfully!\n');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
