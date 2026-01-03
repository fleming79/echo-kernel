import base64
import json
import pathlib

folder = pathlib.Path(__file__).parent
cfg = folder.joinpath('src', 'defaults.json')
data = json.loads(cfg.read_bytes())

img_data = folder.joinpath("logo.svg").read_bytes()
# Convert logo from bytes to base64
data['logo'] = "data:image/svg+xml;base64," + base64.b64encode(img_data).decode()
cfg.write_text(json.dumps(data, indent=2) + "\n")