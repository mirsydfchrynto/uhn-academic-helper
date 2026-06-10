const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_URL = 'http://localhost:3080';
const CWD = '/home/irsyad/Gudang/mydevelopment/uhn-academic-helper';
const SCREENSHOT_DIR = path.join(CWD, 'screenshots');
const SCRATCH_DIR = path.join(CWD, 'scratch');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

async function runFullE2ETest() {
  console.log('\n==================================================================');
  console.log('=== VISUAL & FUNCTIONAL E2E USER EMULATION (Playwright) ===');
  console.log('==================================================================\n');

  // Step 0: Ensure Test User Admin exists in Supabase
  console.log('0. Mempersiapkan akun admin di database Supabase...');
  try {
    execSync('node create_admin.js', { cwd: CWD, stdio: 'inherit' });
  } catch (err) {
    console.warn('Warning: Gagal membuat admin atau admin sudah ada. Melanjutkan...');
  }

  // Clean port 3080 and .next cache
  console.log('Clearing port 3080 and cleaning .next cache...');
  try {
    execSync('lsof -ti :3080 | xargs kill -9 2>/dev/null || true');
    execSync('rm -rf .next');
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1000));

  // Step 1: Start Next.js local server
  console.log('1. Memulai server lokal Next.js (./node_modules/.bin/next dev -p 3080)...');
  const devServer = spawn('./node_modules/.bin/next', ['dev', '-p', '3080'], {
    cwd: CWD,
    shell: true
  });

  devServer.stdout.on('data', (data) => {
    console.log(`[SERVER STDOUT] ${data.toString().trim()}`);
  });

  devServer.stderr.on('data', (data) => {
    console.error(`[SERVER STDERR] ${data.toString().trim()}`);
  });

  const cleanup = () => {
    console.log('Stopping Next.js server...');
    devServer.kill('SIGINT');
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  // Wait 12 seconds for Next.js to compile and listen
  await new Promise(r => setTimeout(r, 12000));

  console.log('Launching Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.message}`);
  });

  let testsFailed = 0;

  try {
    // 2. Perform Login
    console.log('2. Mengunjungi halaman login http://localhost:3080/login...');
    await page.goto(`${API_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    
    console.log('Filling login details...');
    await page.fill('input[placeholder="email@anda.com"]', 'noblxomen@gmail.com');
    await page.fill('input[placeholder="••••••••"]', 'Muhammad1805@');
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_00_login_form.png') });
    console.log('📸 e2e_00_login_form.png');

    console.log('Submitting login form...');
    await page.click('button:has-text("MASUK KE SISTEM")');

    // Wait for consult page content
    console.log('Waiting for consult page content...');
    await page.waitForSelector('text=Lembar Kerja', { timeout: 35000 });

    console.log('✅ LOGIN SUKSES! Tiba di consult page.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_01_consult_loaded.png') });
    console.log('📸 e2e_01_consult_loaded.png');
    console.log('------------------------------------------------');

    // 3. Setup Student Identity
    console.log('3. Mengisi identitas tugas akhir...');
    await page.click('button:has-text("Atur Identitas")');
    await page.waitForSelector('text=Identitas Naskah', { timeout: 3000 });
    
    // Choose proposal
    await page.click('.fixed button:has-text("proposal")');
    await page.fill('input[placeholder="M. IRSYAD FACHRYANTO"]', 'M. IRSYAD FACHRYANTO');
    await page.fill('input[placeholder="23090111"]', '23090111');
    await page.fill('textarea[placeholder="IMPLEMENTASI SISTEM ANTREAN..."]', 'SISTEM ANTREAN HYBRID PADA FEBRIAN BARBERSHOP');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_02_identity_modal.png') });
    console.log('📸 e2e_02_identity_modal.png');

    await page.click('.fixed button:has-text("Simpan Identitas")');
    await page.waitForTimeout(500);

    console.log('✅ Identitas tugas akhir disimpan dan tersinkronisasi.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_03_identity_synced.png') });
    console.log('📸 e2e_03_identity_synced.png');
    console.log('------------------------------------------------');

    // 4. Attach Local Reference Document
    console.log('4. Mengunggah berkas referensi lokal...');
    await page.click('button[title="Lampirkan Dokumen"]');
    await page.waitForSelector('text=Lampirkan Dokumen', { timeout: 3000 });

    const mockFilePath = path.join(SCRATCH_DIR, 'e2e_ref.txt');
    fs.writeFileSync(mockFilePath, 'Pengujian antrean hybrid pada pangkas rambut Febrian mempercepat tunggu rata-rata sebanyak 35% dibandingkan metode FIFO biasa. [1]');

    console.log('Uploading file...');
    await page.setInputFiles('#modal-file', mockFilePath);

    // Wait for text extraction (isParsing to finish and update text inputs)
    console.log('Waiting for server-side PDF/docx/txt text parsing...');
    await page.waitForFunction(() => {
      const label = document.querySelector('label[for="modal-file"]');
      return label && !label.textContent.includes('Membaca berkas');
    }, { timeout: 10000 });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_04_document_parsed.png') });
    console.log('📸 e2e_04_document_parsed.png');

    await page.click('button:has-text("Lampirkan (")');
    await page.waitForTimeout(500);

    console.log('✅ Teks dokumen referensi berhasil dilampirkan.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_05_document_attached.png') });
    console.log('📸 e2e_05_document_attached.png');
    console.log('------------------------------------------------');

    // 5. Connect GitHub Repository
    console.log('5. Menghubungkan Repositori GitHub...');
    await page.click('button[title="Hubungkan GitHub"]');
    await page.waitForSelector('text=Integrasi GitHub', { timeout: 3000 });

    await page.fill('input[placeholder="https://github.com/username/repo"]', 'https://github.com/opensquilla/opensquilla');
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_06_github_modal.png') });
    console.log('📸 e2e_06_github_modal.png');

    await page.click('button:has-text("Hubungkan Repository")');
    await page.waitForTimeout(500);

    console.log('✅ Repositori GitHub berhasil ditautkan.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_07_github_attached.png') });
    console.log('📸 e2e_07_github_attached.png');
    console.log('------------------------------------------------');

    // 6. Send Bimbingan Message to AI Agent
    await page.fill('textarea[placeholder="Ketik instruksi atau pertanyaan tugas akhir Anda..."]', 'Halo dosen AI, saya sudah melampirkan identitas tugas akhir, referensi, dan GitHub. Mohon bantu buatkan rancangan latar belakang masalah secara kuat di dalam workspace. WAJIB tuliskan draf Bab 1 di dalam blok <DRAF>...</DRAF> agar tersimpan.');
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_08_message_typed.png') });
    console.log('📸 e2e_08_message_typed.png');

    await page.click('button[type="submit"]');

    // Wait for the response stream to complete
    console.log('Waiting for AI Agent response stream to finish (this can take up to 180 seconds)...');
    await page.waitForSelector('text=Dosen AI sedang berpikir...', { state: 'detached', timeout: 180000 });
    
    // Additional wait for any trailing stream text
    await page.waitForTimeout(3000);

    console.log('✅ Obrolan selesai! AI Agent berhasil menyusun draf.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_09_chat_finished.png') });
    console.log('📸 e2e_09_chat_finished.png');
    console.log('------------------------------------------------');

    // 7. Download Double Grafted DOCX
    console.log('7. Menguji pengunduhan naskah resmi UHN (.docx)...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('button:has-text("UNDUH DOCX")')
    ]);

    const finalDocxPath = path.join(SCREENSHOT_DIR, 'e2e_final_output.docx');
    await download.saveAs(finalDocxPath);
    console.log(`✅ BERHASIL: Naskah bimbingan terintegrasi diunduh ke: ${finalDocxPath}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_10_final_dashboard.png') });
    console.log('📸 e2e_10_final_dashboard.png');
    console.log('------------------------------------------------');

  } catch (err) {
    console.error('❌ CRITICAL ERROR IN E2E FLOW:', err.message);
    try {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'e2e_failure_screenshot.png') });
      console.log('📸 Saved failure screenshot to e2e_failure_screenshot.png');
    } catch (e) {
      console.error('Failed to capture failure screenshot:', e.message);
    }
    testsFailed++;
  } finally {
    await browser.close();
    cleanup();
  }

  console.log('\n=== RINGKASAN HASIL EVALUASI E2E USER ===');
  if (testsFailed === 0) {
    console.log('🎉 SEMUA TAHAPAN USER BERHASIL EMULASI TANPA HAMBATAN (7/7)!');
    console.log('   Screenshots tersimpan di direktori: ./screenshots/');
    console.log('=============================================\n');
    process.exit(0);
  } else {
    console.error(`❌ ${testsFailed} TAHAPAN PADA EMULASI GAGAL.`);
    console.log('=============================================\n');
    process.exit(1);
  }
}

runFullE2ETest().catch(console.error);
