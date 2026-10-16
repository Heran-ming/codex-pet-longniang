"""Slice real generated keyframes and the original atlas into VP9-alpha loops."""
from __future__ import annotations
import hashlib
import argparse
import json
from pathlib import Path
import statistics
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--hd', action='store_true', help='Render directly from source cells into 1280x720 VP9-alpha.')
parser.add_argument('--preserve-config', action='store_true', help='Re-encode assets without overwriting saved preferences/configuration.')
parser.add_argument('--smooth', action='store_true', help='24fps motion-compensated in-betweens at a relaxed 2.4-keyframes-per-second pace.')
parser.add_argument('--interactions-only', action='store_true', help='Only append/rebuild the look-up and smirk interactions.')
args = parser.parse_args()
SCALE = 2 if args.hd else 1
VIDEO_W, VIDEO_H = 640*SCALE, 360*SCALE
CRF = 10 if args.hd else 27
FPS = 24 if args.smooth else 6
STEPS = 10 if args.smooth else 1
sys.path.insert(0, str(ROOT / "build-deps"))
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw
if args.smooth:
    from motion_tween import inbetweens

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ASSETS = ROOT / "assets"
OUT = ROOT / "data" / "dsh-pet" / "main-animation" / "webm"
PREVIEWS = ASSETS / "previews"
OUT.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(parents=True, exist_ok=True)

# Each item references an actual different row of illustrated keyframes.
GROUPS = {
 "lifestyle": [
  ("tea", "慢慢喝茶", "生活", "捧起小茶杯，喝一口再眯眼微笑。"),
  ("cookie", "吃块饼干", "生活", "小口咬饼干，鼓起脸颊慢慢嚼。"),
  ("reading", "认真看书", "生活", "捧着小书翻页，偶尔抬头想一想。"),
  ("nap", "坐着打盹", "生活", "坐下来打个盹，脑袋轻轻一点。"),
 ],
 "play": [
  ("gaming", "掌机时间", "玩耍", "抱起掌机，认真操作又偷偷开心。"),
  ("bubbles", "吹小泡泡", "玩耍", "吹出几颗透明泡泡，再目送它们飘起。"),
  ("cube", "转转魔方", "玩耍", "转动小魔方，想通时露出笑容。"),
  ("dance", "开心跳舞", "玩耍", "小步摆动，挥手跳一支轻快的舞。"),
 ],
 "affection": [
  ("heart", "送你一颗心", "亲昵", "双手比心，送出一点粉色的喜欢。"),
  ("gift", "打开小礼物", "亲昵", "掀开礼物盒，看见亮闪闪的小惊喜。"),
  ("plush", "抱抱小玩偶", "亲昵", "抱紧小龙玩偶，用脸颊轻轻蹭一蹭。"),
  ("magic", "星星小魔法", "亲昵", "挥动小魔杖，画出一串紫色星光。"),
 ],
 "quiet": [
  ("journal", "写写小手账", "慢时光", "捧着手账本，记下今天的一点小事。"),
  ("flower", "照顾小花", "慢时光", "捧起一盆小花，轻轻打理花叶。"),
  ("music", "戴耳机听歌", "慢时光", "戴好耳机，跟着节拍轻轻晃脑袋。"),
  ("stretch", "哈欠伸懒腰", "慢时光", "捂嘴打个哈欠，再伸一个小小懒腰。"),
 ],
 "celebration": [
  ("cake", "吹蜡烛许愿", "小庆祝", "捧着小蛋糕，闭眼吹灭一根蜡烛。"),
  ("balloon", "吹起小气球", "小庆祝", "鼓起脸颊吹气球，让它在手边晃一晃。"),
  ("pumpkin", "南瓜灯微光", "小庆祝", "提起小南瓜灯，看着它暖暖地发光。"),
  ("lantern", "提一盏红灯", "小庆祝", "轻轻摇动红灯笼，把一点暖意带过来。"),
 ],
 "outdoor": [
  ("umbrella", "撑开小花伞", "小冒险", "撑起一把花伞，歪头看看伞外。"),
  ("rope", "原地跳跳绳", "小冒险", "摇起跳绳，在原地轻轻跳跃。"),
  ("plane", "纸飞机飞一下", "小冒险", "把纸飞机轻轻送出，再伸手接住。"),
  ("binoculars", "望远镜探险", "小冒险", "举起小望远镜，向两边好奇地看。"),
 ],
}
BASE = [
 ("idle", "安静陪着你", "日常", 0, 6),
 ("run-right", "向右小跑", "日常", 1, 8),
 ("run-left", "向左小跑", "日常", 2, 8),
 ("wave", "挥手打招呼", "日常", 3, 4),
 ("greet", "笑着招招手", "日常", 4, 5),
 ("encourage", "遇到小困难", "工作表情", 5, 8),
 ("waiting", "歪头等你", "工作表情", 6, 6),
 ("working", "抱电脑敲键盘", "工作表情", 7, 6),
 ("cheer", "拍手说真棒", "工作表情", 8, 6),
]
catalog = []
health = []
if args.interactions_only:
    catalog = [item for item in json.loads((ROOT/'catalog.json').read_text(encoding='utf-8'))['actions'] if item['id'] not in {'look-up','smirk'}]
    health = [item for item in json.loads((ROOT/'asset-validation.json').read_text(encoding='utf-8')) if item['id'] not in {'look-up','smirk'}]

