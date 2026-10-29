"""Tiny image I/O over ffmpeg + numpy (Blender's bundled python has numpy, no PIL).
Run with: /Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13 -I uncle-van-ref/<x>.py"""
import json
import os
import subprocess
import numpy as np

# The board photos are third-party (BaT): reference only, NEVER committed.  They live in the
# git-invisible wip/uncle-van/ref/ of the checkout (board/ = the 8, gallery/ = all 148), and the
# overlay rounds go to wip/uncle-van/out/.
WIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "wip", "uncle-van")


def size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height", "-of", "json", path], capture_output=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    return s["width"], s["height"]


def load(path):
    w, h = size(path)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3).copy()


def load_rgba(path):
    w, h = size(path)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 4).copy()


def save(a, path):
    a = np.ascontiguousarray(a.astype(np.uint8))
    h, w = a.shape[:2]
    fmt = "rgb24" if a.shape[2] == 3 else "rgba"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", fmt, "-s", f"{w}x{h}",
                    "-i", "-", path], input=a.tobytes(), check=True)


def grid(a, x0, y0, step=50, major=100):
    """Draw a grid aligned to ORIGINAL pixel coords (crop origin x0, y0): yellow every `step`,
    red every `major`."""
    h, w = a.shape[:2]
    for gx in range((x0 // step + 1) * step, x0 + w, step):
        a[:, gx - x0] = (255, 40, 40) if gx % major == 0 else (255, 230, 0)
    for gy in range((y0 // step + 1) * step, y0 + h, step):
        a[gy - y0, :] = (255, 40, 40) if gy % major == 0 else (255, 230, 0)
    return a
