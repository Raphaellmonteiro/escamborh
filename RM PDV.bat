@echo off
title RM PDV - Iniciando Sistema

echo Iniciando RM PDV...

cd /d "C:\Users\aveng\Desktop\Raphaell\PROJETO\PDV RM"

echo Ligando servidor...
start cmd /k npm run dev

timeout /t 6

echo Abrindo sistema no Google Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3001

echo Sistema RM PDV iniciado com sucesso!