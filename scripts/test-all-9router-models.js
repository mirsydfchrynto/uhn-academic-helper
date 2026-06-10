import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ChatOpenAI } from '@langchain/openai';

const MODELS_TO_TEST = [
  'kr/claude-sonnet-4.5',
  'kr/claude-sonnet-4.5-thinking',
  'kr/claude-haiku-4.5',
  'kr/deepseek-3.2',
  'kr/qwen3-coder-next',
  'kr/glm-5',
  'kr/MiniMax-M2.5'
];

async function testModel(modelName) {
  const startTime = Date.now();
  try {
    const chat = new ChatOpenAI({
      modelName: modelName,
      apiKey: process.env.ROUTER_API_KEY || "9router",
      configuration: {
        baseURL: process.env.ROUTER_BASE_URL || "http://localhost:20128/v1"
      },
      temperature: 0.7,
      maxRetries: 0, // No retry during profiling
      timeout: 8000  // 8 seconds timeout per model test
    });

    const res = await chat.invoke("Sebutkan 3 kata kunci utama dalam penulisan draf proposal skripsi yang baik.");
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    return {
      model: modelName,
      success: true,
      duration: `${duration}s`,
      response: res.content.trim().substring(0, 120) + '...',
      error: null
    };
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    return {
      model: modelName,
      success: false,
      duration: `${duration}s`,
      response: null,
      error: err.message || String(err)
    };
  }
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('🏁 MEMULAI PROFILING & BENCHMARK MODEL 9ROUTER 🏁');
  console.log('====================================================\n');

  const results = [];
  for (const model of MODELS_TO_TEST) {
    console.log(`Menguji model: ${model}...`);
    const res = await testModel(model);
    results.push(res);
    if (res.success) {
      console.log(`✅ [SUKSES] ${model} merespon dalam ${res.duration}`);
    } else {
      console.log(`❌ [GAGAL] ${model} gagal setelah ${res.duration}: ${res.error}`);
    }
    console.log('----------------------------------------------------');
  }

  console.log('\n====================================================');
  console.log('📊 RINGKASAN URUTAN MODEL TERBAIK & BACKUP 📊');
  console.log('====================================================');
  
  const successfulModels = results.filter(r => r.success);
  const failedModels = results.filter(r => !r.success);

  if (successfulModels.length > 0) {
    console.log('\n✅ Model Aktif (Direkomendasikan untuk Rantai Fallback):');
    successfulModels.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.model} (Durasi: ${m.duration})`);
      console.log(`      Respon: "${m.response}"`);
    });
  } else {
    console.log('\n❌ Tidak ada model aktif. Silakan hubungkan Kiro AI atau OpenCode Free di dashboard 9router!');
  }

  if (failedModels.length > 0) {
    console.log('\n❌ Model Tidak Aktif / Error:');
    failedModels.forEach(m => {
      console.log(`   - ${m.model} (${m.duration}): ${m.error}`);
    });
  }
  console.log('====================================================\n');
}

runBenchmark();
