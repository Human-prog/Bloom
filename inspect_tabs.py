import re
with open('C:\\Users\\Arega\\Desktop\\Projects\\bloom-notch-app\\bloom-notch.html', 'r', encoding='utf-8') as f:
    html = f.read()
for m in re.finditer(r'<button[^>]*class="[^"]*tab-btn[^"]*"[^>]*>.*?</button>', html):
    snippet = m.group(0)
    if len(snippet) > 200:
        snippet = snippet[:200] + '...'
    print('Found:', snippet)
print('Total matches:', len(re.findall(r'<button[^>]*tab-btn', html)))
