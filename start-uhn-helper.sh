#!/bin/bash

# UHN Academic Helper CLI Controller
# Skenario pengujian & eksekusi instan untuk Sekolah Vokasi UHN

# ANSI colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

clear
echo -e "${BLUE}================================================================${NC}"
echo -e "${YELLOW}               UHN ACADEMIC HELPER - DASHBOARD UTAMA            ${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "Pilih opsi menu di bawah ini:"
echo -e " ${GREEN}1)${NC} Jalankan Web App (Mode Development - Port 3000)"
echo -e " ${GREEN}2)${NC} Jalankan Uji Integrasi API (Port 3080)"
echo -e " ${GREEN}3)${NC} Jalankan Uji Browser Otomatis & Visual (Playwright - Port 3080)"
echo -e " ${GREEN}4)${NC} Keluar"
echo -e "${BLUE}================================================================${NC}"
read -p "Masukkan pilihan Anda (1-4): " choice

case $choice in
  1)
    echo -e "\n${GREEN}[INFO]${NC} Memulai aplikasi web UHN Academic Helper..."
    echo -e "${YELLOW}[INFO]${NC} Silakan buka http://localhost:3000 di browser Anda."
    npm run dev
    ;;
  2)
    echo -e "\n${GREEN}[INFO]${NC} Menjalankan API Integration E2E Test Suite..."
    node scripts/e2e-test-runner.js
    ;;
  3)
    echo -e "\n${GREEN}[INFO]${NC} Menjalankan Visual & Browser E2E Test Suite (Playwright)..."
    node scripts/playwright-full-e2e.js
    ;;
  4)
    echo -e "\n${BLUE}[INFO]${NC} Terima kasih! Selesai."
    exit 0
    ;;
  *)
    echo -e "\n${RED}[EROR]${NC} Pilihan tidak valid. Silakan jalankan ulang script ini."
    exit 1
    ;;
esac
