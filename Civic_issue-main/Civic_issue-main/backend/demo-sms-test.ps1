# ========================================
# CivicVoice AI - SMS Demo Script
# TNWISE 2026 Presentation
# ========================================

Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   CivicVoice AI - SMS Demo Script     ║" -ForegroundColor Cyan
Write-Host "║         TNWISE 2026 Hackathon         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verify backend is running
Write-Host "Checking backend connection..." -ForegroundColor Yellow
try {
  $response = Invoke-WebRequest -Uri "http://localhost:5000" -ErrorAction Stop
  Write-Host "✅ Backend is running on port 5000" -ForegroundColor Green
} catch {
  Write-Host "❌ Backend is NOT running. Start it first:" -ForegroundColor Red
  Write-Host "   npm start" -ForegroundColor Yellow
  exit
}

Write-Host ""
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "DEMO SCENARIO 1: Road Infrastructure" -ForegroundColor Magenta
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

Write-Host "📱 Rural Citizen sends SMS:" -ForegroundColor Yellow
Write-Host "   'There is a big pothole on Main Street affecting daily commute'" -ForegroundColor White
Write-Host ""

Write-Host "🔄 Sending SMS to backend..." -ForegroundColor Cyan
curl -X POST http://localhost:5000/api/twilio/sms `
  -d "Body=There+is+a+big+pothole+on+Main+Street+affecting+daily+commute&From=%%2B919876543210" `
  -H "Content-Type: application/x-www-form-urlencoded"

Write-Host ""
Write-Host "⏳ Processing SMS..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "✅ SMS Processed! Check backend terminal for logs:" -ForegroundColor Green
Write-Host "   - [SMS RECEIVED] message" -ForegroundColor Green
Write-Host "   - [AI Callback initiated]" -ForegroundColor Green
Write-Host "   - Tracking ID generated" -ForegroundColor Green

Write-Host ""
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "DEMO SCENARIO 2: Water Supply Issue" -ForegroundColor Magenta
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

Write-Host "📱 Another Rural Citizen sends SMS:" -ForegroundColor Yellow
Write-Host "   'Water supply has been cut for three days in our village'" -ForegroundColor White
Write-Host ""

Write-Host "🔄 Sending SMS to backend..." -ForegroundColor Cyan
curl -X POST http://localhost:5000/api/twilio/sms `
  -d "Body=Water+supply+has+been+cut+for+three+days+in+our+village&From=%%2B919876543211" `
  -H "Content-Type: application/x-www-form-urlencoded"

Write-Host ""
Write-Host "⏳ Processing SMS..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "✅ SMS Processed! Check backend terminal for logs." -ForegroundColor Green

Write-Host ""
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "DEMO SCENARIO 3: Sanitation Complaint" -ForegroundColor Magenta
Write-Host "────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

Write-Host "📱 Third Rural Citizen sends SMS:" -ForegroundColor Yellow
Write-Host "   'Garbage collection is not happening in our locality for a week'" -ForegroundColor White
Write-Host ""

Write-Host "🔄 Sending SMS to backend..." -ForegroundColor Cyan
curl -X POST http://localhost:5000/api/twilio/sms `
  -d "Body=Garbage+collection+is+not+happening+in+our+locality+for+a+week&From=%%2B919876543212" `
  -H "Content-Type: application/x-www-form-urlencoded"

Write-Host ""
Write-Host "⏳ Processing SMS..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "✅ SMS Processed!" -ForegroundColor Green

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "🎉 DEMO COMPLETE - 3 Complaints Processed" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

Write-Host "📊 NEXT STEPS FOR JUDGES:" -ForegroundColor Cyan
Write-Host "  1. Check backend terminal for all SMS logs" -ForegroundColor White
Write-Host "  2. Open Admin Dashboard: http://localhost:3000" -ForegroundColor White
Write-Host "  3. View all 3 complaints with:" -ForegroundColor White
Write-Host "     - Auto-assigned categories (Road, Water, Sanitation)" -ForegroundColor White
Write-Host "     - Priority levels (High, Medium, Low)" -ForegroundColor White
Write-Host "     - AI-generated summaries" -ForegroundColor White
Write-Host "     - Fraud detection scores (should be Clean)" -ForegroundColor White
Write-Host "     - Tracking IDs for citizen follow-up" -ForegroundColor White
Write-Host "  4. Database: Check MongoDB for stored complaints" -ForegroundColor White
Write-Host ""

Write-Host "💡 KEY TALKING POINTS:" -ForegroundColor Yellow
Write-Host "  • SMS sent from Indian carrier → Our backend via curl simulation" -ForegroundColor White
Write-Host "  • AI processes text → Category, priority, summary auto-generated" -ForegroundColor White
Write-Host "  • Fraud detection → 4-layer hybrid detection (rules + AI)" -ForegroundColor White
Write-Host "  • Database persistence → MongoDB stores all complaint data" -ForegroundColor White
Write-Host "  • Department routing → Automated email sent to relevant officials" -ForegroundColor White
Write-Host "  • Citizen notification → AI callback with tracking ID (in production)" -ForegroundColor White
Write-Host ""

Write-Host "🚀 PRODUCTION NOTE:" -ForegroundColor Magenta
Write-Host "  This demo uses curl to simulate Twilio SMS (carrier-constrained)." -ForegroundColor White
Write-Host "  In production with Indian Twilio number, real SMS works identically." -ForegroundColor White
Write-Host ""
