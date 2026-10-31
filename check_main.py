with open('C:\\Users\\Arega\\Desktop\\Projects\\bloom-notch-app\\main.js', 'r', encoding='utf-8') as f:
    content = f.read()
print('Length:', len(content))
lines = content.splitlines()
print('Lines:', len(lines))
for i in range(min(10, len(lines))):
    print(i+1, ':', lines[i])
print('...')
for i in range(max(0, len(lines)-5), len(lines)):
    print(i+1, ':', lines[i])
