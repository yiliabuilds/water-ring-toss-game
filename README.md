# 💧 Water Ring Toss · 水中套圈游戏机

A retro handheld **water ring toss** game, rebuilt for the web with pure HTML / CSS / JavaScript — no frameworks, no build tools, no audio files (all music & sound effects are synthesized with the Web Audio API).

复刻小时候的水中套圈游戏机：红色复古塑料机身、热带鱼、12 个圈、左右吹气按钮、60 秒一局。

## 🎮 How to Play / 玩法

1. Press **开始游戏** — the round lasts **60 seconds**
2. The 12 rings drift slowly on their own in the water, **but they can never float above the pole tips by themselves**
3. **Hold** the left / right rotary pump knob to blow an air jet from the bottom and push rings up over a pole tip — **while holding, circle your finger on the knob to steer the jet angle** (the faint jet cone in the water shows where it points). Blowing and steering are one gesture, like a game controller
4. Line a ring up and let it drop onto a pole to score
5. Score **6 or more** rings for the victory ending — fewer rings gets the other (sad trombone) ending!

**Controls**
- Mouse / touch: hold the blue (left) or yellow (right) pump knob; drag in a circle on it to change the jet angle (30°–75°, default 55°)
- Keyboard: hold `A` / `←` for the left jet, `D` / `→` for the right jet
- `Space`: start / restart
- A small always-on air vent between the two poles keeps the water moving (too weak to score on its own)
- **♪ BGM 开/关** and **🔊 音效 开/关** are separate toggles at the top
- If a browser blocks sound, a yellow **🔊 点我开启声音** button appears — tap it once and the audio unlocks (works around iOS Safari / WeChat webview autoplay rules)

## ✨ Features

- 🐠 3 animated tropical fish (clownfish, blue tang, yellow fish) swimming in the tank
- 💍 12 rings with water physics: drift, sinking, jet lift, pole bounce & landing detection
- 🎵 Synthesized sound, no audio files: a slow, gentle BGM of cross-fading pad chords (no plucked notes), a soft jet-air noise while blowing, a chime when a ring scores, a countdown sound only in the last 10 seconds, and two different ending jingles (many rings vs. few rings). No repetitive beeps — pole hits and falling rings are silent
- ⏱️ 60-second rounds with a retro LCD timer & score display
- 🧱 Retro plastic-grain texture and subtle pixel/mosaic styling
- 📱 Works on desktop and mobile, deploys to GitHub Pages as-is

## 🚀 Run Locally

```bash
git clone https://github.com/YOUR-USERNAME/water-ring-toss-game.git
cd water-ring-toss-game
python3 -m http.server 8000
# visit http://localhost:8000  (or just open index.html)
```

## 🌐 Deploy to GitHub Pages

1. Push this repo to GitHub
2. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `/ (root)`
3. Your game is live at `https://YOUR-USERNAME.github.io/water-ring-toss-game/`

## 📁 Structure

```
water-ring-toss-game/
├── index.html   # retro machine shell & layout
├── style.css    # plastic body, LCD, pump buttons
├── script.js    # physics, fish, canvas drawing, BGM & SFX (Web Audio)
├── README.md
└── LICENSE
```

## 📄 License

MIT — feel free to use, modify and share.

Made with ❤️ by xing & Rumi

## 玩法版本（首页选择）

- **普通版**：经典玩法。12 个圈在水里自己飘，但飘不到杆顶，按住吹气把圈吹过杆尖套进去。60 秒内套中 6 个以上胜利。BGM 是原来那首慢悠悠的和弦。
- **移动版**：两根杆子左右来回移动，等杆子移到圈的上方再吹气，套中更难。已套住的圈会跟着杆子一起移动。BGM 是快节奏的“你追我赶”。
- **无敌版**：20 个圈，试试就知道！最后 6 秒，4 个圈会自己从水里飞起来、越过杆尖套上去，不管之前套中几个，结尾都是“玩家无敌了！”。BGM 是欢快偷着乐的调子（比普通版快，还有低音弹跳和亮晶晶的高音）。

长按页面任何地方都不会选中文字、不会弹出复制粘贴菜单（`user-select: none` + `selectstart`/`contextmenu` 拦截）。各版本音效不变，只有 BGM 不同。

v8.3（2026-11-16）：无敌版最后 6 秒的圈现在是真的飞上天（从水里冲起来、越过杆尖再落下），之前只是沉到杆底、几乎看不出来；无敌版 BGM 更欢快了（更快 + 低音弹跳 + 更亮的高音），和普通版一听就能分开。`index.html` 引用了 `script.js?v=8.3` / `style.css?v=8.3`，重新上传后浏览器会直接取新文件，不会被旧缓存挡住。

v8.4（2026-11-16）：（1）无敌版最后 6 秒现在是**所有**剩下的圈一起飞，两根杆子各分一半，不会再只飞一侧；（2）无敌版 BGM 加了一段真正欢快的小旋律（五声音阶小调子，软绵绵的正弦音，不会滴答响），终于和普通版完全不一样了；（3）最左 / 最右的圈以前吹不到：喷嘴往两边挪了、气流变宽了，水流还会把贴边的圈慢慢推回中间。
## 首页 / 关闭

顶部有 🏠 首页和 ✕ 关闭两个按钮，不用等 60 秒、不用关网页。首页会立刻结束本局，回到版本选择画面；关闭会尝试关掉页面，浏览器不让关时就显示“游戏已关闭”画面，点“重新打开游戏”回到首页。
