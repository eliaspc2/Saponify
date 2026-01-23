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
echo Preview aberto noutra janela.
echo Fecha-a e prime qualquer tecla para reiniciar o ciclo.
pause

echo.
echo A reiniciar o ciclo...
echo.
goto LOOP
