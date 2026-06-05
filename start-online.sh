#!/bin/bash
# Jalankan aplikasi WINS Timbangan + tunnel publik via ngrok
# Setelah dijalankan, aplikasi bisa diakses dari mana saja via URL ngrok

export PATH="/opt/homebrew/bin:$PATH"

DIR="$(dirname "$(realpath "$0")")"
cd "$DIR"

echo ""
echo "🌿 WINS Timbangan — PT Wins Sawit (Online Mode)"
echo "════════════════════════════════════════════════════"

# Matikan proses sebelumnya
echo "▶ Membersihkan sesi lama..."
pkill -f "node server.js" 2>/dev/null
pkill -f "ngrok http" 2>/dev/null
sleep 1

# Build frontend kalau belum ada
if [ ! -d "frontend/dist" ]; then
  echo "▶ Build frontend production (sekali saja)..."
  cd frontend
  npm run build
  cd ..
fi

# Start backend production mode
echo "▶ Menjalankan backend (port 3001)..."
cd backend
NODE_ENV=production node server.js > /tmp/wins-backend.log 2>&1 &
BACKEND_PID=$!
cd ..
sleep 3

# Start ngrok tunnel
echo "▶ Membuka tunnel ngrok..."
nohup ngrok http 3001 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
sleep 4

# Ambil URL public
URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

echo ""
echo "════════════════════════════════════════════════════"
echo "✅ APLIKASI ONLINE — bisa diakses dari mana saja!"
echo "════════════════════════════════════════════════════"
echo ""
echo "🌐 URL Online      : $URL"
echo "🏠 URL Lokal Mac   : http://localhost:3001"
echo "📱 URL WiFi Lokal  : http://192.168.1.2:3001"
echo ""
echo "👤 Akun Default:"
echo "   admin    / admin123     (Administrator)"
echo "   manajer  / manajer123   (Manajer)"
echo "   operator / operator123  (Operator Timbangan)"
echo ""
echo "💡 Untuk berhenti: tekan Ctrl+C"
echo "════════════════════════════════════════════════════"
echo ""

# Trap Ctrl+C untuk cleanup
trap "echo ''; echo '⏹  Mematikan aplikasi...'; kill $BACKEND_PID $NGROK_PID 2>/dev/null; pkill -f 'node server.js' 2>/dev/null; pkill -f 'ngrok http' 2>/dev/null; exit" INT

# Tunggu sampai Ctrl+C
wait
