#!/bin/bash
if [ "$1" == "backend" ]; then
    echo "📋 Backend Logs (last 50 lines):"
    sudo journalctl -u speiseplaner-backend.service -n 50 --no-pager
elif [ "$1" == "frontend" ]; then
    echo "📋 Frontend Logs (last 50 lines):"
    sudo journalctl -u speiseplaner-frontend.service -n 50 --no-pager
elif [ "$1" == "follow" ]; then
    echo "📋 Following both services (Ctrl+C to stop):"
    sudo journalctl -u speiseplaner-backend.service -u speiseplaner-frontend.service -f
else
    echo "Usage: ./service-logs.sh [backend|frontend|follow]"
    echo ""
    echo "Examples:"
    echo "  ./service-logs.sh backend   # Show backend logs"
    echo "  ./service-logs.sh frontend  # Show frontend logs"
    echo "  ./service-logs.sh follow    # Follow both logs live"
fi
