with open('C:\\Users\\Arega\\Desktop\\Projects\\bloom-notch-app\\bloom-notch.html', 'rb') as f:
    data = f.read()
    # Find Spotify button text
    for keyword in [b'Spotify', b'Calendar', b'Apps', b'Notifs', b'Shelf']:
        idx = data.find(keyword)
        print(keyword.decode('ascii'), 'at byte', idx)
        if idx >= 0:
            snippet = data[max(0, idx-100):idx+150]
            try:
                print('  ->', snippet.decode('latin-1')[:200])
            except:
                pass
