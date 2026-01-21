@echo off

call npm run build || exit /b
git push origin main
git push gitlab main

npm run preview
exit

