const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const API_URL = 'http://localhost:3080';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runVisualTest() {
  console.log('\n==================================================================');
  console.log('=== VISUAL & BROWSER E2E TEST (Playwright Chromium Headless) ===');
  console.log('==================================================================\n');

  console.log(`Target server: ${API_URL}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let testsFailed = 0;

  try {
    // TEST 1: Load main page & verify title
    console.log('TEST 1: Memuat Halaman Utama & Tab Audit');
    await page.goto(API_URL, { waitUntil: 'networkidle', timeout: 15000 });

    const headerTitle = await page.textContent('h1');
    if (headerTitle && headerTitle.includes('UHN ACADEMIC HELPER')) {
      console.log(`   ✅ BERHASIL: Judul terbaca "${headerTitle.trim()}"`);
    } else {
      console.error(`   ❌ GAGAL: Judul salah: "${headerTitle}"`);
      testsFailed++;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_tab_audit_default.png') });
    console.log('   📸 screenshots/01_tab_audit_default.png');
    console.log('------------------------------------------------');

    // TEST 2: Navigate to Humanizer tab
    console.log('TEST 2: Klik & Buka Tab Humanizer');
    await page.click('button:has-text("2. Humanize AI Text")');
    const humanizerHeader = page.locator('h2:has-text("Parafrase Anti-AI")');
    await humanizerHeader.waitFor({ state: 'visible', timeout: 3000 });
    if (await humanizerHeader.isVisible()) {
      console.log('   ✅ BERHASIL: Form Humanizer berhasil dimuat.');
    } else {
      console.error('   ❌ GAGAL: Tab Humanizer gagal dirender.');
      testsFailed++;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_tab_humanizer.png') });
    console.log('   📸 screenshots/02_tab_humanizer.png');
    console.log('------------------------------------------------');

    // TEST 3: Navigate to Generator tab (empty)
    console.log('TEST 3: Klik & Buka Tab Generator (Default)');
    await page.click('button:has-text("3. Generate Word Cover")');
    const generatorHeader = page.locator('h2:has-text("Identitas Dokumen Cover")');
    await generatorHeader.waitFor({ state: 'visible', timeout: 3000 });
    if (await generatorHeader.isVisible()) {
      console.log('   ✅ BERHASIL: Tab Generator berhasil dimuat.');
    } else {
      console.error('   ❌ GAGAL: Tab Generator gagal dirender.');
      testsFailed++;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_tab_generator_empty.png') });
    console.log('   📸 screenshots/03_tab_generator_empty.png');
    console.log('------------------------------------------------');

    // TEST 4: Fill form & verify live preview
    console.log('TEST 4: Pengisian Formulir Cover & Live Preview');
    await page.fill('input[placeholder="M. IRSYAD FACHRYANTO"]', 'M. IRSYAD FACHRYANTO');
    await page.fill('input[placeholder="23090111"]', '23090111');
    await page.fill('textarea[placeholder="IMPLEMENTASI SISTEM ANTREAN HYBRID PADA FEBRIAN BARBERSHOP..."]', 'IMPLEMENTASI SISTEM ANTREAN HYBRID DI FEBRIAN BARBERSHOP');
    await page.click('button:has-text("SKRIPSI")');
    await page.waitForTimeout(500);

    const previewText = await page.innerText('body');
    if (
      previewText.includes('M. IRSYAD FACHRYANTO') &&
      previewText.includes('23090111') &&
      previewText.includes('IMPLEMENTASI SISTEM ANTREAN HYBRID DI FEBRIAN BARBERSHOP')
    ) {
      console.log('   ✅ BERHASIL: Live Preview terupdate secara real-time!');
    } else {
      console.error('   ❌ GAGAL: Live Preview tidak sinkron.');
      testsFailed++;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_tab_generator_filled.png') });
    console.log('   📸 screenshots/04_tab_generator_filled.png');
    console.log('------------------------------------------------');

  } catch (err) {
    console.error('❌ CRITICAL ERROR:', err.message);
    testsFailed++;
  } finally {
    await browser.close();
  }

  console.log('\n=== RINGKASAN HASIL VISUAL & BROWSER E2E ===');
  if (testsFailed === 0) {
    console.log('🎉 SEMUA VISUAL TESTS LOLOS (4/4)!');
    console.log('   Screenshots: ./screenshots/');
    console.log('=============================================\n');
    process.exit(0);
  } else {
    console.error(`❌ ${testsFailed} PENGUJIAN GAGAL.`);
    console.log('=============================================\n');
    process.exit(1);
  }
}

runVisualTest();
