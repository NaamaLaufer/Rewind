"""Download classic public test sequences (Xiph 'derf' collection) for the crop experiment."""
import os
import sys
import urllib.request

BASE = "https://media.xiph.org/video/derf/y4m/"
NAMES = ["grandma_qcif.y4m", "claire_qcif.y4m", "mother_daughter_cif.y4m", "foreman_cif.y4m",
         "carphone_qcif.y4m", "suzie_qcif.y4m", "salesman_qcif.y4m", "news_cif.y4m"]
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for n in NAMES:
    dst = os.path.join(out, n)
    if not os.path.exists(dst):
        try:
            urllib.request.urlretrieve(BASE + n, dst)
            print("ok", n, os.path.getsize(dst))
        except Exception as e:  # noqa: BLE001
            print("fail", n, e)
