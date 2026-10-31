import os
for root, dirs, files in os.walk('node_modules/electron'):
    for f in files:
        if f.endswith('.exe') or f == 'electron' or 'electron' in f:
            print(os.path.join(root, f))
