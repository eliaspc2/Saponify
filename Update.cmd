@echo off

:LOOP
call npm run build || exit /b
echo Build concluído.
pause

git push origin main
git push gitlab main

echo Deploy concluído.

cmd /c npm run preview

echo.
echo A reiniciar o ciclo...
echo.
goto LOOP
