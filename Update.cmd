@echo off

call npm run build || exit /b
echo Build concluído.
pause

git push origin main
git push gitlab main

echo Deploy concluído.

npm run preview
exit

