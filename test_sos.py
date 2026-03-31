import requests
import os
import socket
from dotenv import load_dotenv

# Load configuration
load_dotenv('backend/.env')

TARGET_NUMBER = os.getenv('SOS_TARGET_NUMBER') or os.getenv('TWILIO_PHONE_NUMBER')
SERVER_URL = os.getenv('SERVER_URL', 'http://localhost:5000')

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
        s.close()
        return IP
    except Exception:
        return '127.0.0.1'

print("--- Testing SOS Trigger Directly ---")
print(f"Server URL: {SERVER_URL}")
print(f"Target Number: {TARGET_NUMBER}")

if not TARGET_NUMBER:
    print("❌ Error: Target number is missing in .env")
    exit(1)

ip = get_ip()
payload = {
    "message": "Emergency SOS alert test triggered directly from script",
    "ip": ip,
    "targetNumber": TARGET_NUMBER
}

print("Sending POST request to backend...")
try:
    response = requests.post(f"{SERVER_URL}/api/sos/trigger", json=payload, timeout=10)
    if response.status_code == 200:
        print("✅ Success: SOS alert sent to backend!")
        print(f"   Call SID: {response.json().get('callSid')}")
    else:
        print(f"❌ Failed: Server returned {response.status_code} - {response.text}")
except Exception as e:
    print(f"❌ Connection Error: Could not reach backend server at {SERVER_URL}")
    print(f"   Details: {e}")
