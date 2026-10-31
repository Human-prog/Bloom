with open('C:\\Users\\Arega\\Desktop\\Projects\\bloom-notch-app\\bloom-notch.html', 'rb') as f:
    data = f.read()
    # Find tab-btn in binary
    needle = b'tab-btn'
    idx = data.find(needle)
    print('First tab-btn in bytes at:', idx)
    if idx >= 0:
        snippet = data[max(0, idx-50):idx+250]
        try:
            print('Snippet (decoded):', snippet.decode('latin-1'))
        except:
            print('Snippet (bytes):', snippet)
