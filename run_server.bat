@echo off
chcp 65001 > nul
title OCTAMAN MANET Emulator Server (Version 1)

echo ================================================================
echo           OCTAMAN MANET EMULATOR & LOCAL SERVER (V1)
echo ================================================================
echo.
echo [1] Starting Octaman Server on http://localhost:8000 ...
echo [2] Octagon Web App UI:       http://localhost:8000/client
echo [3] Octaman Server Dashboard: http://localhost:8000/dashboard
echo.
echo Press Ctrl+C in this terminal to stop the server.
echo ================================================================
echo.

python server.py

pause
