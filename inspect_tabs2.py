with open('C:\\Users\\Arega\\Desktop\\Projects\\bloom-notch-app\\bloom-notch.html', 'r', encoding='utf-8') as f:
    html = f.read()
idx = html.find('tab-btn')
print('First tab-btn at char:', idx)
if idx > 0:
    print('Snippet:', html[max(0, idx-20):idx+300])
