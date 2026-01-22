@echo off

call npm run build || exit /b

git push origin main
git push gitlab main

echo Deploy concluído.

npm run preview
exit

