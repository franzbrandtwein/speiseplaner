#!/bin/bash
case "$1" in
    backend)
        sudo journalctl -u kochplaner-backend -f
        ;;
    frontend)
        sudo journalctl -u kochplaner-frontend -f
        ;;
    *)
        echo "Verwendung: ./logs.sh [backend|frontend]"
        echo ""
        echo "Letzte Backend-Logs:"
        sudo journalctl -u kochplaner-backend --no-pager -n 20
        echo ""
        echo "Letzte Frontend-Logs:"
        sudo journalctl -u kochplaner-frontend --no-pager -n 20
        ;;
esac
