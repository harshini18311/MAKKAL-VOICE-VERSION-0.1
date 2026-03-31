import keyboard
import requests
import socket
import time
import os
import sys
from dotenv import load_dotenv

# Load configuration
load_dotenv('backend/.env')

# Use SOS_TARGET_NUMBER if defined, otherwise fallback to TWILIO_PHONE_NUMBER (self-test)
TARGET_NUMBER = os.getenv('SOS_TARGET_NUMBER') or os.getenv('TWILIO_PHONE_NUMBER')
SERVER_URL = 'http://localhost:5000'

print("--- SOS Global Hotkey Listener ---")
print(f"Server URL: {SERVER_URL}")
print(f"Target Number: {TARGET_NUMBER}")
print("---------------------------------")
print("Shortcuts:")
print("  Alt + Shift + S  : Trigger Emergency SOS")
print("  Alt + Shift + W  : Stop Listener")
print("---------------------------------")

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
        s.close()
        return IP
    except Exception as e:
        print(f"Error getting IP: {e}")
        return '127.0.0.1'

def trigger_sos():
    print("\n[EVENT] Hotkey detected! Processing SOS trigger...")
    
    if not TARGET_NUMBER:
        print("❌ Error: TARGET_NUMBER not found in .env. Please set SOS_TARGET_NUMBER.")
        return

    ip = get_ip()
    print(f"[ACTION] Triggering SOS from IP: {ip} to {TARGET_NUMBER}...")
    
    try:
        payload = {
            "message": "Emergency SOS alert from citizen terminal",
            "ip": ip,
            "targetNumber": TARGET_NUMBER
        }
        print(f"[DEBUG] POST {SERVER_URL}/api/sos/trigger with payload: {payload}")
        
        response = requests.post(f"{SERVER_URL}/api/sos/trigger", json=payload, timeout=5)
        
        if response.status_code == 200:
            print("✅ Success: SOS alert sent to backend!")
            print(f"   Call SID: {response.json().get('callSid')}")
        else:
            print(f"❌ Failed: Server returned {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Connection Error: Could not reach backend server at {SERVER_URL}")
        print(f"   Details: {e}")

# Use add_hotkey for better global reliability on Windows
try:
    keyboard.add_hotkey('alt+shift+s', trigger_sos)
    print("✅ Hotkey 'Alt + Shift + S' registered.")
except Exception as e:
    print(f"❌ Error registering hotkey: {e}")
    sys.exit(1)

print("Listening for hotkeys... (Press Alt+Shift+W to exit)")
keyboard.wait('alt+shift+w')
print("Stopping listener...")
