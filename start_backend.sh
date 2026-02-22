#!/bin/bash
cd "$(dirname "$0")/backend"
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
