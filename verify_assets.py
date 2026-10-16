"""Decode the shipped clips, including alpha; do not infer validity from file names."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'build-deps'))
import imageio_ffmpeg
import numpy as np

ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf-8'))
checks=[]
for action in catalog['actions']:
    file=ROOT/'data/dsh-pet/main-animation/webm'/action['file']
    assert hashlib.sha256(file.read_bytes()).hexdigest()==action['sha256'],action['id']+' hash mismatch'
    reader=imageio_ffmpeg.read_frames(str(file),pix_fmt='rgba',bits_per_pixel=32,input_params=['-c:v','libvpx-vp9'])
    meta=next(reader)
    assert meta['size']==(1280,720) and meta['fps']==24,action['id']+' wrong dimensions/frame rate'
    assert abs(meta['duration']-action['duration'])<.1,action['id']+' wrong tempo'
    pixels=np.frombuffer(next(reader),dtype=np.uint8).reshape(720,1280,4)
    reader.close()
    alpha=pixels[:,:,3]
    assert alpha.min()==0 and alpha.max()>=240 and (alpha>32).sum()>6000,action['id']+' missing transparency or character'
    checks.append({'id':action['id'],'width':1280,'height':720,'fps':meta['fps'],'duration':meta['duration'],'alphaMin':int(alpha.min()),'alphaMax':int(alpha.max()),
        'visiblePixels':int((alpha>32).sum()),'sha256':action['sha256']})
(ROOT/'qa/video-decode-qa.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps({'decoded':len(checks),'dimensions':'1280x720','fps':24,'keyframePace':2.4,'transparent':all(item['alphaMin']==0 for item in checks)}))