def row_bounds(im):
    """Use nearby empty gutters rather than cutting feet on a rigid grid."""
    alpha = np.asarray(im.getchannel("A"))
    activity = (alpha > 24).sum(axis=1)
    height = im.height
    boundaries = [0]
    for n in range(1, 4):
        center = round(height * n / 4)
        radius = round(height * .027)
        low, high = center-radius, center+radius
        scores = activity[low:high+1]
        minimum = int(scores.min())
        candidates = np.flatnonzero(scores <= minimum + 2) + low
        boundaries.append(int(candidates[np.argmin(abs(candidates-center))]))
    return boundaries + [height]

def normalize(cells, body_scale=1):
    """Keep one common scale per action; all clips share the same floor."""
    boxes = [cell.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox() for cell in cells]
    if any(box is None for box in boxes):
        raise ValueError("An action contains an empty frame.")
    feet = statistics.median(box[3] for box in boxes)
    # Standing size is determined by the cell height, not a prop's silhouette.
    scale = 288*SCALE*body_scale / cells[0].height
    width = round(cells[0].width * scale)
    height = round(cells[0].height * scale)
    left = round(320*SCALE - width / 2)
    top = round(330*SCALE - feet * scale)
    result = []
    for cell in cells:
        canvas = Image.new("RGBA", (VIDEO_W, VIDEO_H))
        canvas.alpha_composite(cell.resize((width, height), Image.Resampling.LANCZOS), (left, top))
        result.append(canvas)
    return result

def encode(slug, name, category, description, cells, source, pingpong=False, repeat_count=None, body_scale=1):
    frames = normalize(cells, body_scale)
    thumb = frames[0].crop((192*SCALE, 24*SCALE, 448*SCALE, 344*SCALE))
    thumb.save(PREVIEWS / (slug + ".png"))
    # These are genuine illustrated keyframes. Do not count repeated frames
    # or mirrored playback as additional actions.
    sequence = frames + frames[-2:0:-1] if pingpong else frames
    repeats = repeat_count if repeat_count is not None else max(2, round(32 / len(sequence)))
    sequence = sequence * repeats
    file = OUT / (name + ".webm")
    command = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", f"{VIDEO_W}x{VIDEO_H}",
        "-framerate", str(FPS), "-i", "pipe:0", "-an",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-b:v", "0", "-crf", str(CRF), "-deadline", "realtime", "-cpu-used", "6",
        "-auto-alt-ref", "0", "-metadata", "alpha_mode=1", str(file)
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    tween_cache = {}
    for index, frame in enumerate(sequence):
        if not args.smooth:
            process.stdin.write(frame.tobytes())
            continue
        # Reuse offline motion-compensated in-betweens across repeated loops.
        # These improve display motion without claiming new illustrated poses.
        end = sequence[(index+1) % len(sequence)]
        key = (id(frame), id(end))
        if key not in tween_cache:
            tween_cache[key] = inbetweens(frame, end, STEPS)
        for tween in tween_cache[key]:
            process.stdin.write(tween.tobytes())
    process.stdin.close()
    errors = process.stderr.read().decode("utf-8", "replace")
    code = process.wait()
    if code:
        raise RuntimeError(name + ": " + errors)
    unique = len({hashlib.sha256(frame.tobytes()).digest() for frame in frames})
    if unique < 2:
        raise ValueError(name + " has no animation.")
    record = {
      "id": slug, "name": name, "category": category, "description": description,
      "file": name + ".webm", "preview": "/assets/previews/" + slug + ".png",
      "source": source, "keyframes": len(frames), "distinctKeyframes": unique,
      "duration": round(len(sequence)*STEPS / FPS, 3), "bytes": file.stat().st_size,
      "width": VIDEO_W, "height": VIDEO_H, "fps": FPS, "crf": CRF,
      "displayFrames": len(sequence)*STEPS,
      "interpolation": "bidirectional DIS motion compensation with alpha" if args.smooth else "none",
      "keyframePace": FPS/STEPS,
      "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
    }
    catalog.append(record)
    health.append({"id": slug, "keyframes": len(frames), "distinct": unique, "alphaExtrema": frames[0].getchannel("A").getextrema()})
    print("Encoded", name, len(frames), "keyframes", flush=True)

if not args.interactions_only:
    for sheet, actions in GROUPS.items():
        im = Image.open(ASSETS / "generated" / (sheet + ".png")).convert("RGBA")
        if im.getchannel("A").getextrema()[0] != 0:
            raise ValueError(sheet + " is not transparent.")
        boundaries = row_bounds(im)
        for row, (slug, name, category, description) in enumerate(actions):
            cells = [im.crop((round(col*im.width/8), boundaries[row],
                             round((col+1)*im.width/8), boundaries[row+1])) for col in range(8)]
            encode(slug, name, category, description, cells, "imagegen / " + sheet,
                   pingpong=slug in {"balloon", "gift", "cake"})

