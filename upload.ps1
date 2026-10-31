# Standalone upload to Human-prog/Bloom (clean history)
mkdir C:\temp\bloom-upload 2>$null
# copy only bloom-notch-app folder contents
$items = Get-ChildItem -Path $PSScriptRoot -Exclude @('dist','node_modules','.git','target','build','release')
Copy-Item -Path $items.FullName -Destination C:\temp\bloom-upload\ -Recurse -Force
git -C C:\temp\bloom-upload init
git -C C:\temp\bloom-upload config user.name "Arega"
git -C C:\temp\bloom-upload config user.email "arega@example.com"
git -C C:\temp\bloom-upload add .
git -C C:\temp\bloom-upload commit -m 'Bloom Notch overlay: Spotify/Notion APIs, custom plugin, installer/portable builds. AI-assisted.'
git -C C:\temp\bloom-upload remote add origin https://github.com/Human-prog/Bloom.git 2>$null
git -C C:\temp\bloom-upload branch -M main
git -C C:\temp\bloom-upload push -f origin main
