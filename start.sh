#!/bin/bash
# Jalankan aplikasi WINS Timbangan

export PATH="/opt/homebrew/bin:$PATH"

echo ""
echo "🌿 WINS Timbangan — PT Wins Sawit"
echo "=================================="

# Matikan proses sebelumnya jika ada
pkill -f "node server.js" 2>/dev/null
pkill -f "vite --host" 2>/dev/null
sleep 1

# Start backend
echo "▶ Menjalankan Backend (API)..."
cd "$(dirname "$0")/backend"
node server.js &
BACKEND_PID=$!
sleep 2

# Start frontend
echo "▶ Menjalankan Frontend (Web)..."
cd "$(dirname "$0")/frontend"
npm run dev -- --host &
FRONTEND_PID=$!
sleep 3

echo ""
echo "✅ Aplikasi siap digunakan!"
echo ""
echo "   🌐 Buka di browser: http://localhost:5173"
echo ""
echo "   👤 Akun Login:"
echo "      admin    / admin123     (Administrator)"
echo "      operator / operator123  (Operator)"
echo "      manajer  / manajer123   (Manajer)"
echo ""
echo "   Tekan Ctrl+C untuk menghentikan aplikasi."
echo ""

# Tunggu sampai Ctrl+C
trap "echo ''; echo 'Menghentikan aplikasi...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