original = Image.open(ASSETS / "base" / "spritesheet.webp").convert("RGBA")
if not args.interactions_only:
    for slug, name, category, row, count in BASE:
        cells = [original.crop((col*192, row*208, (col+1)*192, (row+1)*208)) for col in range(count)]
        encode(slug, name, category, "沿用原 GPT娘资源包的 " + name + " 动画。", cells, "weit0529/gpt-pet")
    look = [original.crop((col*192, row*208, (col+1)*192, (row+1)*208)) for row in (9, 10) for col in range(8)]
    encode("looking", "四处看一看", "日常", "16 个原有方向姿态组成的观察动画。", look, "weit0529/gpt-pet")
if args.interactions_only or (ASSETS/'interaction/smirk-sheet.png').exists():
    up = [original.crop((col*192,row*208,(col+1)*192,(row+1)*208)) for row,col in [(9,0),(10,7),(9,0),(9,1)]]
    encode('look-up','抬头看气泡','互动表情','气泡出现时抬起头，轻轻看向上方。',up,'weit0529/gpt-pet / upward look',repeat_count=1)
    smirk_file = ASSETS/'interaction/smirk-sheet.png'
    if not smirk_file.exists(): raise FileNotFoundError('The smirk animation sheet is required.')
    im = Image.open(smirk_file).convert('RGBA')
    cells = [im.crop((round(col*im.width/4),round(row*im.height/2),round((col+1)*im.width/4),round((row+1)*im.height/2))) for row in range(2) for col in range(4)]
    def alpha_height(cell):
        box=cell.getchannel('A').point(lambda a:255 if a>24 else 0).getbbox()
        return box[3]-box[1]
    target_ratio=alpha_height(original.crop((0,0,192,208)))/208
    current_ratio=statistics.median(alpha_height(cell) for cell in cells)/cells[0].height
    encode('smirk','本小姐的坏笑','互动表情','眯眼坏笑，轻轻点着下巴展示额度。',cells,'imagegen / smirk interaction',repeat_count=1,body_scale=target_ratio/current_ratio)

# The default main entry is wholly our GPT pack: no blue-maid fallback clips.
categories = []
for group in dict.fromkeys(item["category"] for item in catalog):
    categories.append({"id": group, "weight": 0 if group == '互动表情' else 14 if group != "工作表情" else 3,
                       "actions": [item["name"] for item in catalog if item["category"] == group],
                       "noMirror": True})
configuration = {
 "notificationsEnabled": False,
 "confineToScreen": True,
 "physics": {"gravity": 1100, "restitution": .58, "groundFriction": 3.5,
             "ceilingBounce": True, "throwPower": .85, "petCollision": False},
 "whisperPrompt": "白发紫瞳的小龙娘，安静地陪你工作。",
 "whisperImageEnabled": False, "chatImageEnabled": False, "chatImageLimit": 0,
 "chatMemoryRounds": 0, "whisperModel": {"provider": "", "model": ""},
 "chatModel": {"provider": "", "model": ""}, "memes": {},
 "pets": [{"name": "GPT娘", "id": "main", "size": 430, "balanceEnabled": False,
           "whisperEnabled": False, "workStatusEnabled": False, "fixedEnabled": False,
           "display": "desktop", "position": {"corner": "bottom-right", "marginX": 70, "marginY": 40}}],
 "animations": {
   "idle": ["安静陪着你"], "turn": ["四处看一看"], "drag": ["挥手打招呼"],
   "clicks": ["送你一颗心", "笑着招招手", "抱抱小玩偶", "拍手说真棒", "开心跳舞"],
   "moves": {"default": {"minDist": 45, "maxDist": 140, "margin": 24, "leadSec": .3, "tailSec": .3},
             "actions": [{"name": "向右小跑"}]},
   "categories": categories,
   "events": {"balance": [], "whisper": [], "workStatus": []}},
 "eventsRefreshSec": {"balance": 1800, "whisper": 300},
 "animationWeights": {"idle": 24, "turn": 4, "move": 6},
}
config_path = ROOT / "data" / "dsh-pet" / "main-config.jsonc"
if not args.preserve_config:
    config_path.write_text(json.dumps(configuration, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "default-config.json").write_text(json.dumps(configuration, ensure_ascii=False, indent=2), encoding="utf-8")
new_count = sum(item['source'].startswith('imagegen') for item in catalog)
document = {"title": "GPT娘 · 独立桌宠", "version": "1.3.0", "count": len(catalog),
            "newActions": new_count, "originalActions": len(catalog)-new_count,
            "description": "原有日常动作与抬头、坏笑互动。表情贴纸单独计数。",
            "actions": catalog}
(ROOT / "catalog.json").write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
(ROOT / "asset-validation.json").write_text(json.dumps(health, ensure_ascii=False, indent=2), encoding="utf-8")
icon = Image.open(PREVIEWS / "idle.png")
icon.save(ASSETS / "pet.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(json.dumps({"actions": len(catalog), "new":new_count, "original":len(catalog)-new_count, "directory":str(OUT)}, ensure_ascii=False))
